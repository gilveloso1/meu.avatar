#!/usr/bin/env python3
"""Edição rápida de um vídeo de avatar falando (receita testada em 27/10/2026
no HeyGen Avatar IV):

  1. corta os silêncios: pausas de mais de 0,25 s viram 0,16 s, e some o
     silêncio do começo e do fim;
  2. a cada corte, muda o enquadramento (aberto, médio, aberto, close), como
     se fossem duas câmeras: o zoom esconde o "pulo" do corte;
  3. volume das redes: −14 LUFS e pico até −1,5 dBFS (loudnorm linear, só
     ganho, como no tratar.sh).

O rosto do avatar fica no terço de cima do quadro (foto de frente, meio
corpo): o zoom mira no centro, um pouco acima do meio.

  editar.py entrada.mp4 saida.mp4
"""
import json
import re
import subprocess
import sys

# Silêncio: abaixo de −35 dB por mais de 0,25 s.
RUIDO_DB = -35
SILENCIO_MIN = 0.25
# Quanto de pausa sobra de cada lado de um corte.
FOLGA = 0.08
# Trechos mais curtos que isso entram no anterior (não vale um corte).
TRECHO_MIN = 0.6
# Enquadramentos, em ordem: 1 é o quadro todo; 1,5 é o close no rosto.
ZOOMS = [1.0, 1.25, 1.0, 1.5]
# Altura do rosto no quadro original (fração da altura) e onde ele fica no quadro com zoom.
ROSTO_Y = 0.25
ROSTO_NO_QUADRO = 1 / 3


def ffmpeg(*args):
    return subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", *args], capture_output=True, text=True, check=True)


def analisar(entrada):
    """Duração, silêncios e loudness do áudio, numa passada só."""
    r = ffmpeg(
        "-i", entrada,
        "-af", f"silencedetect=noise={RUIDO_DB}dB:d={SILENCIO_MIN},loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
    )
    log = r.stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", log).groups()
    duracao = int(h) * 3600 + int(m) * 60 + float(s)
    inicios = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    fins = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    silencios = list(zip(inicios, fins + [duracao] * (len(inicios) - len(fins))))
    w, h = re.search(r"Video: .*?, (\d{2,5})x(\d{2,5})", log).groups()
    medida = json.loads(log[log.rindex("{"):log.rindex("}") + 1])
    return duracao, silencios, (int(w), int(h)), medida


def trechos(duracao, silencios):
    """Os trechos com fala, com um pouco de pausa de cada lado."""
    falas, fim = [], 0.0
    for s, e in silencios:
        # Menos que isso entre dois silêncios é estalo ou respiração, não fala.
        if s - fim > 0.15:
            falas.append((fim, s))
        fim = e
    if duracao - fim > 0.15:
        falas.append((fim, duracao))
    partes = []
    for a, b in falas:
        a, b = max(0.0, a - FOLGA), min(duracao, b + FOLGA)
        # Fala curta demais para um corte: junta com a anterior, pausa e tudo.
        if partes and b - a < TRECHO_MIN:
            partes[-1][1] = b
        else:
            partes.append([a, b])
    return partes


def enquadramento(zoom, w, h):
    """crop do ffmpeg para o zoom, mirando no rosto."""
    cw, ch = round(w / zoom / 2) * 2, round(h / zoom / 2) * 2
    x = (w - cw) // 2
    y = min(max(0, round(ROSTO_Y * h - ROSTO_NO_QUADRO * ch)), h - ch)
    return f"crop={cw}:{ch}:{x}:{y},scale={w}:{h}:flags=lanczos,setsar=1"


def main(entrada, saida):
    duracao, silencios, (w, h), m = analisar(entrada)
    partes = trechos(duracao, silencios)
    if not partes:
        raise SystemExit("O vídeo não tem fala.")
    filtros, rotulos = [], []
    for i, (a, b) in enumerate(partes):
        d = b - a
        quadro = enquadramento(ZOOMS[i % len(ZOOMS)], w, h)
        filtros.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS,{quadro}[v{i}]")
        # Fades de 10 ms nas pontas: o corte não estala.
        filtros.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st={d - 0.01:.3f}:d=0.01[a{i}]")
        rotulos.append(f"[v{i}][a{i}]")
    ln = (
        f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
        f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    )
    filtros.append(f"{''.join(rotulos)}concat=n={len(partes)}:v=1:a=1[v][ac]")
    filtros.append(f"[ac]{ln},aresample=44100[a]")
    ffmpeg(
        "-y", "-i", entrada, "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-movflags", "+faststart", saida,
    )
    total = sum(b - a for a, b in partes)
    print(f"{len(partes)} trechos, {duracao:.1f} s → {total:.1f} s", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
