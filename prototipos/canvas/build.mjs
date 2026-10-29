// Monta os protótipos em dist/<nome>/: um index.html com o script e o CSS
// embutidos, mais a mídia de exemplo (e, no tldraw, os arquivos dele).
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const theme = readFileSync("../../src/site/theme.ts", "utf8");
const block = (name) => theme.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\``))[1];
const THEME = `:root {${block("LIGHT")}}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${block("DARK")} color-scheme: dark; } }
:root[data-theme="dark"] {${block("DARK")} color-scheme: dark; }`;
const ESTILO = readFileSync("comum/estilo.css", "utf8");

async function page(name, entry, extra = {}) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    write: false,
    minify: !!extra.minify,
    jsx: "automatic",
    loader: { ".css": "text" },
    define: extra.define ?? {},
    legalComments: "none",
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = readFileSync(`${name}/index.html`, "utf8")
    .replace("/*THEME*/", () => THEME)
    .replace("/*ESTILO*/", () => ESTILO)
    .replace("/*SCRIPT*/", () => js);
  mkdirSync(`dist/${name}`, { recursive: true });
  writeFileSync(`dist/${name}/index.html`, html);
  cpSync("midia", `dist/${name}/midia`, { recursive: true });
  console.log(`dist/${name}/index.html`, (html.length / 1024).toFixed(0), "KB");
}

await page("proprio", "proprio/canvas.js");
if (process.argv.includes("--tldraw") || !process.argv.includes("--proprio")) {
  // Em produção sem chave o tldraw para de desenhar: o protótipo roda no modo
  // de desenvolvimento dele, o que basta para avaliar.
  await page("tldraw", "tldraw/main.jsx", { minify: true, define: { "process.env.NODE_ENV": '"development"' } });
  const A = "node_modules/@tldraw/assets";
  for (const f of ["icons/icon/0_merged.svg", "translations/pt-br.json", "translations/en.json", "translations/languages.json", "translations/main.json"])
    cpSync(`${A}/${f}`, `dist/tldraw/tl/${f}`);
  for (const d of ["fonts", "embed-icons"]) cpSync(`${A}/${d}`, `dist/tldraw/tl/${d}`, { recursive: true });
}
