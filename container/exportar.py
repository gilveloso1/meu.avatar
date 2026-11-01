"""Monta os vídeos dos projetos do canvas (docs/canvas.md).

Cada grupo do canvas vira um trecho (H.264 sem B-frames e FLAC, em MKV), feito
uma vez só. Cada versão é a emenda dos trechos: o vídeo é copiado, sem
recodificar, e só o som vira AAC (AAC emendado pode estalar). Assim, 6 versões
custam o conteúdo único, não 6 vídeos inteiros.

Servidor (imagem própria, Dockerfile.exportar): POST /trecho e POST /emendar. O
corpo são arquivos emendados e o cabeçalho x-tamanhos diz os bytes de cada um.
Em /trecho, o primeiro é o plano em JSON e os outros, os arquivos que ele usa;
em /emendar, todos são trechos. Os dois devolvem o arquivo pronto, e /emendar
põe o CRC-32 em x-crc32 (o ZIP do "Exportar todas" é montado no Worker). Para o
agente enxergar um arquivo (docs/api.md): POST /quadros devolve um JPG com os
instantes de x-instantes lado a lado, e POST /silencios, um JSON. GET /saude
responde ok. O contêiner não tem acesso à internet.

Sem o contêiner (precisa de ffmpeg):
  python3 container/exportar.py trecho plano.json saida.mkv arquivo...
  python3 container/exportar.py emendar saida.mp4 trecho.mkv...
"""
import json, math, os, re, signal, subprocess, sys, tempfile, threading, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FPS = 30
TAXA = 48000
# O mesmo volume do resto do site (tratar.sh, editar.py): sem isso, um gancho baixo seguido de
# um corpo alto dá um salto na emenda. Abaixo de SILENCIO, não há o que medir.
LUFS = -14
SILENCIO = -60
LIMITE = 4 * 1024 * 1024 * 1024  # 4 GB: até 200 trechos numa emenda
MAX_LADO = 1920
# Os limites de src/canvas/modelo.js.
VELOCIDADE = (0.25, 4)
MAX_CHAVES = 32
MAX_ZOOM = 8
# Animação com zoom: amplia antes, senão o zoompan anda de pixel em pixel e treme.
SUPER = 2
MAX_QUADROS = 12
ALTURA_QUADRO = 360
# As regras de RULES (src/quickedit.ts).
RUIDO = -35
SILENCIO_MIN = 0.25


def ffmpeg(*args, tempo=900):
    return subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", *args], capture_output=True, text=True, check=True, timeout=tempo)


def tem_som(arquivo):
    # A imagem só tem o ffmpeg: sem saída ele sai com erro, mas lista as faixas do arquivo.
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", arquivo], capture_output=True, text=True)
    return "Audio:" in r.stderr


