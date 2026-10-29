#!/usr/bin/env python3
"""Preparo da troca de avatar pelo Runway Aleph 2 (src/structures/aleph.ts),
na receita testada em 29/10/2026 (docs/modelos/runway-aleph-2.md):

  preparar entrada.mp4 saida.mp4
      Corta as faixas pretas e leva a parte com conteúdo ao maior tamanho que
      o Aleph mantém (1080p: 1080 no lado menor, 1920 no maior), no formato
      dela, a no máximo 30 quadros por segundo. Quanto maior o rosto, mais
      firme a troca. O áudio AAC vai junto, sem mudança (outro vira AAC).

  quadros video.mp4 0,1.25,2.5
      Os quadros nesses instantes, em JPEG base64:
      {"quadros": ["...", "..."]}

  ajustar  (JSON na entrada: {"imagem": b64, "largura": 1080, "altura": 1920})
      O quadro com o rosto trocado no tamanho exato do vídeo (o modelo de
      imagem devolve outro tamanho), pronto para ser quadro-chave:
      {"imagem": b64}. Quem confere se o fundo ficou igual é um modelo de
      visão, no Worker: a conta por pixels não separou o quadro ruim dos bons
      (as mãos e o cabelo mudam sempre um pouco).

  recorte  (imagem na entrada)
      O rosto da foto do avatar, recortado com folga, em JPEG base64, para o
      modelo de imagem copiar os traços: {"imagem": b64}, ou {} sem rosto.

  compor original.mp4 troca.mp4 saida.mp4
      O vídeo preparado com só a cabeça e o cabelo do Aleph por cima. O Aleph
      redesenha o quadro inteiro e o que devia ficar parado treme e se deforma
      (letras dos rótulos, parede); assim o resto fica com os pixels do
      original. A máscara é uma elipse em volta do rosto, até os ombros, que
      segue o rosto achado no vídeo trocado (posição suavizada no tempo), com
      a borda desfocada. Um quadro por vez: 30 s em 1080p não cabem na memória.
"""
import base64
import json
import os
import re
import subprocess
import sys

import cv2
import numpy as np

# YUNET muda o caminho do detector fora da imagem (testes no computador).
MODELO = os.environ.get("YUNET", "/app/yunet.onnx")


def ffmpeg(*args, **kw):
    return subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", *args], capture_output=True, check=True, **kw)


def info(video):
    saida = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", video], capture_output=True, text=True).stderr
    w, h = (int(n) for n in re.search(r"Video: .*?, (\d{2,5})x(\d{2,5})", saida).groups())
    fps = re.search(r"(\d+(?:\.\d+)?) fps", saida)
    aac = re.search(r"Audio: aac", saida) is not None
    return w, h, float(fps.group(1)) if fps else 30.0, aac


def conteudo(video, w, h):
    """A área sem faixas pretas (cropdetect do ffmpeg); sem faixas, o quadro todo."""
    saida = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", video, "-vf", "cropdetect=limit=24:round=2:reset=0", "-frames:v", "90", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    achados = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", saida)
    if not achados:
        return w, h, 0, 0
    cw, ch, cx, cy = (int(n) for n in achados[-1])
    # Corte que tira quase nada não vale (borda escura da própria cena).
    return (cw, ch, cx, cy) if cw * ch < 0.95 * w * h else (w, h, 0, 0)


def preparar(entrada, saida):
    w, h, fps, aac = info(entrada)
    cw, ch, cx, cy = conteudo(entrada, w, h)
    curto, longo = (1080, 1920)
    escala = min(curto / min(cw, ch), longo / max(cw, ch))
    nw, nh = round(cw * escala / 2) * 2, round(ch * escala / 2) * 2
    filtros = f"crop={cw}:{ch}:{cx}:{cy},scale={nw}:{nh}:flags=lanczos,setsar=1"
    if fps > 30.5:
        filtros += ",fps=30"
    # Até uns 4 Mbit/s: 30 s ficam abaixo dos 16 MB que o Aleph aceita.
    ffmpeg("-y", "-i", entrada, "-vf", filtros, "-c:v", "libx264", "-crf", "17", "-maxrate", "4M", "-bufsize", "8M", "-preset", "medium",
           # O áudio vai como está quando já é AAC; outro (o PCM de um MOV de câmera) não cabe no MP4.
           "-pix_fmt", "yuv420p", *(["-c:a", "copy"] if aac else ["-c:a", "aac", "-b:a", "192k"]), "-movflags", "+faststart", saida)


def quadros(video, instantes):
    lista = []
    for t in instantes:
        jpg = ffmpeg("-ss", str(t), "-i", video, "-frames:v", "1", "-q:v", "2", "-f", "image2", "-c:v", "mjpeg", "-").stdout
        lista.append(base64.b64encode(jpg).decode())
    return {"quadros": lista}


def ler(b64):
    imagem = cv2.imdecode(np.frombuffer(base64.b64decode(b64), np.uint8), cv2.IMREAD_COLOR)
    if imagem is None:
        raise ValueError("imagem ilegível")
    return imagem


