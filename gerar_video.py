#!/usr/bin/env python3
"""Gera um vídeo com avatar falando via OpenRouter (API de vídeo assíncrona).

Fluxo: envia o pedido (POST /api/v1/videos), consulta o status até
`completed` e baixa o MP4 para a pasta `saida/`.

Uso:
    export OPENROUTER_API_KEY=...
    python3 gerar_video.py --prompt-arquivo prompts/teste.txt --imagem avatar.jpg
    python3 gerar_video.py --prompt "..." --simular   # mostra o pedido sem gastar créditos
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

API = "https://openrouter.ai/api/v1"
STATUS_FINAIS_COM_ERRO = {"failed", "cancelled", "expired"}


def requisitar(metodo, url, chave, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header("Authorization", f"Bearer {chave}")
    if dados is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()
    except urllib.error.HTTPError as erro:
        sys.exit(f"Erro HTTP {erro.code} em {url}:\n{erro.read().decode(errors='replace')}")


def buscar_modelo(modelo):
    with urllib.request.urlopen(f"{API}/videos/models", timeout=60) as resp:
        for m in json.load(resp)["data"]:
            if m["id"] == modelo:
                return m
    sys.exit(f"Modelo {modelo} não encontrado em {API}/videos/models")


def validar(modelo_info, args):
    erros = []
    if args.duracao not in (modelo_info.get("supported_durations") or []):
        erros.append(f"duração {args.duracao}s (aceitas: {modelo_info.get('supported_durations')})")
    if args.resolucao not in (modelo_info.get("supported_resolutions") or []):
        erros.append(f"resolução {args.resolucao} (aceitas: {modelo_info.get('supported_resolutions')})")
    if args.formato not in (modelo_info.get("supported_aspect_ratios") or []):
        erros.append(f"formato {args.formato} (aceitos: {modelo_info.get('supported_aspect_ratios')})")
    if erros:
        sys.exit("Parâmetros não suportados pelo modelo: " + "; ".join(erros))


def custo_estimado(modelo_info, args):
    preco = (modelo_info.get("pricing_skus") or {}).get(f"duration_seconds_{args.resolucao}")
    return float(preco) * args.duracao if preco else None


def url_da_imagem(imagem):
    """Aceita URL pública ou arquivo local (enviado como data URL base64)."""
    if imagem.startswith(("http://", "https://", "data:")):
        return imagem
    caminho = Path(imagem)
    if not caminho.is_file():
        sys.exit(f"Imagem não encontrada: {imagem}")
    tipo = mimetypes.guess_type(caminho.name)[0] or "image/jpeg"
    return f"data:{tipo};base64,{base64.b64encode(caminho.read_bytes()).decode()}"


def montar_pedido(args, prompt):
    pedido = {
        "model": args.modelo,
        "prompt": prompt,
        "duration": args.duracao,
        "resolution": args.resolucao,
        "aspect_ratio": args.formato,
        "generate_audio": True,
    }
    if args.seed is not None:
        pedido["seed"] = args.seed
    if args.imagem:
        pedido["frame_images"] = [
            {
                "type": "image_url",
                "image_url": {"url": url_da_imagem(args.imagem)},
                "frame_type": "first_frame",
            }
        ]
    return pedido


def aguardar(job, chave, intervalo, tentativas):
    for _ in range(tentativas):
        status = job.get("status")
        print(f"[{datetime.now():%H:%M:%S}] status: {status}")
        if status == "completed":
            return job
        if status in STATUS_FINAIS_COM_ERRO:
            sys.exit(f"Geração terminou com status {status}: {job.get('error')}")
        time.sleep(intervalo)
        url = job.get("polling_url") or f"/api/v1/videos/{job['id']}"
        if url.startswith("/"):
            url = "https://openrouter.ai" + url
        job = json.loads(requisitar("GET", url, chave))
    sys.exit(f"Tempo esgotado. Consulte depois: {API}/videos/{job['id']}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    fonte = p.add_mutually_exclusive_group(required=True)
    fonte.add_argument("--prompt", help="prompt completo do vídeo")
    fonte.add_argument("--prompt-arquivo", help="arquivo .txt com o prompt")
    p.add_argument("--imagem", help="foto do avatar (arquivo local ou URL) usada como primeiro quadro")
    p.add_argument("--modelo", default="alibaba/wan-3.0")
    p.add_argument("--duracao", type=int, default=25)
    p.add_argument("--resolucao", default="480p")
    p.add_argument("--formato", default="9:16")
    p.add_argument("--seed", type=int)
    p.add_argument("--saida", default="saida")
    p.add_argument("--intervalo", type=int, default=20, help="segundos entre consultas de status")
    p.add_argument("--tentativas", type=int, default=90)
    p.add_argument("--simular", action="store_true", help="só mostra o pedido e o custo estimado")
    args = p.parse_args()

    prompt = args.prompt or Path(args.prompt_arquivo).read_text(encoding="utf-8").strip()
    modelo_info = buscar_modelo(args.modelo)
    validar(modelo_info, args)
    custo = custo_estimado(modelo_info, args)
    print(f"Modelo: {args.modelo} | {args.duracao}s | {args.resolucao} | {args.formato}")
    if custo is not None:
        print(f"Custo estimado: US$ {custo:.2f}")

    pedido = montar_pedido(args, prompt)
    if args.simular:
        visivel = json.loads(json.dumps(pedido))
        for f in visivel.get("frame_images", []):
            url = f["image_url"]["url"]
            if url.startswith("data:"):
                f["image_url"]["url"] = url[:40] + "...(base64)"
        print(json.dumps(visivel, ensure_ascii=False, indent=2))
        return

    chave = os.environ.get("OPENROUTER_API_KEY")
    if not chave:
        sys.exit("Defina a variável OPENROUTER_API_KEY.")

    job = json.loads(requisitar("POST", f"{API}/videos", chave, pedido))
    print(f"Job enviado: {job.get('id')}")
    job = aguardar(job, chave, args.intervalo, args.tentativas)

    url = (job.get("unsigned_urls") or [f"{API}/videos/{job['id']}/content?index=0"])[0]
    destino = Path(args.saida) / f"video_{datetime.now():%Y%m%d_%H%M%S}.mp4"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(requisitar("GET", url, chave))
    (destino.with_suffix(".json")).write_text(
        json.dumps({"pedido": {**pedido, "frame_images": "omitido"} if args.imagem else pedido, "job": job},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Vídeo salvo em {destino}")
    if (job.get("usage") or {}).get("cost") is not None:
        print(f"Custo real: US$ {job['usage']['cost']}")


if __name__ == "__main__":
    main()
