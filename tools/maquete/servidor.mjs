// Visualizador ao vivo da maquete, com o painel de ajuste das poses (npm run maquete, só no
// computador; docs/maquete.md). Serve a página, o Three.js e a cena3d do contêiner de render, e a
// cena de tools/maquete/cena.json. /versao muda quando qualquer um deles muda, e a página recarrega
// sozinha. "Salvar ajustes" grava tools/maquete/ajustes.json (fora do git).
import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = fileURLToPath(new URL(".", import.meta.url));
const RAIZ = join(AQUI, "../..");
const RENDER = join(RAIZ, "container/render");
const PASTAS = {
  "/three/addons/": join(RENDER, "node_modules/three/examples/jsm"),
  "/three/": join(RENDER, "node_modules/three/build"),
  "/cena3d/": join(RENDER, "cena3d"),
};
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

async function versao() {
  let maior = 0;
  for (const f of await readdir(PASTAS["/cena3d/"])) maior = Math.max(maior, (await stat(join(PASTAS["/cena3d/"], f))).mtimeMs);
  for (const f of ["cena.json", "index.html"]) maior = Math.max(maior, (await stat(join(AQUI, f)).catch(() => ({ mtimeMs: 0 }))).mtimeMs);
  return String(maior);
}

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    if (caminho === "/versao") return res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }).end(await versao());
    // "Salvar ajustes" do painel: grava ajustes.json ao lado da cena, para o Claude ler.
    if (caminho === "/ajustes" && req.method === "POST") {
      let corpo = "";
      for await (const parte of req) corpo += parte;
      JSON.parse(corpo);
      await writeFile(join(AQUI, "ajustes.json"), corpo);
      return res.writeHead(204).end();
    }
    let arquivo = null;
    if (caminho === "/") arquivo = join(AQUI, "index.html");
    else if (caminho === "/cena.json") arquivo = join(AQUI, "cena.json");
    else
      for (const [prefixo, pasta] of Object.entries(PASTAS)) {
        if (!caminho.startsWith(prefixo)) continue;
        const alvo = normalize(join(pasta, caminho.slice(prefixo.length)));
        if (alvo.startsWith(pasta + sep)) arquivo = alvo;
        break;
      }
    if (!arquivo) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TIPOS[extname(arquivo)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(arquivo));
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.env.PORT) || 8790, "127.0.0.1", () => console.log(`Maquete ao vivo: http://localhost:${Number(process.env.PORT) || 8790}`));
