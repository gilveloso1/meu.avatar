// Diagnóstico do computador: diz se dá para usar a voz grátis (Kokoro + Whisper) e o que falta instalar.
//   node tools/voz.mjs diagnostico          (relatório em português)
//   node tools/voz.mjs diagnostico --json   (para o agente ler)

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { acharNavegador } from '../navegador.mjs';

function rodar(cmd, args = []) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return `${r.stdout || ''}${r.stderr || ''}`.trim();
  } catch { return null; }
}

// Procura um Python 3.9–3.12 (ordem: python, python3, py -3). Devolve { cmd: [...], versao } ou null.
export function acharPython() {
  const tentativas = [['python'], ['python3'], ['py', '-3']];
  for (const t of tentativas) {
    const out = rodar(t[0], [...t.slice(1), '--version']);
    const m = out && out.match(/Python (\d+)\.(\d+)\.(\d+)/);
    if (!m) continue;
    const [maior, menor] = [Number(m[1]), Number(m[2])];
    if (maior === 3 && menor >= 9) return { cmd: t, versao: `${m[1]}.${m[2]}.${m[3]}`, compativel: menor <= 12 };
  }
  return null;
}

function nomeGpu() {
  const nv = rodar('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader']);
  if (nv) return nv.split('\n')[0];
  if (process.platform === 'win32') {
    const w = rodar('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)']);
    if (w) return w;
  }
  return null;
}

export function diagnosticar(raiz) {
  const cpus = os.cpus();
  const ramGB = Math.round((os.totalmem() / 1e9) * 10) / 10;
  const nucleos = (os.availableParallelism ? os.availableParallelism() : cpus.length) || 1;
  let discoGB = null;
  try {
    const s = fs.statfsSync(raiz);
    discoGB = Math.round(((s.bavail * s.bsize) / 1e9) * 10) / 10;
  } catch { /* versões antigas do Node */ }

  const python = acharPython();
  const ffmpeg = !!rodar('ffmpeg', ['-version']);
  const navegador = acharNavegador() || null;
  const nodeMaior = Number(process.versions.node.split('.')[0]);

  const motivos = [];
  const pendencias = [];
  let nivel = 'ok';
  if (ramGB < 4) { nivel = 'nao'; motivos.push(`só ${ramGB} GB de RAM (o mínimo é 4 GB)`); }
  else if (ramGB < 8 || nucleos < 4) {
    nivel = 'limitado';
    motivos.push(`${ramGB} GB de RAM e ${nucleos} núcleos: roda, mas mais devagar (usaremos os modelos menores)`);
  }
  if (discoGB !== null && discoGB < 1.5) { nivel = 'nao'; motivos.push(`só ${discoGB} GB livres em disco (precisa de ~3 GB)`); }
  else if (discoGB !== null && discoGB < 3) pendencias.push(`pouco espaço em disco (${discoGB} GB livres; recomendado 3 GB)`);

  if (!python) pendencias.push('Python 3.9 a 3.12 não encontrado (instale o Python 3.11 em python.org e marque "Add to PATH")');
  else if (!python.compativel) pendencias.push(`Python ${python.versao} é novo demais para algumas bibliotecas; prefira o 3.11`);
  if (!ffmpeg) pendencias.push('ffmpeg não encontrado (necessário para juntar áudio e vídeo)');
  if (!navegador) pendencias.push('Chrome, Edge ou Brave não encontrado (necessário para renderizar o vídeo)');
  if (nodeMaior < 18) pendencias.push(`Node.js ${process.versions.node} é antigo; instale a versão 18 ou mais nova`);

  const grande = ramGB >= 16 && nucleos >= 8;
  return {
    sistema: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpu: `${cpus[0]?.model?.trim() || 'desconhecida'} — ${nucleos} núcleos`,
    ramGB,
    discoLivreGB: discoGB,
    gpu: nomeGpu(),
    node: process.versions.node,
    python: python ? python.versao : null,
    pythonCmd: python ? python.cmd : null,
    ffmpeg,
    navegador,
    veredito: nivel, // ok | limitado | nao
    podeUsarVozGratis: nivel !== 'nao' && pendencias.filter((p) => /Python|disco/.test(p)).length === 0,
    modeloKokoro: nivel === 'ok' && ramGB >= 8 ? 'fp32' : 'int8',
    whisper: grande ? 'small' : ramGB >= 8 ? 'base' : 'tiny',
    motivos,
    pendencias,
  };
}

export function relatorio(d) {
  const L = [];
  L.push('Diagnóstico do computador');
  L.push(`  Sistema ........ ${d.sistema}`);
  L.push(`  Processador .... ${d.cpu}`);
  L.push(`  Memória (RAM) .. ${d.ramGB} GB`);
  L.push(`  Disco livre .... ${d.discoLivreGB ?? '?'} GB`);
  L.push(`  Placa de vídeo . ${d.gpu || 'não detectada (não é necessária)'}`);
  L.push(`  Node.js ........ ${d.node}   Python: ${d.python || 'NÃO ENCONTRADO'}   ffmpeg: ${d.ffmpeg ? 'ok' : 'NÃO ENCONTRADO'}   Navegador: ${d.navegador ? 'ok' : 'NÃO ENCONTRADO'}`);
  L.push('');
  const v = { ok: 'Seu computador roda a voz grátis sem problemas.', limitado: 'Seu computador roda a voz grátis, mas com limitações.', nao: 'Seu computador NÃO tem requisitos mínimos para a voz grátis. Use a voz paga (ElevenLabs).' }[d.veredito];
  L.push(`Veredito: ${v}`);
  for (const m of d.motivos) L.push(`  - ${m}`);
  if (d.pendencias.length) { L.push('Pendências:'); for (const p of d.pendencias) L.push(`  - ${p}`); }
  if (d.veredito !== 'nao') L.push(`Configuração escolhida: Kokoro (${d.modeloKokoro === 'fp32' ? 'modelo completo, melhor qualidade' : 'modelo leve int8, mais rápido'}) + Whisper "${d.whisper}".`);
  return L.join('\n');
}
