/**
 * FUNÇÃO DE UTILIDADE: Busca o EAN/GTIN escondido no HTML (Schema.org)
 */
function buscarEANNoHTML() {
    let eanEncontrado = null;

    // 1. Procura em scripts JSON-LD (Dados Estruturados que o Google usa)
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    
    scripts.forEach(script => {
        try {
            const data = JSON.parse(script.innerText);
            
            const procurarNoObjeto = (obj) => {
                if (!obj || typeof obj !== 'object') return;

                // Chaves universais de código de barras
                const chavesEAN = ['gtin13', 'gtin', 'gtin8', 'isbn', 'sku'];
                for (let chave of chavesEAN) {
                    // Verifica se o valor existe e se parece com um código numérico longo (EAN tem 13 dígitos)
                    if (obj[chave] && typeof obj[chave] === 'string' && /^\d{8,14}$/.test(obj[chave].replace(/\D/g, ''))) {
                        eanEncontrado = obj[chave].replace(/\D/g, '');
                        return;
                    }
                }

                Object.values(obj).forEach(procurarNoObjeto);
            };

            procurarNoObjeto(data);
        } catch (e) {}
    });

    // 2. Backup: Meta tags comuns em e-commerce
    if (!eanEncontrado) {
        const meta = document.querySelector('meta[property="product:retailer_item_id"], meta[name="gtin"], meta[property="product:target_genders"]');
        if (meta && /^\d{10,14}$/.test(meta.content.replace(/\D/g, ''))) {
            eanEncontrado = meta.content.replace(/\D/g, '');
        }
    }

    return eanEncontrado;
}

/**
 * FUNÇÃO DE UTILIDADE: Limpa o nome do produto
 */
function limparNomeProduto(nomeSujo) {
    if (!nomeSujo) return "";
    let nome = nomeSujo.toLowerCase();
    const simbolosCorte = [' - ', ' | ', ' (', ' [', ':', ' / '];
    simbolosCorte.forEach(simbolo => {
        const index = nome.indexOf(simbolo);
        if (index !== -1) nome = nome.substring(0, index);
    });
    const lixo = ['original', 'novo', 'lacrado', 'promoção', 'oferta', 'frete grátis', 'pronta entrega', 'oficial', 'lançamento', 'full', 'nota fiscal', 'smartphone', 'celular', 'console'];
    lixo.forEach(palavra => {
        const regex = new RegExp(`\\b${palavra}\\b`, 'gi');
        nome = nome.replace(regex, '');
    });
    nome = nome.replace(/\s+/g, ' ').trim();
    return nome.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * FUNÇÃO PRINCIPAL: Extrai os dados da página atual
 */
function extrairDadosLoja() {
    // 1. Título
    let tituloBruto = document.querySelector('h1')?.innerText || 
                      document.querySelector('#productTitle')?.innerText || 
                      document.title;
    const tituloLimpo = limparNomeProduto(tituloBruto);

    // 2. EAN (A nova "Chave Mestra")
    const eanEncontrado = buscarEANNoHTML();

    // 3. Preço
    let preco = "---";
    const corpoTexto = document.body.innerText;
    const precoMatch = corpoTexto.match(/R\$\s?(\d{1,3}(\.\d{3})*|(\d+))(\,\d{2})/);
    
    if (precoMatch) {
        preco = precoMatch[0];
    } else {
        const tagsPreco = document.querySelectorAll('.a-price-whole, .ui-pdp-price__second-line, [class*="price"]');
        for (let tag of tagsPreco) {
            if (tag.innerText.includes('R$') || /\d/.test(tag.innerText)) {
                preco = tag.innerText.trim();
                if (!preco.includes('R$')) preco = 'R$ ' + preco;
                break;
            }
        }
    }

    return { 
        produto: tituloLimpo || "Produto não identificado", 
        preco: preco,
        ean: eanEncontrado // Enviando o EAN para o popup
    };
}

/**
 * ESCUTADOR: Responde ao popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.acao === "get_data") {
        const dados = extrairDadosLoja();
        console.log("🕵️ Dados Detectados:", dados);
        sendResponse(dados);
    }
    return true; 
});