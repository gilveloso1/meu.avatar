// Monta os protótipos em dist/<nome>/: um index.html com o script e o CSS
// embutidos, mais a mídia de exemplo.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const theme = readFileSync("../../src/site/theme.ts", "utf8");
const block = (name) => theme.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\``))[1];
const THEME = `:root {${block("LIGHT")}}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${block("DARK")} color-scheme: dark; } }
:root[data-theme="dark"] {${block("DARK")} color-scheme: dark; }`;
const ESTILO = readFileSync("comum/estilo.css", "utf8");

async function page(name, entry) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    write: false,
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
