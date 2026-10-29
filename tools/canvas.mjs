/**
 * Junta o canvas de edição (src/canvas/: tela.html e os módulos .js) num
 * arquivo que o Worker importa, src/site/canvas.ts, com o estilo, o corpo e o
 * script já empacotado. O protótipo (prototipos/canvas/) usa o mesmo montar().
 *
 *   npm run canvas   # rode depois de mudar qualquer arquivo de src/canvas/
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function montar() {
  const tela = readFileSync(join(root, "src/canvas/tela.html"), "utf8");
  const style = tela.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = tela.slice(tela.indexOf("</style>") + "</style>".length).trim();
  const out = await build({
    entryPoints: [join(root, "src/canvas/canvas.js")],
    bundle: true,
    format: "esm",
    write: false,
    legalComments: "none",
  });
  const script = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  return { style, body, script };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { style, body, script } = await montar();
  const out = `/**
 * Gerado por \`npm run canvas\` a partir de src/canvas/. Não edite à mão:
 * mude os arquivos de lá e rode o comando de novo.
 */
export const CANVAS_STYLE = ${JSON.stringify(style)};

export const CANVAS_BODY = ${JSON.stringify(body)};

export const CANVAS_SCRIPT = ${JSON.stringify(script)};
`;
  writeFileSync(join(root, "src/site/canvas.ts"), out);
  console.log(`✅ Canvas gerado em src/site/canvas.ts (${(out.length / 1024).toFixed(0)} KB).`);
}