def numero(valor, minimo, maximo):
    """Tudo o que vai para os filtros passa por aqui: o plano vem do canvas da pessoa."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not math.isfinite(valor) or not minimo <= valor <= maximo:
        raise SystemExit("Número inválido no plano.")
    return float(valor)


def lado(valor):
    n = numero(valor, 2, MAX_LADO)
    if n != int(n) or int(n) % 2:
        raise SystemExit("Tamanho inválido no plano.")
    return int(n)


def tempo(velocidade):
    """O atempo só aceita de 0,5 a 2: passo a passo, mantém o tom da voz."""
    passos, resto = [], velocidade
    while resto > 2:
        passos.append("atempo=2")
        resto /= 2
    while resto < 0.5:
        passos.append("atempo=0.5")
        resto /= 0.5
    return ",".join([*passos, f"atempo={resto:.5f}"])


def curva(chaves, valor):
    """O valor ao longo do tempo, com a curva de frameAt (modelo.js)."""
    t = f"(on/{FPS})"
    conta = f"{valor(chaves[-1]):.5f}"
    for a, b in reversed(list(zip(chaves, chaves[1:]))):
        u = f"(({t}-{a['t']:.4f})/{b['t'] - a['t']:.4f})"
        conta = f"if(lt({t},{b['t']:.4f}),{valor(a):.5f}+({valor(b) - valor(a):.5f})*{u}*{u}*(3-2*{u}),{conta})"
    return f"if(lt({t},{chaves[0]['t']:.4f}),{valor(chaves[0]):.5f},{conta})"


def lista_chaves(quadro):
    brutas = quadro.get("keys") or [{}]
    if not isinstance(brutas, list) or len(brutas) > MAX_CHAVES or not all(isinstance(k, dict) for k in brutas):
        raise SystemExit("Animação inválida no plano.")
    chaves = [{"t": numero(k.get("t", 0), -3600, 3600), "z": numero(k.get("z", 1), 1, MAX_ZOOM), "x": numero(k.get("x", 0.5), 0, 1), "y": numero(k.get("y", 0.5), 0, 1)} for k in brutas]
    chaves.sort(key=lambda k: k["t"])
    return [k for i, k in enumerate(chaves) if not i or k["t"] > chaves[i - 1]["t"]]


def zoom(chaves, w, h):
    """A janela do zoom: foco no centro, sem sair da imagem (zoomWindow, modelo.js)."""
    if len({(k["z"], k["x"], k["y"]) for k in chaves}) > 1:
        z, x, y = curva(chaves, lambda k: k["z"]), curva(chaves, lambda k: k["x"]), curva(chaves, lambda k: k["y"])
        return [
            f"scale={w * SUPER}:{h * SUPER}:flags=bicubic",
            f"zoompan=z='{z}':x='max(min(({x})*iw-iw/zoom/2,iw-iw/zoom),0)':y='max(min(({y})*ih-ih/zoom/2,ih-ih/zoom),0)':d=1:s={w}x{h}:fps={FPS}",
        ]
    k = chaves[0]
    if k["z"] == 1:
        return []
    cw, ch = w / k["z"], h / k["z"]
    cx, cy = min(max(k["x"] * w - cw / 2, 0), w - cw), min(max(k["y"] * h - ch / 2, 0), h - ch)
    return [f"crop={cw:.3f}:{ch:.3f}:{cx:.3f}:{cy:.3f}:exact=1", f"scale={w}:{h}:flags=bicubic"]


def enquadrar(entrada, saida, quadro, w, h, n):
    """A imagem no quadro, a mesma conta de placement (modelo.js). Devolve os filtros do grafo."""
    quadro = quadro if isinstance(quadro, dict) else {}
    c = quadro.get("crop") if isinstance(quadro.get("crop"), dict) else {}
    l, t, r, b = (numero(c.get(k, 0), 0, 0.9) for k in "ltrb")
    if l + r > 0.9 or t + b > 0.9:
        raise SystemExit("Recorte inválido no plano.")
    passos = [f"crop=iw*{1 - l - r:.5f}:ih*{1 - t - b:.5f}:iw*{l:.5f}:ih*{t:.5f}"] if l or t or r or b else []
    if quadro.get("flipH") is True:
        passos.append("hflip")
    if quadro.get("flipV") is True:
        passos.append("vflip")
    giro = quadro.get("rotate", 0)
    if giro not in (0, 90, 180, 270):
        raise SystemExit("Giro inválido no plano.")
    passos += {0: [], 90: ["transpose=1"], 180: ["transpose=1", "transpose=1"], 270: ["transpose=2"]}[giro]
    encaixe = quadro.get("fit", "cover")
    if encaixe not in ("cover", "contain", "blur"):
        raise SystemExit("Encaixe inválido no plano.")
    cobre = f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=bicubic,crop={w}:{h}"
    cabe = f"scale={w}:{h}:force_original_aspect_ratio=decrease:flags=bicubic"
    final = ",".join(zoom(lista_chaves(quadro), w, h) + ["setsar=1", "format=yuva420p"])
    inicio = ",".join([*passos, "format=yuva420p"])
    if encaixe == "cover":
        return [f"[{entrada}]{inicio},{cobre},{final}[{saida}]"]
    if encaixe == "contain":
        # Sobra transparente: em cobertura, vê-se o bloco de baixo, como na prévia.
        return [f"[{entrada}]{inicio},{cabe},pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black@0,{final}[{saida}]"]
    return [
        f"[{entrada}]{inicio},split[f{n}][g{n}]",
        f"[f{n}]{cobre},boxblur=24:2[h{n}]",
        f"[g{n}]{cabe}[j{n}]",
        f"[h{n}][j{n}]overlay=(W-w)/2:(H-h)/2,{final}[{saida}]",
    ]


def filtros(plano, arquivos):
    """Devolve as entradas e o filter_complex do trecho, com as saídas [v] e [a]."""
    w, h = lado(plano.get("largura")), lado(plano.get("altura"))
    duracao = numero(plano.get("duracao"), 0.1, 3600)
    quadros = max(1, round(duracao * FPS))
    # O som tem a duração exata dos quadros: é o que mantém a emenda em sincronia.
    exata = quadros / FPS
    entradas, grafo, sons, volumes = [], [f"color=c=black:s={w}x{h}:r={FPS}:d={exata:.6f},format=yuv420p[base]"], [], []
    atual = "base"
    itens = plano.get("itens")
    if not isinstance(itens, list):
        raise SystemExit("Plano sem itens.")
    # A base primeiro e as coberturas por cima, na ordem do plano.
    itens = sorted(itens, key=lambda i: isinstance(i, dict) and i.get("camada") == "cobertura")
    for n, item in enumerate(itens):
        if not isinstance(item, dict) or item.get("tipo") not in ("video", "imagem", "audio"):
            raise SystemExit("Item inválido no plano.")
        indice = item.get("arquivo")
        if isinstance(indice, bool) or not isinstance(indice, int) or not 0 <= indice < len(arquivos):
            raise SystemExit("Arquivo inválido no plano.")
        tipo, caminho = item["tipo"], arquivos[indice]
        entra = numero(item.get("entra"), 0, exata)
        dura = min(numero(item.get("dura"), 0.01, 3600), exata - entra)
        # Em quadros: um clipe termina exatamente onde o seguinte começa.
        inicio, fim = round(entra * FPS), min(round((entra + dura) * FPS), quadros)
        corte = numero(item.get("corte"), 0, 36000)
        volume = numero(item.get("volume", 0), 0, 4)
        velocidade = numero(item.get("velocidade", 1), *VELOCIDADE) if tipo != "imagem" else 1
        if dura <= 0 or fim <= inicio:
            continue
        if tipo == "imagem":
            # No servidor os arquivos não têm extensão: diz o demuxer, que é o que aceita -loop.
            entradas += ["-f", "image2", "-pattern_type", "none", "-loop", "1", "-framerate", str(FPS), "-t", f"{dura:.6f}", "-i", caminho]
        else:
            entradas += ["-ss", f"{corte:.6f}", "-t", f"{dura * velocidade:.6f}", "-i", caminho]
        i = len([a for a in entradas if a == "-i"]) - 1
        if tipo != "audio":
            # Cobre o quadro, como a prévia (object-fit: cover). O arquivo pode acabar um quadro
            # antes (24 ou 25 fps viram 30): repete o último, senão o fundo preto pisca na emenda.
            grafo.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{velocidade:.5f},fps={FPS}[e{n}]")
            grafo += enquadrar(f"e{n}", f"q{n}", item.get("quadro"), w, h, n)
            grafo.append(f"[q{n}]tpad=stop_mode=clone:stop_duration=1,trim=end_frame={fim - inicio},setpts=PTS-STARTPTS+{inicio}/({FPS}*TB)[v{n}]")
            grafo.append(f"[{atual}][v{n}]overlay=eof_action=pass:format=yuv420[o{n}]")
            atual = f"o{n}"
        if tipo != "imagem" and volume > 0 and tem_som(caminho):
            atraso = round(entra * 1000)
            grafo.append(
                f"[{i}:a]aresample={TAXA},aformat=sample_fmts=fltp:channel_layouts=stereo,"
                f"asetpts=PTS-STARTPTS,{tempo(velocidade)},volume={volume:.4f},adelay={atraso}:all=1[s{n}]"
            )
            sons.append(f"[s{n}]")
            volumes.append(volume)
    grafo.append(f"[{atual}]trim=end_frame={quadros},setpts=PTS-STARTPTS[v]")
    silencio = f"anullsrc=r={TAXA}:cl=stereo:d={exata:.6f}"
    if sons:
        grafo.append(f"{silencio}[mudo]")
        # Sem normalizar a soma: o volume é o que a pessoa ajustou; o limitador só evita corte.
        grafo.append(f"[mudo]{''.join(sons)}amix=inputs={len(sons) + 1}:duration=longest:normalize=0,alimiter=limit=0.97:level=0,atrim=end={exata:.6f}[a]")
    else:
        grafo.append(f"{silencio}[a]")
    # O bloco mais alto diz o nível do trecho: som baixado de propósito continua baixo.
    return entradas, ";".join(grafo), quadros, min(max(volumes, default=1), 1)


def trecho(plano, saida, arquivos):
    entradas, grafo, quadros, nivel = filtros(plano, arquivos)
    ffmpeg(
        "-y", *entradas, "-filter_complex", grafo, "-map", "[v]", "-map", "[a]", "-frames:v", str(quadros),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high",
        # Sem B-frames e com o mesmo GOP e relógio em todos: a emenda sem recodificar sai limpa.
        # O FLAC na mesma profundidade em todos: o decodificador não aceita trocar no meio.
        "-bf", "0", "-g", str(FPS * 2), "-r", str(FPS), "-c:a", "flac", "-sample_fmt", "s16", "-ar", str(TAXA), "-ac", "2", "-f", "matroska", saida,
    )
    nivelar(saida, nivel)


def nivelar(caminho, nivel):
    """Leva o som do trecho a LUFS, vezes o nível, só com ganho e limitador, sem mexer na imagem."""
    r = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", caminho, "-af", f"loudnorm=I={LUFS}:print_format=json", "-vn", "-f", "null", "-"],
        capture_output=True, text=True, check=True, timeout=300,
    )
    log = r.stderr
    medido = float(json.loads(log[log.rindex("{"):log.rindex("}") + 1])["input_i"])
    if not math.isfinite(medido) or medido < SILENCIO:
        return
    temp = caminho + ".temp"
    ffmpeg(
        "-y", "-i", caminho, "-map", "0:v", "-map", "0:a", "-c:v", "copy",
        "-af", f"volume={LUFS - medido + 20 * math.log10(nivel):.2f}dB,alimiter=limit=0.84:level=0", "-c:a", "flac", "-sample_fmt", "s16",
        "-ar", str(TAXA), "-ac", "2", "-f", "matroska", temp,
    )
    os.replace(temp, caminho)


def emendar(saida, trechos):
    pasta = os.path.dirname(os.path.abspath(saida))
    lista = os.path.join(pasta, "lista.txt")
    with open(lista, "w") as f:
        for t in trechos:
            f.write("file '" + os.path.abspath(t).replace("'", "'\\''") + "'\n")
    ffmpeg(
        "-y", "-f", "concat", "-safe", "0", "-i", lista, "-map", "0:v", "-map", "0:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-movflags", "+faststart", "-f", "mp4", saida,
    )


def mosaico(saida, arquivo, instantes):
    """Os instantes do arquivo, lado a lado, para o agente ver o vídeo."""
    entradas = [a for t in instantes for a in ("-ss", f"{t:.3f}", "-i", arquivo)]
    n = len(instantes)
    pedacos = [f"[{i}:v]scale=-2:{ALTURA_QUADRO}[m{i}]" for i in range(n)]
    junta = f"{''.join(f'[m{i}]' for i in range(n))}hstack=inputs={n}[v]" if n > 1 else "[m0]null[v]"
    ffmpeg("-y", *entradas, "-filter_complex", ";".join([*pedacos, junta]), "-map", "[v]", "-frames:v", "1", "-q:v", "4", "-f", "image2", "-c:v", "mjpeg", saida, tempo=120)


def silencios(saida, arquivo):
    """Onde o som do arquivo para, com a regra da Edição rápida."""
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", arquivo, "-af", f"silencedetect=n={RUIDO}dB:d={SILENCIO_MIN}", "-vn", "-f", "null", "-"], capture_output=True, text=True, check=True, timeout=300)
    fim = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    duracao = int(fim[1]) * 3600 + int(fim[2]) * 60 + float(fim[3]) if fim else 0
    inicios = [float(v) for v in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    fins = [float(v) for v in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    with open(saida, "w") as f:
        json.dump({"duracao": duracao, "silencios": [[a, fins[i] if i < len(fins) else duracao] for i, a in enumerate(inicios)]}, f)


def crc32(caminho):
    crc = 0
    with open(caminho, "rb") as f:
        while bloco := f.read(1 << 20):
            crc = zlib.crc32(bloco, crc)
    return crc


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.responder(200 if self.path == "/saude" else 404, b"ok" if self.path == "/saude" else b"nao encontrado")

    def do_POST(self):
        if self.path not in ("/trecho", "/emendar", "/quadros", "/silencios"):
            return self.responder(404, b"nao encontrado")
        total = int(self.headers.get("content-length") or 0)
        try:
            tamanhos = [int(n) for n in (self.headers.get("x-tamanhos") or "").split(",")]
        except ValueError:
            return self.responder(400, b"x-tamanhos invalido")
        if not 0 < total <= LIMITE or sum(tamanhos) != total or min(tamanhos) <= 0:
            return self.responder(413, b"tamanho invalido")
        with vez, tempfile.TemporaryDirectory() as d:
            partes = []
            for i, tamanho in enumerate(tamanhos):
                caminho = os.path.join(d, f"entrada{i}")
                with open(caminho, "wb") as f:
                    while tamanho:
                        bloco = self.rfile.read(min(tamanho, 1 << 20))
                        if not bloco:
                            return self.responder(400, b"corpo incompleto")
                        f.write(bloco)
                        tamanho -= len(bloco)
                partes.append(caminho)
            saida = os.path.join(d, "saida")
            extra = {}
            try:
                if self.path == "/trecho":
                    with open(partes[0]) as f:
                        trecho(json.load(f), saida, partes[1:])
                elif self.path == "/quadros":
                    instantes = [numero(float(v), 0, 36000) for v in (self.headers.get("x-instantes") or "").split(",")]
                    if not 0 < len(instantes) <= MAX_QUADROS:
                        raise SystemExit("Instantes inválidos.")
                    mosaico(saida, partes[0], instantes)
                elif self.path == "/silencios":
                    silencios(saida, partes[0])
                else:
                    emendar(saida, partes)
                    extra["x-crc32"] = str(crc32(saida))
            except subprocess.CalledProcessError as e:
                return self.responder(500, e.stderr.encode()[-2000:] or b"falhou")
            except (SystemExit, ValueError, subprocess.TimeoutExpired) as e:
                return self.responder(500, str(e).encode()[-2000:] or b"falhou")
            self.send_response(200)
            self.send_header("content-type", "application/octet-stream")
            self.send_header("content-length", str(os.path.getsize(saida)))
            for k, v in extra.items():
                self.send_header(k, v)
            self.end_headers()
            with open(saida, "rb") as f:
                while bloco := f.read(1 << 20):
                    self.wfile.write(bloco)

    def responder(self, status, corpo):
        self.send_response(status)
        self.send_header("content-type", "text/plain")
        self.send_header("content-length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)


vez = threading.Lock()  # um por vez: o ffmpeg já usa todos os núcleos

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "trecho":
        with open(sys.argv[2]) as f:
            trecho(json.load(f), sys.argv[3], sys.argv[4:])
    elif len(sys.argv) > 2 and sys.argv[1] == "emendar":
        emendar(sys.argv[2], sys.argv[3:])
    else:
        # O Python é o PID 1 do contêiner, e o Linux ignora o SIGTERM no PID 1 sem um tratador:
        # sem isto, o "dormir" da Cloudflare (que só manda SIGTERM) nunca desliga o contêiner.
        signal.signal(signal.SIGTERM, lambda *_: os._exit(0))
        ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
