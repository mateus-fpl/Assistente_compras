document.addEventListener('DOMContentLoaded', function () {
    const btnMelhor = document.getElementById('btn-melhor-link');
    const btnGoogle = document.getElementById('btn-comparar');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { acao: "get_data" }, async function (response) {

            if (!response) return;

            // 🔹 Exibição
            const nomeExibicao = response.produto.replace(/[^\w\s]/gi, ' ').trim();
            document.getElementById('nome').innerText = nomeExibicao;
            document.getElementById('preco').innerText = response.preco;

            // 🔥 IA extrai produto principal
            const buscaEssencial = await extrairBuscaComIA(nomeExibicao);

            console.log("Busca IA:", buscaEssencial);

            // 🔹 Google Shopping
            btnGoogle.onclick = () => {
                chrome.tabs.create({
                    url: `https://www.google.com.br/search?q=${encodeURIComponent(buscaEssencial)}&tbm=shop`
                });
            };

            buscarEconomiaReal(buscaEssencial);
        });
    });

    // ==============================
    // 🤖 IA
    // ==============================
    async function extrairBuscaComIA(nomeProduto) {
        try {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer SUA_API_KEY_AQUI"
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "Extraia o produto principal de um título de e-commerce. Ignore brindes, combos, assinaturas e acessórios. Responda apenas JSON: {\"busca\": \"...\"}"
                        },
                        {
                            role: "user",
                            content: `Produto: ${nomeProduto}`
                        }
                    ],
                    temperature: 0.2
                })
            });

            const data = await response.json();
            const texto = data.choices?.[0]?.message?.content;

            console.log("Resposta IA:", texto);

            const json = JSON.parse(texto);

            return json.busca || nomeProduto;

        } catch (e) {
            console.error("Erro IA:", e);
            return nomeProduto;
        }
    }

    // ==============================
    // 🔍 MERCADO LIVRE
    // ==============================
    async function buscarEconomiaReal(nomeBusca) {
        const query = encodeURIComponent(nomeBusca);

        try {
            const res = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${query}&limit=10`);
            const data = await res.json();

            if (!data.results || data.results.length === 0) {
                throw new Error("Sem resultados");
            }

            const listaFiltrada = data.results.filter(p => {
                if (!p.price || !p.permalink) return false;

                const link = p.permalink.toLowerCase();
                const titulo = p.title.toLowerCase();

                // ❌ remove páginas genéricas
                if (link.includes('/perfil') || link.includes('official-store')) return false;

                // ❌ remove itens sem catálogo
                if (!p.catalog_product_id) return false;

                // ❌ remove lixo
                if (
                    titulo.includes('capa') ||
                    titulo.includes('case') ||
                    titulo.includes('pelicula') ||
                    titulo.includes('adesivo') ||
                    titulo.includes('somente') ||
                    titulo.includes('apenas') ||
                    titulo.includes('controle') ||
                    titulo.includes('suporte')
                ) return false;

                return true;
            });

            if (listaFiltrada.length === 0) {
                throw new Error("Sem produtos válidos");
            }

            const melhor = listaFiltrada
                .sort((a, b) => {
                    // prioriza títulos mais completos
                    if (b.title.length !== a.title.length) {
                        return b.title.length - a.title.length;
                    }
                    return a.price - b.price;
                })[0];

            const valor = melhor.price.toLocaleString('pt-BR');
            const linkFinal = melhor.permalink;

            btnMelhor.innerHTML = `
                <span class="sub-texto">💰 MELHOR OFERTA</span>
                <span class="principal-texto">R$ ${valor}</span>
            `;

            btnMelhor.onclick = () => {
                chrome.tabs.create({ url: linkFinal });
            };

        } catch (e) {
            console.error("Erro busca:", e);

            btnMelhor.innerHTML = `
                <span class="sub-texto">⚠️ VER MAIS OPÇÕES</span>
                <span class="principal-texto">Abrir no Mercado Livre</span>
            `;

            btnMelhor.onclick = () => {
                chrome.tabs.create({
                    url: `https://lista.mercadolivre.com.br/${query}`
                });
            };
        }
    }
});