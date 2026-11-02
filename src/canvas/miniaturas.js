/** Miniaturas dos blocos: um quadro do vídeo, a própria imagem ou a onda do áudio. */
const cache = new Map();
// O quadro aparece com 64 px no bloco, 512 px com o zoom de 800%: 720 px ficam nítidos (sem aumentar o vídeo).
const FRAME_H = 720;
// A onda fica leve no bloco; só o que está à vista com zoom alto ganha a nítida (1 s tem 320 px em 800%).
const PEAK_PX = 480;
const LOW_PX = 120;
const LOW_H = 40;
const SHARP_H = 80;
const peaks = new Map();

export function thumb(block) {
  const key = block.draft ? `rascunho:${block.draft.fala}` : `${block.kind}:${block.src}`;
  if (!cache.has(key)) cache.set(key, make(block).catch(() => ""));
  return cache.get(key);
}

async function make(b) {
  if (b.draft) return draftCard(b);
  if (b.kind === "image") return b.src;
  if (b.kind === "video") return frame(b.src);
  return wave(b.src);
}

function frame(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.src = src;
    v.addEventListener("loadeddata", () => (v.currentTime = Math.min(0.5, v.duration / 2)), { once: true });
    v.addEventListener(
      "seeked",
      () => {
        const c = document.createElement("canvas");
        c.height = Math.min(FRAME_H, v.videoHeight);
        c.width = Math.round((c.height * v.videoWidth) / v.videoHeight);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      },
      { once: true },
    );
    v.addEventListener("error", reject, { once: true });
  });
}

/** Os picos do som, um byte por passo de 1/PEAK_PX s: é o que fica guardado de cada áudio. */
async function readPeaks(src) {
  const buf = await (await fetch(src)).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const step = audio.sampleRate / PEAK_PX;
  const out = new Float32Array(Math.ceil(data.length / step));
  // A onda ocupa a altura toda: o pico mais alto do arquivo vai até a borda.
  let top = 0;
  for (let x = 0; x < out.length; x++) {
    const end = Math.min(data.length, (x + 1) * step);
    for (let i = Math.floor(x * step); i < end; i += 4) out[x] = Math.max(out[x], Math.abs(data[i]));
    top = Math.max(top, out[x]);
  }
  return Uint8Array.from(out, (peak) => (peak / (top || 1)) * 255);
}

function peaksOf(src) {
  if (!peaks.has(src)) peaks.set(src, readPeaks(src));
  return peaks.get(src);
}

/** Desenha os picos de um trecho (em passos de 1/PEAK_PX s). */
function draw(p, start, end, width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  const per = (end - start) / width;
  for (let x = 0; x < width; x++) {
    const a = Math.floor(start + x * per);
    const b = Math.max(a + 1, Math.floor(start + (x + 1) * per));
    let peak = 0;
    for (let i = a; i < b; i++) peak = Math.max(peak, p[i] ?? 0);
    const h = Math.max(1, (peak / 255) * (height - 2));
    ctx.fillRect(x, (height - h) / 2, 1, h);
  }
  return c.toDataURL();
}

/** A onda do arquivo inteiro, leve: é a que fica no bloco. */
async function wave(src) {
  const p = await peaksOf(src);
  return draw(p, 0, p.length, Math.min(16000, Math.max(40, Math.round((p.length * LOW_PX) / PEAK_PX))), LOW_H);
}

/** A onda nítida de um trecho do arquivo (de `from` a `to`, em segundos), para o zoom alto. */
export async function sharpWave(src, from, to) {
  const p = await peaksOf(src);
  return draw(p, from * PEAK_PX, to * PEAK_PX, Math.min(16000, Math.max(40, Math.round((to - from) * PEAK_PX))), SHARP_H);
}

/** Duração de um arquivo importado (imagem: 3 s). */
export function probe(file) {
  const src = URL.createObjectURL(file);
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "video";
  if (kind === "image") return Promise.resolve({ src, kind, dur: 3 });
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve({ src, kind, dur: el.duration });
    el.onerror = reject;
    el.src = src;
  });
}

const cards = new Map();
const DRAFT_W = 720;
const DRAFT_H = 1280;

/**
 * O rascunho: um cartão vertical com a fala, nas cores da superfície do tema. Serve de miniatura
 * e de quadro na prévia, até o vídeo de verdade entrar no lugar.
 */
export function draftCard(b) {
  const fala = b.draft.fala;
  if (cards.has(fala)) return cards.get(fala);
  const css = getComputedStyle(document.documentElement);
  const cor = (nome, padrao) => css.getPropertyValue(nome).trim() || padrao;
  const c = document.createElement("canvas");
  c.width = DRAFT_W;
  c.height = DRAFT_H;
  const g = c.getContext("2d");
  g.fillStyle = cor("--md-sys-color-surface-container-highest", "#e6e0e9");
  g.fillRect(0, 0, DRAFT_W, DRAFT_H);
  g.fillStyle = cor("--md-sys-color-on-surface-variant", "#49454f");
  g.textAlign = "center";
  g.font = "500 36px Roboto, sans-serif";
  g.fillText("Rascunho", DRAFT_W / 2, 140);
  g.fillStyle = cor("--md-sys-color-on-surface", "#1d1b20");
  g.font = "400 52px Roboto, sans-serif";
  // A fala, quebrada na largura do cartão; o que não cabe termina em reticências.
  const linhas = [];
  let atual = "";
  for (const palavra of fala.split(/\s+/)) {
    const tenta = atual ? `${atual} ${palavra}` : palavra;
    if (g.measureText(tenta).width > DRAFT_W - 120 && atual) linhas.push(atual), (atual = palavra);
    else atual = tenta;
  }
  if (atual) linhas.push(atual);
  const max = 14;
  const vistas = linhas.length > max ? [...linhas.slice(0, max - 1), `${linhas[max - 1]}…`] : linhas;
  const topo = DRAFT_H / 2 - (vistas.length * 68) / 2 + 52;
  vistas.forEach((l, i) => g.fillText(l, DRAFT_W / 2, topo + i * 68));
  const url = c.toDataURL("image/png");
  cards.set(fala, url);
  return url;
}
