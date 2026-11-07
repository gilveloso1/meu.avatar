// Central da voz do pack. Uso: node tools/voz.mjs <comando>
//
//   diagnostico [--json]          vê se o computador roda a voz grátis e o que falta
//   instalar [--forcar]           instala a voz GRÁTIS (Kokoro + Whisper) em .voz/ — pede ~0,5 GB de download
//   configurar-paga [--voz ID]    usa o ElevenLabs (a chave fica no .env como ELEVENLABS_API_KEY)
//   vozes                         lista as vozes da sua conta ElevenLabs
//   gerar projects/<nome>         gera a narração + tempos por palavra do projeto
//   testar                        gera uma frase curta com a voz configurada
//   status                        mostra a configuração atual

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnosticar, relatorio } from './voz/diagnostico.mjs';
import { instalarVozGratis } from './voz/instalar.mjs';
import { listarVozes } from './voz/elevenlabs.mjs';
import { gerarNarracao, lerEnv, lerConfigVoz } from './voz/gerar.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...resto] = process.argv.slice(2);
const flag = (n) => resto.includes(`--${n}`);
const valor = (n) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : undefined; };
lerEnv(raiz);

function salvarConfig(mudar) {
  const arq = path.join(raiz, 'config', 'voz.json');
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const cfg = mudar(lerConfigVoz(raiz));
  fs.writeFileSync(arq, JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

try {
  switch (cmd) {
    case 'diagnostico': {
      const d = diagnosticar(raiz);
      console.log(flag('json') ? JSON.stringify(d, null, 2) : relatorio(d));
      break;
    }
    case 'instalar':
      await instalarVozGratis(raiz, { forcar: flag('forcar') });
      break;
    case 'configurar-paga': {
      if (!process.env.ELEVENLABS_API_KEY) {
        console.error('Não achei ELEVENLABS_API_KEY. Copie .env.example para .env, cole a chave depois do "=" e rode de novo.');
        process.exit(1);
      }
      const voz = valor('voz');
      const cfg = salvarConfig((c) => ({ ...c, provedor: 'elevenlabs', elevenlabs: { ...c.elevenlabs, ...(voz ? { voiceId: voz } : {}) } }));
      console.log(`Voz paga (ElevenLabs) ativada.${cfg.elevenlabs?.voiceId ? ` Voz: ${cfg.elevenlabs.voiceId}.` : ' Falta escolher a voz: rode `node tools/voz.mjs vozes`.'}`);
      break;
    }
    case 'vozes': {
      const lista = await listarVozes(process.env.ELEVENLABS_API_KEY);
      for (const v of lista) console.log(`${v.id}  ${v.nome}  [${v.categoria}] ${v.idioma} ${v.descricao}`.trim());
      console.log(`\n${lista.length} voz(es). Para usar: node tools/voz.mjs configurar-paga --voz <id>`);
      break;
    }
    case 'gerar': {
      const projeto = resto.find((a) => !a.startsWith('--') && a !== valor('voz') && a !== valor('velocidade') && a !== valor('provedor'));
      if (!projeto) { console.error('Uso: node tools/voz.mjs gerar projects/<nome> [--provedor kokoro|elevenlabs] [--voz ID] [--velocidade 1.0]'); process.exit(1); }
      const r = await gerarNarracao(raiz, projeto.replace(/\\/g, '/'), {
        provedor: valor('provedor'), voz: valor('voz'), velocidade: valor('velocidade') ? Number(valor('velocidade')) : undefined,
      });
      console.log(JSON.stringify(r, null, 2));
      console.log(`\nPróximo passo: ajuste duracao e audio ("${r.audio}") no storyboard e alinhe as cenas com ${projeto}/frases.json.`);
      break;
    }
    case 'testar': {
      const pasta = path.join(raiz, 'projects', '_teste-voz');
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(path.join(pasta, 'narracao.txt'), 'Olá! Este é um teste de voz. Se você está me ouvindo, está tudo certo.\n');
      const r = await gerarNarracao(raiz, 'projects/_teste-voz', {});
      console.log(JSON.stringify(r, null, 2));
      console.log(`Ouça: projects/_teste-voz/${r.audio}`);
      break;
    }
    case 'status': {
      const c = lerConfigVoz(raiz);
      console.log(Object.keys(c).length ? JSON.stringify(c, null, 2) : 'Nenhuma voz configurada ainda.');
      console.log(`Chave ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? 'definida no .env' : 'não definida'}`);
      console.log(`Voz grátis instalada: ${fs.existsSync(path.join(raiz, '.voz', 'venv')) ? 'sim' : 'não'}`);
      break;
    }
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 11).join('\n'));
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`\nErro: ${e.message}`);
  process.exit(e.codigo || 1);
}
