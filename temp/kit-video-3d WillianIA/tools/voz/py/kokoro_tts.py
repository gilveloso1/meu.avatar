"""Gera a narração com o Kokoro (voz grátis, roda no computador). Uso interno de tools/voz.mjs."""
import argparse
import json
import re
import sys
import time

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def dividir(frase, limite=260):
    """Frases muito longas são quebradas nas vírgulas para a voz não se perder."""
    if len(frase) <= limite:
        return [frase]
    partes, atual = [], ""
    for pedaco in re.split(r"(?<=[,;:])\s+", frase):
        if atual and len(atual) + len(pedaco) > limite:
            partes.append(atual.strip())
            atual = ""
        atual += pedaco + " "
    if atual.strip():
        partes.append(atual.strip())
    return partes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo", required=True)
    ap.add_argument("--vozes", required=True)
    ap.add_argument("--texto", required=True, help="arquivo .txt com a narração")
    ap.add_argument("--saida", required=True, help="arquivo .wav de saída")
    ap.add_argument("--voz", default="pf_dora")
    ap.add_argument("--velocidade", type=float, default=1.0)
    ap.add_argument("--idioma", default="pt-br")
    ap.add_argument("--pausa", type=float, default=0.2, help="silêncio entre frases (s)")
    a = ap.parse_args()

    texto = open(a.texto, encoding="utf-8").read().strip()
    frases = [f.strip() for f in re.split(r"(?<=[.!?…])\s+", texto) if f.strip()]
    if not frases:
        print(json.dumps({"erro": "texto vazio"}))
        sys.exit(1)

    inicio = time.time()
    kokoro = Kokoro(a.modelo, a.vozes)
    partes, marcas, t, sr = [], [], 0.0, 24000
    for frase in frases:
        ini = t
        for pedaco in dividir(frase):
            amostras, sr = kokoro.create(pedaco, voice=a.voz, speed=a.velocidade, lang=a.idioma)
            partes.append(amostras)
            t += len(amostras) / sr
            pausa = int(sr * 0.06)  # respiro curto entre pedaços da mesma frase
            partes.append(np.zeros(pausa, dtype=amostras.dtype))
            t += pausa / sr
        marcas.append({"texto": frase, "inicio": round(ini, 3), "fim": round(t - 0.06, 3)})
        silencio = int(sr * a.pausa)
        partes.append(np.zeros(silencio, dtype=partes[-1].dtype))
        t += silencio / sr

    audio = np.concatenate(partes)
    sf.write(a.saida, audio, sr)
    gasto = time.time() - inicio
    dur = len(audio) / sr
    print(json.dumps({"duracao": round(dur, 3), "frases": marcas, "tempoSintese": round(gasto, 2),
                      "velocidadeRelativa": round(dur / gasto, 2) if gasto else None}, ensure_ascii=False))


if __name__ == "__main__":
    main()
