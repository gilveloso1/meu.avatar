// Servidor estático mínimo (sem dependências). Uso: npm run preview
// Também é importado pelo render (tools/render.mjs) com startServer(0) para usar uma porta livre.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
};

export function startServer(port = 5173) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Redireciona (em vez de servir direto) para que os caminhos relativos da página (./main.js) funcionem.
    if (rel === '/' || rel === '/preview') { res.writeHead(302, { Location: '/preview/index.html' }).end(); return; }
    const file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    // Segredos nunca são servidos.
    if (/(^|[\\/])(\.env|\.voz)([\\/]|$)/.test(path.relative(root, file))) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ server, port: server.address().port }));
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 5173;
  startServer(port)
    .then(({ port: p }) => console.log(`Preview em http://localhost:${p}`))
    .catch((e) => { console.error(e.code === 'EADDRINUSE' ? `A porta ${port} já está em uso (talvez o preview já esteja aberto).` : e.message); process.exit(1); });
}
