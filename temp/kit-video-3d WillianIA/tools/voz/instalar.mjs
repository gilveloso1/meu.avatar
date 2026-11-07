// Instala a voz GRÁTIS (Kokoro + Whisper) numa pasta isolada (.voz/), sem mexer no resto do computador.
// Para desinstalar: apague a pasta .voz/.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { diagnosticar, relatorio } from './diagnostico.mjs';

const BASE_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0';
const ARQUIVOS = {
  fp32: { nome: 'kokoro-v1.0.onnx', mb: 310 },
  int8: { nome: 'kokoro-v1.0.int8.onnx', mb: 88 },
  vozes: { nome: 'voices-v1.0.bin', mb: 27 },
};

export function caminhosVoz(raiz) {
  const base = path.join(raiz, '.voz');
  const venv = path.join(base, 'venv');
  const py = process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
  return { base, venv, py, modelos: path.join(base, 'modelos'), hf: path.join(base, 'hf') };
}

export function ambientePython(raiz) {
  const c = caminhosVoz(raiz);
  return { ...process.env, HF_HOME: c.hf, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', TOKENIZERS_PARALLELISM: 'false' };
}

const log = (m) => console.log(m);

function rodarPy(raiz, args, { silencioso = true } = {}) {
  const c = caminhosVoz(raiz);
  const r = spawnSync(c.py, args, { encoding: 'utf8', env: ambientePython(raiz), maxBuffer: 1 << 28 });
  if (r.status !== 0 && !silencioso) console.error(r.stderr || r.stdout);
  return r;
}

async function baixar(url, destino, mbEsperado) {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 1e6) { log(`  já existe: ${path.basename(destino)}`); return; }
  log(`  baixando ${path.basename(destino)} (~${mbEsperado} MB)…`);
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`Falha ao baixar ${url} (HTTP ${r.status}).`);
  const total = Number(r.headers.get('content-length')) || mbEsperado * 1e6;
  let lido = 0;
  let ultimo = -1;
  const origem = Readable.fromWeb(r.body);
  origem.on('data', (b) => {
    lido += b.length;
    const p = Math.floor((lido / total) * 10) * 10;
    if (p !== ultimo) { ultimo = p; process.stdout.write(`\r    ${Math.min(100, p)}%  `); }
  });
  const parcial = `${destino}.parte`;
  await pipeline(origem, fs.createWriteStream(parcial));
  fs.renameSync(parcial, destino);
  process.stdout.write('\r    100%  \n');
}

