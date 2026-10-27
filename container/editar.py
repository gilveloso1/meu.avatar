#!/usr/bin/env python3
"""Edição rápida de um vídeo de avatar falando (receita testada em 27/10/2026
no HeyGen Avatar IV):

  1. corta os silêncios com ritmo orgânico (ritmo()): cada pausa que sobra
     segue a original, comprimida, e ganha mais em volta de falas curtas;
     some o silêncio do começo e do fim;
  2. de tempos em tempos (no mínimo 2,5 s no mesmo), muda o enquadramento
     num corte (aberto, médio, aberto, close), como se fossem duas câmeras;
  3. volume das redes: −14 LUFS e pico até −1,5 dBFS (loudnorm linear, só
     ganho, como no tratar.sh).

O zoom amplia em torno do ponto entre os olhos (rosto.py, YuNet): ele fica
no mesmo lugar do quadro no aberto e com zoom, e a linha dos olhos não pula
no corte. Sem rosto achado, amplia em torno de onde os olhos costumam ficar.

O plano (opcional, JSON) vem da prévia do site (src/quickedit.ts): "pausa"
(a de referência, s), "zooms" (em ordem, um a cada troca) e "trechos"
([início, fim, zoom] no original), e "rosto" ({"x", "y"}: o ponto entre os olhos, frações do
quadro, achado antes pelo site; sem ele, o rosto.py acha aqui). Com os trechos, os cortes são exatamente
os da prévia; sem eles, os silêncios são achados aqui e o ritmo() faz o mesmo
que o planParts() de lá (mudou um, mude o outro).

  editar.py entrada.mp4 saida.mp4 ['{"pausa": 0.2, "zooms": [1, 1.25]}']
"""
import json
import re
import subprocess
import sys

# Silêncio: abaixo de −35 dB por mais de 0,25 s.
RUIDO_DB = -35
SILENCIO_MIN = 0.25
# Menos que isso entre dois silêncios é estalo ou respiração, não fala.
FALA_MIN = 0.15
# Pausa de referência que sobra num corte (as "Médias" do site).
PAUSA = 0.2
# Trechos mais curtos que isso entram no anterior (não vale um corte).
TRECHO_MIN = 0.6
# Pausa que sobra: entre metade e 2,5 vezes a de referência, nunca mais que a original.
PAUSA_MIN, PAUSA_MAX = 0.5, 2.5
# Fala mais curta que isso de um dos lados ganha pausa extra.
BLOCO_CURTO = 1.2
# Cortar menos que isso não vale: a pausa fica inteira.
CORTE_MIN = 0.08
# Da pausa que sobra, esta parte fica depois da fala; o resto, antes da seguinte.
CAUDA = 0.6
# A câmera só muda depois de pelo menos isso no mesmo enquadramento (s).
PLANO_MIN = 2.5
# Enquadramentos, em ordem: 1 é o quadro todo; 1,5 é o close no rosto.
ZOOMS = [1.0, 1.25, 1.0, 1.5]
# Sem rosto achado: onde os olhos costumam ficar (fração do quadro).
OLHOS_X, OLHOS_Y = 0.5, 0.22


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


