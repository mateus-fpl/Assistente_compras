function buscarEANNoHTML() {
    let eanEncontrado = null;
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    
    scripts.forEach(script => {
        try {
            const data = JSON.parse(script.innerText);
            const procurarNoObjeto = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                const chavesEAN = ['gtin13', 'gtin', 'gtin', 'gtin8', 'isbn', 'sku'];
                for (let chave of chavesEAN) {
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

    if (!eanEncontrado) {
        const meta = document.querySelector('meta[property="product:retailer_item_id"], meta[name="gtin"]');
        if (meta && /^\d{10,14}$/.test(meta.content.replace(/\D/g, ''))) {
            eanEncontrado = meta.content.replace(/\D/g, '');
        }
    }
    return eanEncontrado;
}

function extrairMLB() {
    const url = window.location.href;
    
    // 1. Tenta pegar ID de anúncio (MLB seguido de 10 dígitos)
    // Ex: MLB6147952356
    const matchItem = url.match(/MLB-?(\d{10})/i);
    if (matchItem) return `MLB${matchItem[1]}`;

    // 2. Tenta pegar ID de catálogo (padrão /p/MLB...)
    // Ex: /p/MLB61784211
    const matchProd = url.match(/\/p\/MLB(\d+)/i);
    if (matchProd) return `MLB${matchProd[1]}`;

    return null;
}

function limparNomeProduto(nomeSujo) {
    if (!nomeSujo) return "";
    let nome = nomeSujo.toLowerCase();
    const simbolosCorte = [' - ', ' | ', ' (', ' [', ':', ' / '];
    simbolosCorte.forEach(simbolo => {
        const index = nome.indexOf(simbolo);
        if (index !== -1) nome = nome.substring(0, index);
    });
    return nome.trim();
}

function extrairDadosLoja() {
    let tituloBruto = document.querySelector('h1')?.innerText || document.title;
    const tituloLimpo = limparNomeProduto(tituloBruto);
    const ean = buscarEANNoHTML();

    let preco = "---";
    const precoMatch = document.body.innerText.match(/R\$\s?(\d{1,3}(\.\d{3})*|(\d+))(\,\d{2})/);
    if (precoMatch) preco = precoMatch[0];

    const mlbId = extrairMLB();

    return { 
        produto: tituloLimpo, 
        preco, 
        ean,
        mlb_id: mlbId 
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.acao === "get_data") {
        sendResponse(extrairDadosLoja());
    }
    return true; 
});