export async function instalarVozGratis(raiz, { forcar = false } = {}) {
  const diag = diagnosticar(raiz);
  log(relatorio(diag));
  log('');
  if (diag.veredito === 'nao') throw Object.assign(new Error('Este computador não atende aos requisitos mínimos. Use a voz paga (ElevenLabs).'), { codigo: 3 });
  if (!diag.pythonCmd) throw Object.assign(new Error('Python 3.9–3.12 não encontrado. Instale o Python 3.11 (python.org, marcando "Add to PATH") e rode de novo.'), { codigo: 4 });

  const c = caminhosVoz(raiz);
  fs.mkdirSync(c.modelos, { recursive: true });
  fs.mkdirSync(c.hf, { recursive: true });

  log('1/5 Ambiente Python isolado');
  if (forcar && fs.existsSync(c.venv)) fs.rmSync(c.venv, { recursive: true, force: true });
  if (!fs.existsSync(c.py)) {
    const [cmd, ...rest] = diag.pythonCmd;
    const r = spawnSync(cmd, [...rest, '-m', 'venv', c.venv], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Não consegui criar o ambiente Python: ${r.stderr || r.stdout}`);
  }

  log('2/5 Instalando bibliotecas (kokoro-onnx, soundfile, faster-whisper) — pode levar alguns minutos');
  spawnSync(c.py, ['-m', 'pip', 'install', '--upgrade', 'pip', '-q'], { encoding: 'utf8', env: ambientePython(raiz) });
  const pip = spawnSync(c.py, ['-m', 'pip', 'install', '-q', 'kokoro-onnx', 'soundfile', 'faster-whisper'], { encoding: 'utf8', env: ambientePython(raiz), maxBuffer: 1 << 28 });
  if (pip.status !== 0) throw new Error(`Falha ao instalar as bibliotecas:\n${(pip.stderr || pip.stdout || '').split('\n').slice(-25).join('\n')}`);

  log(`3/5 Baixando o modelo de voz Kokoro (${diag.modeloKokoro === 'fp32' ? 'completo' : 'leve'}) e as vozes`);
  const modelo = ARQUIVOS[diag.modeloKokoro];
  await baixar(`${BASE_URL}/${modelo.nome}`, path.join(c.modelos, modelo.nome), modelo.mb);
  await baixar(`${BASE_URL}/${ARQUIVOS.vozes.nome}`, path.join(c.modelos, ARQUIVOS.vozes.nome), ARQUIVOS.vozes.mb);

  log(`4/5 Baixando o Whisper "${diag.whisper}" (marca o tempo de cada palavra)`);
  const w = rodarPy(raiz, ['-c', `from faster_whisper import WhisperModel; WhisperModel("${diag.whisper}", device="cpu", compute_type="int8"); print("ok")`], { silencioso: false });
  if (w.status !== 0) throw new Error('Falha ao baixar o Whisper.');

  log('5/5 Teste de voz e de tempos por palavra');
  const texto = path.join(c.base, 'teste.txt');
  const wav = path.join(c.base, 'teste.wav');
  fs.writeFileSync(texto, 'Olá! Este é um teste da voz grátis. Se você está me ouvindo, a instalação funcionou.', 'utf8');
  const tts = rodarPy(raiz, [
    path.join(raiz, 'tools', 'voz', 'py', 'kokoro_tts.py'), '--modelo', path.join(c.modelos, modelo.nome),
    '--vozes', path.join(c.modelos, ARQUIVOS.vozes.nome), '--texto', texto, '--saida', wav, '--voz', 'pf_dora',
  ], { silencioso: false });
  if (tts.status !== 0) throw new Error('A voz não funcionou no teste (veja o erro acima).');
  const resumo = JSON.parse(tts.stdout.trim().split('\n').pop());
  const al = rodarPy(raiz, [
    path.join(raiz, 'tools', 'voz', 'py', 'alinhar.py'), '--audio', wav, '--texto', texto, '--saida', path.join(c.base, 'teste.palavras.json'), '--modelo', diag.whisper,
  ], { silencioso: false });
  if (al.status !== 0) throw new Error('O Whisper não funcionou no teste (veja o erro acima).');
  const ali = JSON.parse(al.stdout.trim().split('\n').pop());

  const cfgArq = path.join(raiz, 'config', 'voz.json');
  fs.mkdirSync(path.dirname(cfgArq), { recursive: true });
  const atual = fs.existsSync(cfgArq) ? JSON.parse(fs.readFileSync(cfgArq, 'utf8')) : {};
  const cfg = {
    ...atual,
    provedor: 'kokoro',
    kokoro: { voz: atual.kokoro?.voz || 'pf_dora', velocidade: atual.kokoro?.velocidade || 1.0, modelo: modelo.nome, vozes: ARQUIVOS.vozes.nome, whisper: diag.whisper },
    instalacao: { em: new Date().toISOString(), veredito: diag.veredito, velocidadeRelativa: resumo.velocidadeRelativa, coberturaTempos: ali.cobertura },
  };
  fs.writeFileSync(cfgArq, JSON.stringify(cfg, null, 2) + '\n');

  log('');
  log(`Pronto! Voz grátis instalada. Gerar ${resumo.duracao}s de áudio levou ${resumo.tempoSintese}s (${resumo.velocidadeRelativa}× mais rápido que o tempo real).`);
  log(`Tempos por palavra: ${Math.round(ali.cobertura * 100)}% das palavras reconhecidas.`);
  log(`Ouça o teste em: ${path.relative(raiz, wav)}`);
  return cfg;
}