def jpg(imagem):
    return base64.b64encode(cv2.imencode(".jpg", imagem, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes()).decode()


def rosto(imagem):
    """O rosto mais confiável (x, y, largura, altura), ou None."""
    h, w = imagem.shape[:2]
    escala = min(1.0, 1280 / max(w, h))
    pequena = cv2.resize(imagem, (round(w * escala), round(h * escala))) if escala < 1 else imagem
    detector = cv2.FaceDetectorYN.create(MODELO, "", (pequena.shape[1], pequena.shape[0]), 0.7)
    _, achados = detector.detect(pequena)
    if achados is None or not len(achados):
        return None
    x, y, fw, fh = (float(v) / escala for v in max(achados, key=lambda r: r[14])[:4])
    return x, y, fw, fh


def quadros_brutos(video, w, h):
    """Os quadros do vídeo, um por vez (BGR)."""
    proc = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-i", video, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    tamanho = w * h * 3
    while len(bruto := proc.stdout.read(tamanho)) == tamanho:
        yield np.frombuffer(bruto, np.uint8).reshape(h, w, 3)
    proc.stdout.close()
    proc.wait()


# A cada quantos quadros procurar o rosto (entre um e outro, a posição é interpolada).
PASSO_ROSTO = 3
# Média móvel da posição do rosto, em quadros de cada lado: a máscara não treme.
SUAVE = 7


def compor(original, troca, saida):
    w, h, fps, _ = info(original)
    tw, th, _, _ = info(troca)
    # 1. Onde está o rosto no vídeo trocado (a cada PASSO_ROSTO quadros).
    achados = {}
    total = 0
    for i, quadro in enumerate(quadros_brutos(troca, tw, th)):
        total = i + 1
        if i % PASSO_ROSTO == 0:
            r = rosto(quadro if (tw, th) == (w, h) else cv2.resize(quadro, (w, h)))
            if r:
                achados[i] = r
    if not achados:
        raise ValueError("nenhum rosto no vídeo trocado")
    chaves = sorted(achados)
    caixas = np.array([[np.interp(i, chaves, [achados[k][j] for k in chaves]) for j in range(4)] for i in range(total)])
    caixas = np.array([caixas[max(0, i - SUAVE):i + SUAVE + 1].mean(axis=0) for i in range(total)])
    # 2. Original com a cabeça do trocado por cima, quadro a quadro.
    proc = subprocess.Popen(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
         # veryfast: o contêiner tem 1/4 de vCPU; a diferença de tamanho no arquivo é pequena.
         "-i", original, "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "17", "-preset", "veryfast", "-pix_fmt", "yuv420p",
         "-c:a", "copy", "-movflags", "+faststart", saida],
        stdin=subprocess.PIPE,
    )
    for i, (o, t) in enumerate(zip(quadros_brutos(original, w, h), quadros_brutos(troca, tw, th))):
        if i >= total:
            break
        if (tw, th) != (w, h):
            t = cv2.resize(t, (w, h))
        # A máscara é desenhada e desfocada em 1/4 da resolução (o desfoque no tamanho cheio era o mais caro).
        x, y, fw, fh = caixas[i] / 4
        mascara = np.zeros((h // 4, w // 4), np.float32)
        cv2.ellipse(mascara, (int(x + fw / 2), int(y + fh / 2 + 0.35 * fh)), (int(1.35 * fw), int(1.55 * fh)), 0, 0, 360, 1, -1)
        mascara = cv2.resize(cv2.GaussianBlur(mascara, (0, 0), max(1.0, 0.12 * fw)), (w, h), interpolation=cv2.INTER_LINEAR)[..., None]
        mistura = cv2.convertScaleAbs(t * mascara + o * (1 - mascara))
        proc.stdin.write(mistura.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg falhou ao gravar o vídeo composto")


def ajustar(imagem_b64, largura, altura):
    imagem = cv2.resize(ler(imagem_b64), (largura, altura), interpolation=cv2.INTER_AREA)
    return {"imagem": jpg(imagem)}


def recorte(imagem_bytes):
    imagem = cv2.imdecode(np.frombuffer(imagem_bytes, np.uint8), cv2.IMREAD_COLOR)
    achado = rosto(imagem) if imagem is not None else None
    if not achado:
        return {}
    h, w = imagem.shape[:2]
    x, y, fw, fh = achado
    x0, y0 = max(0, int(x - 0.6 * fw)), max(0, int(y - 0.6 * fh))
    x1, y1 = min(w, int(x + 1.6 * fw)), min(h, int(y + 1.5 * fh))
    return {"imagem": jpg(imagem[y0:y1, x0:x1])}


if __name__ == "__main__":
    acao = sys.argv[1]
    if acao == "preparar":
        preparar(sys.argv[2], sys.argv[3])
    elif acao == "quadros":
        print(json.dumps(quadros(sys.argv[2], [float(t) for t in sys.argv[3].split(",")])))
    elif acao == "ajustar":
        pedido = json.loads(sys.stdin.buffer.read())
        print(json.dumps(ajustar(pedido["imagem"], int(pedido["largura"]), int(pedido["altura"]))))
    elif acao == "recorte":
        print(json.dumps(recorte(sys.stdin.buffer.read())))
    elif acao == "compor":
        compor(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        sys.exit(f"ação desconhecida: {acao}")
