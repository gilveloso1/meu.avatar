// Monta o protótipo em dist/proprio/: a mesma tela do site (src/canvas/, por
// tools/canvas.mjs) com o exemplo de 6 versões e a mídia de exemplo, numa página
// só, para abrir fora do site. Rode `npm install` na raiz antes.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { montar } from "../../tools/canvas.mjs";

const theme = readFileSync("../../src/site/theme.ts", "utf8");
const block = (name) => theme.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\``))[1];
// O site segue só o tema do sistema; aqui a escolha explícita do visualizador também vale.
const THEME = `:root[data-theme="light"] {${block("LIGHT")} color-scheme: light; }
:root[data-theme="dark"] {${block("DARK")} color-scheme: dark; }`;
// Os componentes do M3 do site (src/site/style.ts), os mesmos das telas aprovadas.
const style = await build({ entryPoints: ["../../src/site/style.ts"], bundle: true, format: "esm", write: false });
const { CSS: SITE } = await import(`data:text/javascript;base64,${Buffer.from(style.outputFiles[0].text).toString("base64")}`);
const icons = readFileSync("../../src/site/site.ts", "utf8").match(/const ICONS = \[([\s\S]*?)\];/)[1].match(/"[a-z_]+"/g).map((s) => s.slice(1, -1));

const canvas = await montar();
// No site, as frases vêm de src/erros.ts; aqui, as mesmas, escritas à mão.
const config = { amostra: true, erros: { arquivo: "Não foi possível abrir o arquivo. Use MP4, MOV, JPG, PNG, MP3 ou M4A.", video: "Não foi possível abrir este vídeo. Tente de novo em instantes." } };
const html = `<meta charset="utf-8">
<title>Canvas Próprio</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${[...new Set([...icons, "restart_alt"])].sort().join(",")}&display=block">
<style>${SITE}
${THEME}</style>
${canvas.style}
<header class="top-app-bar">
  <button class="icon-button interactive" type="button" aria-label="Voltar" title="Voltar"><span class="icon">arrow_back</span></button>
  <h1 class="top-app-bar__title top-app-bar__title--page">Canvas de edição</h1>
  <div class="top-app-bar__actions">
    <button class="button button--text interactive" type="button" id="reset"><span class="icon">restart_alt</span>Exemplo</button>
    <button class="button button--outlined interactive" type="button" id="add-final"><span class="icon">flag</span>Bloco final</button>
    <button class="button button--filled interactive" type="button" id="import"><span class="icon">upload</span>Importar</button>
  </div>
</header>
${canvas.body}
<script type="application/json" id="canvas-config">${JSON.stringify(config)}</script>
<script type="module">${canvas.script}</script>
`;
mkdirSync("dist/proprio", { recursive: true });
writeFileSync("dist/proprio/index.html", html);
cpSync("midia", "dist/proprio/midia", { recursive: true });
console.log("dist/proprio/index.html", (html.length / 1024).toFixed(0), "KB");
