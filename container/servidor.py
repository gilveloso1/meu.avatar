"""Servidor do contêiner de áudio: POST /tratar com o MP4 no corpo devolve o
MP4 com o áudio tratado (tratar.sh); POST /editar devolve a edição rápida
(editar.py), com o plano da prévia, se houver, no cabeçalho x-plano (JSON);
POST /rosto devolve, em JSON, onde está o rosto (rosto.py). GET /saude
responde ok. Um vídeo por vez em /tratar e /editar; /rosto é leve e tem a sua
própria vez, para a prévia não esperar uma edição de minutos."""
import os, subprocess, tempfile, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LIMITE = 300 * 1024 * 1024  # 300 MB
COMANDOS = {"/tratar": ["/app/tratar.sh"], "/editar": ["python3", "/app/editar.py"], "/rosto": ["python3", "/app/rosto.py"]}
uma_vez = threading.Lock()
rosto_vez = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/saude":
            return self.responder(200, b"ok", "text/plain")
        self.responder(404, b"nao encontrado", "text/plain")

    def do_POST(self):
        comando = COMANDOS.get(self.path)
        if not comando:
            return self.responder(404, b"nao encontrado", "text/plain")
        tamanho = int(self.headers.get("content-length") or 0)
        if not 0 < tamanho <= LIMITE:
            return self.responder(413, b"tamanho invalido", "text/plain")
        with rosto_vez if self.path == "/rosto" else uma_vez, tempfile.TemporaryDirectory() as d:
            entrada, saida = os.path.join(d, "in.mp4"), os.path.join(d, "out.mp4")
            with open(entrada, "wb") as f:
                restante = tamanho
                while restante:
                    bloco = self.rfile.read(min(restante, 1 << 20))
                    if not bloco:
                        return self.responder(400, b"corpo incompleto", "text/plain")
                    f.write(bloco)
                    restante -= len(bloco)
            if self.path == "/rosto":
                r = subprocess.run([*comando, entrada], capture_output=True, timeout=120)
                if r.returncode != 0:
                    return self.responder(500, (r.stderr or b"falhou")[-2000:], "text/plain")
                return self.responder(200, r.stdout.strip(), "application/json")
            plano = self.headers.get("x-plano")
            extra = [plano] if plano and self.path == "/editar" else []
            r = subprocess.run([*comando, entrada, saida, *extra], capture_output=True, timeout=600)
            if r.returncode != 0:
                return self.responder(500, (r.stderr or b"falhou")[-2000:], "text/plain")
            self.send_response(200)
            self.send_header("content-type", "video/mp4")
            self.send_header("content-length", str(os.path.getsize(saida)))
            self.end_headers()
            with open(saida, "rb") as f:
                while bloco := f.read(1 << 20):
                    self.wfile.write(bloco)

    def responder(self, status, corpo, tipo):
        self.send_response(status)
        self.send_header("content-type", tipo)
        self.send_header("content-length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
