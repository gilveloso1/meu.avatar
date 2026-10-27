#!/usr/bin/env python3
"""Acha o rosto do avatar num vídeo, para o zoom da edição rápida mirar nele
(editar.py e a prévia do site). Detector YuNet (OpenCV) nos quadros-chave do
vídeo, em meia resolução: o ffmpeg tira os quadros-chave sem decodificar o
resto (pedir um instante qualquer obriga a decodificar desde o quadro-chave
anterior, e o HeyGen põe um a cada 10 s). Vale a mediana, para não seguir cada
balanço da cabeça.

Responde com o centro do rosto e a altura dele, em frações do quadro:
  rosto.py video.mp4  →  {"x": 0.46, "y": 0.435, "altura": 0.249}
Sem rosto em nenhum quadro-chave, responde {}.
"""
import json
import re
import statistics
import subprocess
import sys

import cv2
import numpy as np

MODELO = "/app/yunet.onnx"
CONFIANCA = 0.7
# Quadros-chave usados no máximo (espalhados pelo vídeo).
QUADROS = 12


def detectar(video):
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", video], capture_output=True, text=True).stderr
    w, h = (int(n) // 2 * 2 for n in re.search(r"Video: .*?, (\d{2,5})x(\d{2,5})", r).groups())
    w, h = w // 2, h // 2
    bruto = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-skip_frame", "nokey", "-i", video, "-vf", f"scale={w}:{h}", "-fps_mode", "passthrough",
         "-an", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
        capture_output=True,
    ).stdout
    tamanho = w * h * 3
    quadros = [bruto[i:i + tamanho] for i in range(0, len(bruto) - tamanho + 1, tamanho)]
    if len(quadros) > QUADROS:
        quadros = [quadros[round(i * (len(quadros) - 1) / (QUADROS - 1))] for i in range(QUADROS)]
    detector = cv2.FaceDetectorYN.create(MODELO, "", (w, h), CONFIANCA)
    achados = []
    for q in quadros:
        _, rostos = detector.detect(np.frombuffer(q, np.uint8).reshape(h, w, 3))
        if rostos is not None and len(rostos):
            # O rosto mais confiável do quadro.
            x, y, rw, rh = (float(v) for v in max(rostos, key=lambda f: f[14])[:4])
            achados.append(((x + rw / 2) / w, (y + rh / 2) / h, rh / h))
    if not achados:
        return {}
    return {chave: round(statistics.median(a[i] for a in achados), 3) for i, chave in enumerate(("x", "y", "altura"))}


if __name__ == "__main__":
    print(json.dumps(detectar(sys.argv[1])))
