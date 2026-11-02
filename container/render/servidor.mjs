/**
 * Render das composições em HTML dos projetos (docs/api.md, src/render.ts): POST /render
 * recebe o HTML do agente e devolve um WebM transparente, feito pelo HyperFrames
 * (prototipos/hyperframes-linux, no branch claude/teste-hyperframes-linux).
 *
 * O agente manda só o conteúdo: elementos, <style> e <script>. Aqui ele vira a página
 * inteira, com o tamanho (x-largura, x-altura), a duração (x-duracao), as fontes de
 * fontes/ e o GSAP. A linha do tempo `tl` já existe, pausada: o agente só acrescenta.
 * As fontes vão por @font-face com o arquivo ao lado: assim o HyperFrames não procura
 * nada na rede (o contêiner não tem internet). GET /saude responde ok.
 */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = dirname(fileURLToPath(import.meta.url));
const FONTES = join(APP, "fontes");
const GSAP = join(APP, "node_modules/gsap/dist/gsap.min.js");
const HYPERFRAMES = join(APP, "node_modules/.bin/hyperframes");
const MAX_HTML = 1024 * 1024;
const MAX_DURACAO = 60;
const MAX_LADO = 1920;
const PRAZO_MS = 5 * 60_000;
const PADRAO = "Inter";

/** As famílias de fontes/, com o arquivo e os pesos de cada um. */
export const FAMILIAS = {
  "TikTok Sans": [["TikTokSans.ttf", "300 900"]],
  Inter: [["Inter.ttf", "100 900"]],
  Montserrat: [["Montserrat.ttf", "100 900"]],
  Roboto: [["Roboto.ttf", "100 900"]],
  "Open Sans": [["OpenSans.ttf", "300 800"]],
  Oswald: [["Oswald.ttf", "200 700"]],
  "Playfair Display": [["PlayfairDisplay.ttf", "400 900"]],
  Poppins: [400, 500, 600, 700, 800, 900].map((p) => [`Poppins-${p}.ttf`, String(p)]),
  Anton: [["Anton.ttf", "400"]],
  "Bebas Neue": [["BebasNeue.ttf", "400"]],
  "Archivo Black": [["ArchivoBlack.ttf", "400"]],
  "Courier Prime": [["CourierPrime-400.ttf", "400"], ["CourierPrime-700.ttf", "700"]],
  Pacifico: [["Pacifico.ttf", "400"]],
};

/** A página inteira: só as fontes citadas entram (cada uma é embutida no render). */
export function pagina(conteudo, largura, altura, duracao) {
  const citadas = Object.keys(FAMILIAS).filter((f) => f === PADRAO || conteudo.toLowerCase().includes(f.toLowerCase()));
  const fontes = citadas
    .flatMap((f) => FAMILIAS[f].map(([arquivo, peso]) => `@font-face{font-family:"${f}";src:url("fontes/${arquivo}") format("truetype");font-weight:${peso};font-style:normal}`))
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=${largura}, height=${altura}">
<style>
${fontes}
html,body{margin:0;width:${largura}px;height:${altura}px;overflow:hidden;background:transparent}
#root{position:relative;width:${largura}px;height:${altura}px;overflow:hidden;font-family:"${PADRAO}",sans-serif;color:#fff}
</style>
<script src="gsap.min.js"></script>
<script>window.__timelines={};const tl=gsap.timeline({paused:true});window.__timelines.main=tl;</script>
</head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duracao}" data-width="${largura}" data-height="${altura}">
${conteudo}
</div>
<script>tl.set({},{},${duracao});</script>
</body></html>
`;
}

function rodar(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(HYPERFRAMES, args, { env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" } });
    let log = "";
    const guarda = (b) => (log = (log + b).slice(-4000));
    p.stdout.on("data", guarda);
    p.stderr.on("data", guarda);
    const prazo = setTimeout(() => p.kill("SIGKILL"), PRAZO_MS);
    p.on("error", reject);
    p.on("close", (code) => {
      clearTimeout(prazo);
      if (code === 0) resolve(log);
      else reject(new Error(log || `saiu com ${code}`));
    });
  });
}

async function render(conteudo, largura, altura, duracao) {
  const pasta = await mkdtemp(join(tmpdir(), "render-"));
  try {
    await writeFile(join(pasta, "index.html"), pagina(conteudo, largura, altura, duracao));
    await symlink(FONTES, join(pasta, "fontes"));
    await symlink(GSAP, join(pasta, "gsap.min.js"));
    const saida = join(pasta, "saida.webm");
    await rodar(["render", pasta, "--format", "webm", "-o", saida]);
    return { pasta, saida };
  } catch (err) {
    await rm(pasta, { recursive: true, force: true });
    throw err;
  }
}

const numero = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Um render por vez: o Chrome já usa a máquina inteira.
let fila = Promise.resolve();

const servidor = createServer(async (req, res) => {
  const responde = (status, corpo) => {
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(corpo) });
    res.end(corpo);
  };
  if (req.method === "GET" && req.url === "/saude") return responde(200, "ok");
  if (req.method !== "POST" || req.url !== "/render") return responde(404, "nao encontrado");
  const largura = numero(req.headers["x-largura"], 16, MAX_LADO);
  const altura = numero(req.headers["x-altura"], 16, MAX_LADO);
  const duracao = numero(req.headers["x-duracao"], 0.1, MAX_DURACAO);
  if (!largura || !altura || !duracao || largura % 2 || altura % 2) return responde(400, "tamanho ou duracao invalidos");
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > MAX_HTML) return responde(413, "html grande demais");
    partes.push(parte);
  }
  const conteudo = Buffer.concat(partes).toString("utf8");
  if (!conteudo.trim()) return responde(400, "html vazio");
  const vez = fila.then(() => render(conteudo, largura, altura, duracao));
  fila = vez.catch(() => {});
  let feito;
  try {
    feito = await vez;
  } catch (err) {
    return responde(500, String(err.message ?? err).slice(-2000));
  }
  const { size } = await stat(feito.saida);
  res.writeHead(200, { "content-type": "video/webm", "content-length": size });
  const leitura = createReadStream(feito.saida);
  leitura.pipe(res);
  const limpa = () => rm(feito.pasta, { recursive: true, force: true });
  leitura.on("close", limpa);
  leitura.on("error", limpa);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // O Node é o PID 1 do contêiner: sem isto, o SIGTERM do "dormir" da Cloudflare é ignorado.
  process.on("SIGTERM", () => process.exit(0));
  servidor.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
}
