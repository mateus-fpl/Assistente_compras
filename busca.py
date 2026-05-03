from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import time
from dotenv import load_dotenv
from urllib.parse import quote

load_dotenv()

app = Flask(__name__)
CORS(app)

CLIENT_ID = os.getenv('CLIENT_ID')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
ID_AFILIADO = "WBV4M1-3J26"  # Seu ID de afiliado do ML

def obter_token():
    url = "https://api.mercadolibre.com/oauth/token"
    payload = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET
    }
    response = requests.post(url, data=payload)
    print(f"DEBUG TOKEN: status={response.status_code} | resposta={response.json()}")  # ← linha nova
    return response.json().get('access_token') if response.status_code == 200 else None

def montar_link_afiliado(permalink):
    """
    Monta o link direto do produto assinado com o parâmetro de afiliado.
    matt_tool = seu ID de afiliado
    matt_word = identificador da origem (aparece nos relatórios do painel)
    """
    link_limpo = permalink.split('?')[0].split('#')[0]
    return f"{link_limpo}?matt_tool={ID_AFILIADO}&matt_word=extensao_preco"

def buscar_melhor_produto(termo, token=None):
    """
    Busca via API oficial do ML (sem web crawling).
    - Respeita o rate limit: trata erro 429 com 1 retry após espera.
    - Retorna o produto mais relevante ou None.
    """
    headers = {'Authorization': f'Bearer {token}'} if token else {}
    url = f"https://api.mercadolibre.com/sites/MLB/search?q={quote(termo)}&limit=5"

    for tentativa in range(2):  # Máximo 2 tentativas
        try:
            res = requests.get(url, headers=headers, timeout=5)

            if res.status_code == 200:
                resultados = res.json().get('results', [])
                if resultados:
                    return resultados[0]
                return None  # Buscou mas não achou — não tenta de novo

            elif res.status_code == 429:
                # Rate limit atingido — respeita o Retry-After da resposta
                retry_after = int(res.headers.get('Retry-After', 3))
                print(f"DEBUG: Erro 429 - Rate limit. Aguardando {retry_after}s...")
                time.sleep(retry_after)
                continue  # Tenta de novo

            else:
                print(f"DEBUG: Erro inesperado da API: {res.status_code}")
                return None

        except Exception as e:
            print(f"Erro na busca: {e}")
            return None

    print("DEBUG: Rate limit persistente após retry. Abortando busca.")
    return None

@app.route('/gerar_link', methods=['POST'])
def gerar_link():
    data = request.json
    mlb_id = data.get('mlb_id')
    link_da_pagina = data.get('link_da_pagina', '')
    ean = data.get('ean')
    nome_produto = data.get('produto_nome')
    preco_tela = data.get('preco_tela')

    token = obter_token()

    # --- ESTRATÉGIA 1: Usuário já está no ML ---
    # Só limpa e assina o link — zero chamadas extras à API
    if mlb_id or "mercadolivre.com.br" in link_da_pagina:
        link_limpo = link_da_pagina.split('?')[0].split('#')[0]
        link_lucro = montar_link_afiliado(link_limpo)
        print(f"DEBUG: Estratégia 1 - Link ML limpo e assinado.")
        return jsonify({
            "status": "sucesso",
            "link": link_lucro,
            "preco": preco_tela,
            "metodo": "link_cleaning"
        })

    # --- ESTRATÉGIA 2: Busca por EAN (mais preciso) ---
    if ean and len(str(ean)) >= 10:
        print(f"DEBUG: Estratégia 2 - Buscando por EAN: {ean}")
        produto = buscar_melhor_produto(str(ean), token)

        if produto:
            link_lucro = montar_link_afiliado(produto['permalink'])
            print(f"DEBUG: Achou via EAN → {produto['id']} | {produto['title']}")
            return jsonify({
                "status": "sucesso",
                "link": link_lucro,
                "preco": produto.get('price'),
                "titulo": produto.get('title'),
                "metodo": "ean"
            })

    # --- ESTRATÉGIA 3: Busca por nome do produto ---
    if nome_produto:
        print(f"DEBUG: Estratégia 3 - Buscando por nome: {nome_produto}")
        produto = buscar_melhor_produto(nome_produto, token)

        if produto:
            link_lucro = montar_link_afiliado(produto['permalink'])
            print(f"DEBUG: Achou via nome → {produto['id']} | {produto['title']}")
            return jsonify({
                "status": "sucesso",
                "link": link_lucro,
                "preco": produto.get('price'),
                "titulo": produto.get('title'),
                "metodo": "nome"
            })

    # --- FALLBACK: Nenhuma estratégia funcionou ---
    print("DEBUG: Nenhuma estratégia funcionou. Frontend vai tratar o fallback.")
    return jsonify({"status": "erro"}), 400


if __name__ == '__main__':
    app.run(port=5000, debug=True)