/** Miniaturas dos blocos: um quadro do vídeo, a própria imagem ou a onda do áudio. */
const cache = new Map();

export function thumb(block) {
  const key = block.src;
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
        c.height = 96;
        c.width = Math.round((96 * v.videoWidth) / v.videoHeight);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.7));
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
  c.width = Math.max(40, Math.round(dur * 24));
  c.height = 40;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  const step = Math.floor(data.length / c.width);
  for (let x = 0; x < c.width; x++) {
    let peak = 0;
    for (let i = x * step; i < (x + 1) * step; i += 16) peak = Math.max(peak, Math.abs(data[i] || 0));
    const h = Math.max(2, peak * 36);
    ctx.fillRect(x, (40 - h) / 2, 1, h);
  }
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
