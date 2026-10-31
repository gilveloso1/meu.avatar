/** Miniaturas dos blocos: um quadro do vídeo, a própria imagem ou a onda do áudio. */
const cache = new Map();
// O quadro aparece com 64 px no bloco, 512 px com o zoom de 800%: 720 px ficam nítidos (sem aumentar o vídeo).
const FRAME_H = 720;
const WAVE_PX = 480;
const WAVE_H = 80;

export function thumb(block) {
  const key = `${block.kind}:${block.src}`;
  if (!cache.has(key)) cache.set(key, make(block).catch(() => ""));
  return cache.get(key);
}

async function make(b) {
  if (b.kind === "image") return b.src;
  if (b.kind === "video") return frame(b.src);
  return wave(b.src, b.dur);
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

async function wave(src, dur) {
  const buf = await (await fetch(src)).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const c = document.createElement("canvas");
  // Com o zoom de 800%, 1 s tem 320 px: a onda continua nítida (até o limite do canvas).
  c.width = Math.min(16000, Math.max(40, Math.round(dur * WAVE_PX)));
  c.height = WAVE_H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  const step = Math.floor(data.length / c.width);
  const peaks = [];
  for (let x = 0; x < c.width; x++) {
    let peak = 0;
    for (let i = x * step; i < (x + 1) * step; i += 4) peak = Math.max(peak, Math.abs(data[i] || 0));
    peaks.push(peak);
  }
  // A onda ocupa a altura toda: o pico mais alto do arquivo vai até a borda.
  const top = Math.max(...peaks) || 1;
  peaks.forEach((peak, x) => {
    const h = Math.max(2, (peak / top) * (WAVE_H - 4));
    ctx.fillRect(x, (WAVE_H - h) / 2, 1, h);
  });
  return c.toDataURL();
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
