// Voz PAGA: ElevenLabs. O áudio já vem com o tempo de cada caractere (endpoint "with-timestamps"),
// então não precisa do Whisper. A chave fica no arquivo .env (ELEVENLABS_API_KEY) e nunca é impressa.

import fs from 'node:fs';

const API = 'https://api.elevenlabs.io/v1';
// Vozes prontas da conta (multilíngues). Escolha a sua com `node tools/voz.mjs vozes`.
export const MODELO_PADRAO = 'eleven_multilingual_v2';

function cabecalho(chave) {
  if (!chave) throw new Error('Falta a chave do ElevenLabs. Crie o arquivo .env (copie o .env.example) e preencha ELEVENLABS_API_KEY=...');
  return { 'xi-api-key': chave, 'Content-Type': 'application/json' };
}

async function erroApi(r) {
  let corpo = '';
  try { corpo = await r.text(); } catch { /* ignora */ }
  const dica = r.status === 401 ? 'A chave é inválida ou não tem permissão.'
    : r.status === 402 || /quota|credit/i.test(corpo) ? 'Os créditos do plano acabaram.'
      : r.status === 422 ? 'O ElevenLabs recusou o pedido (verifique o voiceId e o texto).'
        : r.status === 429 ? 'Muitos pedidos ao mesmo tempo. Espere um pouco.' : '';
  return new Error(`ElevenLabs respondeu ${r.status}. ${dica} ${corpo.slice(0, 200)}`.trim());
}

export async function listarVozes(chave) {
  const r = await fetch(`${API}/voices`, { headers: cabecalho(chave) });
  if (!r.ok) throw await erroApi(r);
  const j = await r.json();
  return (j.voices || []).map((v) => ({
    id: v.voice_id, nome: v.name, categoria: v.category,
    idioma: v.labels?.language || (v.verified_languages || []).map((l) => l.language).join(',') || '',
    descricao: v.labels?.descriptive || v.labels?.description || '',
  }));
}

// Converte o alinhamento por caractere em palavras (separadas por espaço) com início/fim em segundos.
export function palavrasDoAlinhamento(texto, alinhamento) {
  const chars = alinhamento.characters;
  const ini = alinhamento.character_start_times_seconds;
  const fim = alinhamento.character_end_times_seconds;
  const palavras = [];
  let atual = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      if (atual) { palavras.push(atual); atual = null; }
      continue;
    }
    if (!atual) atual = { palavra: '', inicio: ini[i], fim: fim[i] };
    atual.palavra += ch;
    atual.fim = fim[i];
  }
  if (atual) palavras.push(atual);
  return palavras.map((p) => ({ palavra: p.palavra, inicio: +p.inicio.toFixed(3), fim: +p.fim.toFixed(3) }));
}

export async function gerarElevenLabs({ texto, voiceId, chave, modelId = MODELO_PADRAO, velocidade = 1.0, saida }) {
  if (!voiceId) throw new Error('Falta escolher a voz do ElevenLabs: rode `node tools/voz.mjs vozes` e use `configurar-paga --voz <id>`.');
  if (texto.length > 4800) throw new Error(`O texto tem ${texto.length} caracteres; o limite por pedido é ~5000. Divida a narração.`);
  const url = `${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const r = await fetch(url, {
    method: 'POST',
    headers: cabecalho(chave),
    body: JSON.stringify({
      text: texto,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true, speed: velocidade },
    }),
  });
  if (!r.ok) throw await erroApi(r);
  const j = await r.json();
  if (!j.audio_base64 || !j.alignment) throw new Error('Resposta do ElevenLabs sem áudio ou sem alinhamento.');
  fs.writeFileSync(saida, Buffer.from(j.audio_base64, 'base64'));
  const palavras = palavrasDoAlinhamento(texto, j.alignment);
  const fimFala = palavras.length ? palavras[palavras.length - 1].fim : 0;
  return { palavras, duracaoFala: fimFala };
}
