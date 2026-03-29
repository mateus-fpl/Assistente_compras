const input = document.getElementById('search-input');
const suggestionsBox = document.getElementById('suggestions');
const loader = document.querySelector('.loader');
const rankingContainer = document.getElementById('top-ranking');
let debounceTimer;

// --- PARTE 1: CAPTURA AUTOMÁTICA (O QUE ESTAVA FUNCIONANDO ANTES) ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
        // Pergunta para o content.js os dados do produto aberto na aba
        chrome.tabs.sendMessage(tabs[0].id, { acao: "get_data" }, (response) => {
            
            if (chrome.runtime.lastError) {
                console.log("Aba não compatível ou precisa de refresh.");
                return;
            }

            if (response && response.produto !== "Título não identificado") {
                const nomeProduto = response.produto;
                
                // Cria um card de "Produto Detectado" no topo para comparação rápida
                const detectadoDiv = document.createElement('div');
                detectadoDiv.style = "background: #e1f5fe; padding: 10px; border-radius: 8px; margin-bottom: 15px; border: 1px dashed #03a9f4;";
                detectadoDiv.innerHTML = `
                    <div style="font-size: 10px; color: #03a9f4; font-weight: bold; text-transform: uppercase;">Produto Detectado</div>
                    <div style="font-size: 13px; font-weight: bold; margin: 5px 0;">${nomeProduto.substring(0, 60)}...</div>
                    <button id="btn-comparar-auto" style="width: 100%; background: #03a9f4; color: white; border: none; padding: 8px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        🔍 Comparar Preços no Google
                    </button>
                `;
                
                // Insere no início do container de resultados
                rankingContainer.prepend(detectadoDiv);

                document.getElementById('btn-comparar-auto').onclick = () => {
                    const url = `https://www.google.com.br/search?q=${encodeURIComponent(nomeProduto)}&tbm=shop`;
                    window.open(url, '_blank');
                };

                // Opcional: Já preenche a barra de busca com o nome do produto detectado
                input.value = nomeProduto;
            }
        });
    }
});

// --- PARTE 2: BUSCA MANUAL E AUTOCOMPLETE ---
input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 3) {
        suggestionsBox.style.display = 'none';
        return;
    }
    debounceTimer = setTimeout(() => { buscarSugestoes(query); }, 300);
});

async function buscarSugestoes(query) {
    try {
        const response = await fetch(`https://api.mercadolibre.com/sites/MLB/suggestions?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        const sugestoes = data.suggestions.map(s => s.name).slice(0, 5);
        exibirSugestoes(sugestoes);
    } catch (err) {
        exibirSugestoes([`${query} melhor preço`, `${query} promoção`]);
    }
}

function exibirSugestoes(list) {
    suggestionsBox.innerHTML = '';
    list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = item;
        div.onclick = () => {
            input.value = item;
            suggestionsBox.style.display = 'none';
            iniciarBuscaReal(item);
        };
        suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = 'block';
}

// --- PARTE 3: MOTOR DE SCORE E RANKING ---
function analisarProduto(prod, menorPreco) {
    let notaPreco = (menorPreco / prod.price) * 100;
    let notaHistorico = (!prod.original_price || prod.price <= prod.original_price) ? 100 : 
                        Math.max(0, 100 - (((prod.price - prod.original_price) / prod.original_price) * 1000));
    let notaFeedback = (prod.reviews?.rating_average || 4.5) * 20; 

    return ((notaPreco * 0.4) + (notaHistorico * 0.4) + (notaFeedback * 0.2)).toFixed(1);
}

async function iniciarBuscaReal(termo) {
    loader.style.display = 'block';
    rankingContainer.innerHTML = '';

    try {
        const response = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termo)}&limit=15`);
        const dados = await response.json();
        const produtosRaw = dados.results;

        if (!produtosRaw || produtosRaw.length === 0) {
            rankingContainer.innerHTML = "<div style='padding:20px; color:#666;'>Nenhum resultado.</div>";
            return;
        }

        const menorPrecoGlobal = Math.min(...produtosRaw.map(p => p.price));

        const top3 = produtosRaw.map(prod => ({
            titulo: prod.title,
            preco: prod.price,
            link: prod.permalink,
            foto: prod.thumbnail,
            score: analisarProduto(prod, menorPrecoGlobal)
        })).sort((a, b) => b.score - a.score).slice(0, 3);

        exibirTop3(top3);
    } catch (erro) {
        rankingContainer.innerHTML = "Erro na busca.";
    } finally {
        loader.style.display = 'none';
    }
}

function exibirTop3(lista) {
    rankingContainer.innerHTML = '<h3>🏆 Top 3 Recomendações</h3>';
    lista.forEach((prod, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="rank-badge">#${index + 1}</div>
            <img src="${prod.foto}">
            <div class="product-info">
                <div class="product-title">${prod.titulo}</div>
                <div class="product-price">R$ ${prod.preco.toLocaleString('pt-BR')}</div>
            </div>
            <div class="score-container">
                <span class="score-label">Score</span>
                <span class="score-value">${prod.score}</span>
                <button class="btn-buy" onclick="window.open('${prod.link}', '_blank')">Ver</button>
            </div>
        `;
        rankingContainer.appendChild(card);
    });
}