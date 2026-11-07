// Monta o pack para distribuir: node tools/empacotar.mjs  →  dist/kit-video-3d.zip
// Fica de fora: node_modules, .voz (voz instalada), .env (chaves), renders, canal/voz configurados e logs.
// Dentro vão: assets, motor, ferramentas, catálogo, docs, templates, preview e o projeto de exemplo.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'dist');
// A montagem é feita numa pasta temporária FORA do projeto (não dá para copiar uma pasta para dentro dela mesma).
const stage = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-video-3d-')), 'kit-video-3d');
// NUNCA apaga nada dentro de dist/ (ali podem estar cópias de trabalho e vídeos do criador): só substitui o próprio zip.
fs.mkdirSync(stage, { recursive: true });
fs.mkdirSync(dist, { recursive: true });
fs.rmSync(path.join(dist, 'kit-video-3d.zip'), { force: true });

const FORA = [
  /(^|\/)node_modules(\/|$)/, /(^|\/)\.voz(\/|$)/, /(^|\/)\.git(\/|$)/, /(^|\/)dist(\/|$)/, /(^|\/)\.env$/,
  /^projects\/(?!exemplo-casa(\/|$)|exemplo-asfalto(\/|$))[^/]+/, /^projects\/[^/]+\/render(\/|$)/, /\.log$/, /(^|\/)\.serve/, /^config\/(canal|voz)\.json$/,
  /^package-lock\.json$/,
];
fs.cpSync(raiz, stage, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(raiz, src).replace(/\\/g, '/');
    return !rel || !FORA.some((r) => r.test(rel));
  },
});
fs.mkdirSync(path.join(stage, 'config'), { recursive: true });
fs.writeFileSync(path.join(stage, 'config', 'LEIA-ME.txt'), 'Aqui ficam config/canal.json (identidade do canal) e config/voz.json (voz escolhida). O agente cria os dois na primeira vez.\n');

const zip = path.join(dist, 'kit-video-3d.zip');
let r;
if (process.platform === 'win32') {
  // tar.exe do Windows (bsdtar); o "tar" do Git Bash não entende "C:\..."
  const tarWin = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  r = fs.existsSync(tarWin)
    ? spawnSync(tarWin, ['-a', '-c', '-f', zip, '-C', stage, '.'], { encoding: 'utf8' })
    : spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}' -Force`], { encoding: 'utf8' });
} else r = spawnSync('zip', ['-r', '-q', zip, '.'], { cwd: stage, encoding: 'utf8' });
if (r.status !== 0) { console.error(`Não consegui criar o zip: ${r.stderr || r.error}`); process.exit(1); }

const mb = (fs.statSync(zip).size / 1e6).toFixed(1);
let n = 0;
(function conta(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) conta(path.join(d, e.name)); else n++; } })(stage);
fs.rmSync(path.dirname(stage), { recursive: true, force: true });
console.log(`Pack criado: dist/kit-video-3d.zip (${mb} MB, ${n} arquivos).`);