def ritmo(duracao, silencios, pausa=PAUSA, zooms=ZOOMS):
    """Ritmo orgânico: os trechos do vídeo final com o zoom de cada um (igual ao planParts)."""
    blocos, fim = [], 0.0
    for s, e in silencios:
        if s - fim > FALA_MIN:
            blocos.append((fim, s))
        fim = e
    if duracao - fim > FALA_MIN:
        blocos.append((fim, duracao))
    if not blocos:
        return []
    vaos = [blocos[i + 1][0] - blocos[i][1] for i in range(len(blocos) - 1)]
    mediana = sorted(vaos)[len(vaos) // 2] if vaos else 1.0
    fica = []
    for i, g in enumerate(vaos):
        # A pausa segue a original, comprimida pela raiz; fala curta de um dos lados ganha mais.
        curto = min(blocos[i][1] - blocos[i][0], blocos[i + 1][1] - blocos[i + 1][0])
        p = pausa * (g / mediana) ** 0.5
        if curto < BLOCO_CURTO:
            p += pausa * (BLOCO_CURTO - curto) / BLOCO_CURTO
        fica.append(min(g, max(pausa * PAUSA_MIN, min(pausa * PAUSA_MAX, p))))
    cortes, inicio = [], max(0.0, blocos[0][0] - pausa * (1 - CAUDA))
    for i in range(len(blocos)):
        if i == len(blocos) - 1:
            cortes.append([inicio, min(duracao, blocos[i][1] + pausa * CAUDA)])
        elif vaos[i] - fica[i] >= CORTE_MIN:
            cortes.append([inicio, blocos[i][1] + fica[i] * CAUDA])
            inicio = blocos[i + 1][0] - fica[i] * (1 - CAUDA)
    juntos = []
    for c in cortes:
        # Trecho curto demais para um corte: junta com o anterior, pausa e tudo.
        if juntos and c[1] - c[0] < TRECHO_MIN:
            juntos[-1][1] = c[1]
        else:
            juntos.append(list(c))
    partes, plano, desde = [], 0, 0.0
    for k, (a, b) in enumerate(juntos):
        if k > 0 and desde >= PLANO_MIN:
            plano, desde = plano + 1, 0.0
        partes.append((round(a, 3), round(b, 3), zooms[plano % len(zooms)]))
        desde += b - a
    return partes


def enquadramento(zoom, w, h, rosto):
    """crop do ffmpeg para o zoom, mirando no rosto (o mesmo recorte da prévia)."""
    cw, ch = round(w / zoom / 2) * 2, round(h / zoom / 2) * 2
    # Amplia em torno do ponto entre os olhos: ele fica no mesmo lugar do quadro.
    x = round(rosto["x"] * (w - cw))
    y = round(rosto["y"] * (h - ch))
    return f"crop={cw}:{ch}:{x}:{y},scale={w}:{h}:flags=lanczos,setsar=1"


def do_plano(plano, duracao, silencios):
    """Os trechos com o zoom de cada um: os do plano, conferidos, ou achados aqui."""
    pausa = plano.get("pausa", PAUSA)
    zooms = plano.get("zooms", ZOOMS)
    if not (isinstance(pausa, (int, float)) and 0 < pausa <= 1):
        raise SystemExit("Pausa inválida no plano.")
    if not (isinstance(zooms, list) and zooms and all(isinstance(z, (int, float)) and 1 <= z <= 2 for z in zooms)):
        raise SystemExit("Zooms inválidos no plano.")
    if "trechos" not in plano:
        return ritmo(duracao, silencios, pausa, zooms)
    partes, fim = [], 0.0
    for t in plano["trechos"]:
        if not (isinstance(t, list) and len(t) == 3 and all(isinstance(n, (int, float)) for n in t) and 1 <= t[2] <= 2):
            raise SystemExit("Trecho inválido no plano.")
        a, b = max(float(t[0]), fim), min(float(t[1]), duracao)
        if b - a > 0.05:
            partes.append((a, b, float(t[2])))
            fim = b
    return partes


def do_rosto(plano, entrada, partes):
    """O rosto do plano, conferido; sem ele (e com zoom), acha aqui; sem rosto, o padrão."""
    r = plano.get("rosto")
    if r is None and any(z > 1 for _, _, z in partes):
        from rosto import detectar  # OpenCV só quando precisa (e só no contêiner)

        r = detectar(entrada) or None
    if r is None:
        return {"x": OLHOS_X, "y": OLHOS_Y}
    if not (isinstance(r, dict) and all(isinstance(r.get(k), (int, float)) and 0 <= r[k] <= 1 for k in ("x", "y"))):
        raise SystemExit("Rosto inválido no plano.")
    return {"x": float(r["x"]), "y": float(r["y"])}


def main(entrada, saida, plano=None):
    duracao, silencios, (w, h), m = analisar(entrada)
    plano = json.loads(plano) if plano else {}
    partes = do_plano(plano, duracao, silencios)
    if not partes:
        raise SystemExit("O vídeo não tem fala.")
    rosto = do_rosto(plano, entrada, partes)
    filtros, rotulos = [], []
    for i, (a, b, zoom) in enumerate(partes):
        d = b - a
        quadro = enquadramento(zoom, w, h, rosto)
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
    total = sum(b - a for a, b, _ in partes)
    print(f"{len(partes)} trechos, {duracao:.1f} s → {total:.1f} s", file=sys.stderr)


if __name__ == "__main__":
    main(*sys.argv[1:4])
