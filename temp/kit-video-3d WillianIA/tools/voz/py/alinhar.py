"""Marca o tempo de cada palavra da narração usando o Whisper (grátis, roda no computador).

Ele transcreve o áudio com tempos por palavra e alinha com o texto original do roteiro, para as legendas
saírem com as palavras e a pontuação certas, no momento certo. Uso interno de tools/voz.mjs.
"""
import argparse
import difflib
import json
import re
import sys
import unicodedata

from faster_whisper import WhisperModel


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--texto", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--modelo", default="base")
    ap.add_argument("--idioma", default="pt")
    a = ap.parse_args()

    texto = open(a.texto, encoding="utf-8").read().strip()
    tokens = texto.split()
    if not tokens:
        print(json.dumps({"erro": "texto vazio"}))
        sys.exit(1)

    modelo = WhisperModel(a.modelo, device="cpu", compute_type="int8")
    segmentos, info = modelo.transcribe(
        a.audio, language=a.idioma, word_timestamps=True, beam_size=5, vad_filter=False,
        condition_on_previous_text=False,
    )
    reco = []
    for seg in segmentos:
        for w in seg.words or []:
            n = norm(w.word)
            if n:
                reco.append((n, float(w.start), float(w.end)))
    duracao = float(info.duration)

    alvo = [norm(t) for t in tokens]
    inicios = [None] * len(tokens)
    fins = [None] * len(tokens)
    if reco:
        sm = difflib.SequenceMatcher(None, alvo, [r[0] for r in reco], autojunk=False)
        for bloco in sm.get_matching_blocks():
            for k in range(bloco.size):
                inicios[bloco.a + k] = reco[bloco.b + k][1]
                fins[bloco.a + k] = reco[bloco.b + k][2]
    casadas = sum(1 for x in inicios if x is not None)

    # palavras sem par (números, nomes difíceis): reparte o tempo entre as vizinhas, proporcional ao tamanho
    i = 0
    while i < len(tokens):
        if inicios[i] is not None:
            i += 1
            continue
        j = i
        while j < len(tokens) and inicios[j] is None:
            j += 1
        t0 = fins[i - 1] if i > 0 else 0.0
        t1 = inicios[j] if j < len(tokens) else duracao
        t1 = max(t1, t0 + 0.05 * (j - i))
        pesos = [max(1, len(alvo[k]) or 1) for k in range(i, j)]
        total = sum(pesos)
        c = t0
        for k, p in zip(range(i, j), pesos):
            d = (t1 - t0) * p / total
            inicios[k], fins[k] = c, c + d
            c += d
        i = j

    palavras = []
    for k, tok in enumerate(tokens):
        ini = inicios[k]
        fim = fins[k]
        if palavras and ini < palavras[-1]["inicio"]:
            ini = palavras[-1]["inicio"]
        if fim <= ini:
            fim = ini + 0.05
        palavras.append({"palavra": tok, "inicio": round(ini, 3), "fim": round(fim, 3)})
    for k in range(len(palavras) - 1):  # uma palavra nunca invade a próxima
        if palavras[k]["fim"] > palavras[k + 1]["inicio"]:
            palavras[k]["fim"] = max(palavras[k]["inicio"] + 0.03, palavras[k + 1]["inicio"])

    json.dump(palavras, open(a.saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({"palavras": len(palavras), "casadas": casadas, "cobertura": round(casadas / len(tokens), 3),
                      "duracaoAudio": round(duracao, 3)}))


if __name__ == "__main__":
    main()
