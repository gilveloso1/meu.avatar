// Render do vídeo: abre o player num Chrome/Edge sem janela, tira um quadro por vez e junta tudo com o ffmpeg.
//
//   node tools/render.mjs projects/<nome>                 → projects/<nome>/render/video.mp4 (qualidade final)
//   node tools/render.mjs projects/<nome> --previa        → versão rápida 540×960 (para conferir antes)
//   node tools/render.mjs projects/<nome> --quadros       → um PNG por cena em render/quadros/ (para olhar sem renderizar tudo)
//   node tools/render.mjs projects/<nome> --capa 1.2      → render/capa.png com o quadro do instante 1.2 s
//   node tools/render.mjs projects/<nome> --de 10 --ate 20  → só um trecho
//   opções: --cpu (força renderização por software), --saida arquivo.mp4

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';
import { acharNavegador } from './navegador.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const valor = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const projetoArg = args.find((a) => !a.startsWith('--') && !/^[\d.]+$/.test(a) && a !== valor('saida') && a !== valor('capa') && a !== valor('de') && a !== valor('ate'));

if (!projetoArg) {
  console.error('Uso: node tools/render.mjs projects/<nome> [--previa | --quadros | --capa T] [--de S --ate S] [--cpu]');
  process.exit(1);
}
const projeto = projetoArg.replace(/\\/g, '/').replace(/\/$/, '');
const pasta = path.join(raiz, projeto);
const sbArq = path.join(pasta, 'storyboard.json');
if (!fs.existsSync(sbArq)) { console.error(`Não achei ${path.relative(raiz, sbArq)}.`); process.exit(1); }
const sb = JSON.parse(fs.readFileSync(sbArq, 'utf8'));

const navegador = acharNavegador();
if (!navegador) {
  console.error('Não encontrei Chrome, Edge ou Brave. Instale um deles ou defina CHROME_PATH com o caminho do executável.');
  process.exit(2);
}
if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('O ffmpeg não está instalado (ou não está no PATH). Instale-o (ex.: winget install ffmpeg) e tente de novo.');
  process.exit(2);
}

const previa = flag('previa');
const escala = previa ? 0.5 : 1;
const W = Math.round((sb.formato?.largura || 1080) * escala);
const H = Math.round((sb.formato?.altura || 1920) * escala);
const fps = previa ? Math.min(sb.formato?.fps || 30, 24) : sb.formato?.fps || 30;
const duracao = sb.duracao;
const de = Number(valor('de') ?? 0);
const ate = Math.min(Number(valor('ate') ?? duracao), duracao);

const saidaDir = path.join(pasta, 'render');
fs.mkdirSync(saidaDir, { recursive: true });

const { server, port } = await startServer(0);
const browser = await puppeteer.launch({
  executablePath: navegador,
  headless: 'new',
  args: [
    '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl',
    ...(flag('cpu') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-unsafe-swiftshader']),
    `--window-size=${W},${H}`,
  ],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});

async function abrirPagina() {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[página]', m.text()); });
  await page.goto(`http://localhost:${port}/engine/player.html?projeto=${projeto}&render=1&w=${W}&h=${H}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__pronto === true || window.__erro', { timeout: 120000 });
  const erro = await page.evaluate('window.__erro');
  if (erro) throw new Error(erro);
  return page;
}

async function fechar(code = 0) {
  await browser.close().catch(() => {});
  server.close();
  process.exit(code);
}

try {
  const page = await abrirPagina();

  if (valor('capa') !== undefined) {
    const t = Number(valor('capa'));
    await page.evaluate((x) => window.renderAt(x), t);
    const arq = valor('saida') || path.join(saidaDir, 'capa.png');
    await page.screenshot({ path: arq, type: 'png' });
    console.log(`Capa salva em ${path.relative(raiz, arq)} (instante ${t}s, ${W}×${H}).`);
    await fechar(0);
  }

  if (flag('quadros')) {
    const dir = path.join(saidaDir, 'quadros');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    let i = 0;
    for (const [ini, fim] of sb.cenas.map((c) => [c.inicio, c.fim])) {
      i++;
      for (const [nome, t] of [['inicio', ini + Math.min(0.4, (fim - ini) * 0.15)], ['meio', (ini + fim) / 2]]) {
        await page.evaluate((x) => window.renderAt(x), t);
        const arq = path.join(dir, `cena${String(i).padStart(2, '0')}_${nome}.png`);
        await page.screenshot({ path: arq, type: 'png' });
      }
    }
    console.log(`${i * 2} quadros salvos em ${path.relative(raiz, dir)} (${W}×${H}).`);
    await fechar(0);
  }

  // vídeo completo (ou trecho)
  const audioArq = sb.audio ? path.join(pasta, sb.audio) : null;
  const temAudio = audioArq && fs.existsSync(audioArq);
  if (sb.audio && !temAudio) console.warn(`Aviso: áudio "${sb.audio}" não encontrado; o vídeo sai mudo.`);
  const saida = valor('saida') || path.join(saidaDir, previa ? 'previa.mp4' : 'video.mp4');
  const total = Math.round((ate - de) * fps);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0',
    ...(temAudio ? ['-ss', String(de), '-i', audioArq] : []),
    '-c:v', 'libx264', '-preset', previa ? 'veryfast' : 'medium', '-crf', previa ? '28' : '18', '-pix_fmt', 'yuv420p',
    ...(temAudio ? ['-c:a', 'aac', '-b:a', '192k', '-af', 'apad'] : []),
    '-t', String(ate - de), '-movflags', '+faststart', saida,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const terminou = new Promise((res) => ff.on('close', res));

  const inicio = Date.now();
  for (let i = 0; i < total; i++) {
    const t = de + i / fps;
    await page.evaluate((x) => window.renderAt(x), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: previa ? 80 : 95, optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0 || i === total - 1) {
      const seg = (Date.now() - inicio) / 1000;
      const falta = i > 0 ? (seg / i) * (total - i) : 0;
      process.stdout.write(`\rQuadro ${i + 1}/${total}  (${Math.round(((i + 1) / total) * 100)}%)  faltam ~${Math.round(falta)}s   `);
    }
  }
  ff.stdin.end();
  const code = await terminou;
  console.log('');
  if (code !== 0) throw new Error(`O ffmpeg terminou com erro (código ${code}).`);
  const mb = (fs.statSync(saida).size / 1e6).toFixed(1);
  console.log(`Pronto: ${path.relative(raiz, saida)} (${W}×${H}, ${fps} fps, ${(ate - de).toFixed(1)}s, ${mb} MB).`);
  await fechar(0);
} catch (e) {
  console.error(`\nErro no render: ${e.message}`);
  await fechar(1);
}
