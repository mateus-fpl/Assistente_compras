document.addEventListener('DOMContentLoaded', function () {
    const btnMelhor = document.getElementById('btn-melhor-link');
    const btnGoogle = document.getElementById('btn-comparar');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { acao: "get_data" }, async function (response) {
            if (!response) return;

            // Atualiza a interface básica
            document.getElementById('nome').innerText = response.produto;
            document.getElementById('preco').innerText = response.preco;

            // 1. Configura o botão do Google (Sempre útil)
            btnGoogle.onclick = () => {
                chrome.tabs.create({
                    url: `https://www.google.com.br/search?q=${encodeURIComponent(response.produto)}&tbm=shop`
                });
            };

            // 2. MÁGICA: Independente de onde estamos, pedimos pro Python tentar o link de lucro
            // Passamos o objeto 'response' inteiro (contém mlb_id, ean, produto, preco)
            buscarLinkNoPython(response);
        });
    });

    async function buscarLinkNoPython(dados) {
        try {
            // Pegamos a URL da aba ativa
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Avisamos o usuário que estamos trabalhando
            btnMelhor.innerHTML = `<span class="sub-texto">🔍 ANALISANDO OFERTAS...</span>`;

            const res = await fetch("http://localhost:5000/gerar_link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mlb_id: dados.mlb_id,
                    ean: dados.ean,
                    produto_nome: dados.produto,
                    link_da_pagina: tab.url,
                    preco_tela: dados.preco
                })
            });

            const data = await res.json();

            if (data.status === "sucesso") {
                // SUCESSO: Python achou o link direto ou limpou o atual
                btnMelhor.innerHTML = `
                    <span class="sub-texto">💰 LINK COM DESCONTO</span>
                    <span class="principal-texto">${data.preco || "Ver Preço"}</span>
                `;
                btnMelhor.onclick = () => {
                    chrome.tabs.create({ url: data.link });
                };
            } else {
                // PLANO B: Python não achou via EAN. Abre a busca tradicional do ML
                const termoBusca = dados.ean || dados.produto;
                btnMelhor.innerHTML = `<span class="principal-texto">Ver no Mercado Livre</span>`;
                btnMelhor.onclick = () => {
                    chrome.tabs.create({ url: `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}` });
                };
            }
        } catch (e) {
            console.error("Erro na conexão com o Backend:", e);
            // Em caso de erro no servidor, o botão não fica morto:
            btnMelhor.innerHTML = `<span class="principal-texto">Ver no Mercado Livre</span>`;
            btnMelhor.onclick = () => {
                const termoBusca = dados.ean || dados.produto;
                chrome.tabs.create({ url: `https://lista.mercadolivre.com.br/${encodeURIComponent(termoBusca)}` });
            };
        }
    }
});