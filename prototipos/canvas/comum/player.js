/**
 * Prévia de uma versão no navegador, sem montar arquivo: um elemento de mídia
 * por trecho da linha do tempo, desenhados num <canvas> 9:16 (a cobertura por
 * cima da base) e com o som de cada um no volume escolhido.
 */
import { sounds } from "./modelo.js";

export class Player {
  constructor(canvas, { onTick = () => {}, onEnd = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.items = [];
    this.duration = 0;
    this.t = 0;
    this.playing = false;
    this.box = document.createElement("div");
    this.box.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    document.body.append(this.box);
    this.loop = this.loop.bind(this);
  }

  load(tl) {
    this.pause();
    this.box.replaceChildren();
    this.duration = tl.duration;
    this.items = tl.items.map((i) => {
      const k = i.block.kind;
      const el = document.createElement(k === "image" ? "img" : k === "audio" ? "audio" : "video");
      el.src = i.block.src;
      if (k !== "image") {
        el.preload = "auto";
        el.playsInline = true;
        // Vídeo com o áudio desvinculado toca mudo: o som dele está no bloco de áudio.
        el.muted = !sounds(i.block);
        el.volume = Math.min(1, Math.max(0, i.block.vol));
      }
      this.box.append(el);
      return { ...i, el, active: false };
    });
    this.seek(0);
  }

  play() {
    if (!this.items.length) return;
    if (this.t >= this.duration - 0.02) this.t = 0;
    this.playing = true;
    this.t0 = performance.now() - this.t * 1000;
    requestAnimationFrame(this.loop);
  }

  pause() {
    this.playing = false;
    for (const i of this.items) if (i.el.pause) i.el.pause(), (i.active = false);
  }

  seek(t) {
    this.t = Math.max(0, Math.min(t, this.duration));
    this.t0 = performance.now() - this.t * 1000;
    for (const i of this.items) {
      if (!i.el.pause) continue;
      const local = Math.min(Math.max(this.t - i.start, 0), i.len);
      i.el.currentTime = i.tin + local;
      if (!this.playing) i.el.pause(), (i.active = false);
    }
    if (!this.playing) setTimeout(() => this.draw(), 120);
    this.onTick(this.t, this.duration);
  }

  loop() {
    if (!this.playing) return;
    this.t = (performance.now() - this.t0) / 1000;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.pause();
      this.draw();
      this.onTick(this.t, this.duration);
      return this.onEnd();
    }
    for (const i of this.items) {
      if (!i.el.pause) continue;
      const on = this.t >= i.start && this.t < i.start + i.len;
      const want = i.tin + (this.t - i.start);
      if (on && !i.active) {
        i.el.currentTime = want;
        i.el.play().catch(() => {});
        i.active = true;
      } else if (on && Math.abs(i.el.currentTime - want) > 0.3) i.el.currentTime = want;
      else if (!on && i.active) {
        i.el.pause();
        i.active = false;
        // Deixa pronto para a próxima vez que entrar.
        i.el.currentTime = i.tin;
      }
    }
    this.draw();
    this.onTick(this.t, this.duration);
    requestAnimationFrame(this.loop);
  }

  draw() {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const t = Math.min(this.t, this.duration - 0.001);
    const on = (layer) => this.items.find((i) => i.layer === layer && t >= i.start && t < i.start + i.len);
    for (const i of [on(0), on(1)]) {
      if (!i) continue;
      const el = i.el;
      const w = el.videoWidth || el.naturalWidth;
      const h = el.videoHeight || el.naturalHeight;
      if (!w || !h) continue;
      // Preenche o quadro (cover), como no vídeo exportado.
      const s = Math.max(W / w, H / h);
      ctx.drawImage(el, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
    }
  }
}

export const clock = (t) => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
