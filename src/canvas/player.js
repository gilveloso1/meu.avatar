/**
 * Prévia de uma versão no navegador, sem montar arquivo. Cada trecho da linha
 * do tempo tem o seu elemento de mídia, empilhado dentro do quadro 9:16 (a
 * cobertura por cima da base); o navegador desenha o vídeo ele mesmo, sem cópia
 * para canvas.
 *
 * Para não ficar preto nem engasgar (em qualquer navegador):
 * - cada trecho já fica parado no quadro onde começa, antes de entrar;
 * - a troca de trecho só acontece quando o próximo já tem imagem; até lá, o
 *   anterior continua na tela;
 * - se um trecho que está tocando precisa carregar, o relógio da prévia espera
 *   por ele em vez de pular (e o resto pausa junto);
 * - acerto de sincronia só com folga grande e nunca durante outro acerto.
 */
import { placement, sounds } from "./modelo.js";

const READY = 2; // HAVE_CURRENT_DATA: já há quadro para mostrar.
const FLOWING = 3; // HAVE_FUTURE_DATA: dá para seguir tocando.

export class Player {
  constructor(stage, { onTick = () => {}, onEnd = () => {} } = {}) {
    this.stage = stage;
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.items = [];
    this.duration = 0;
    this.t = 0;
    this.playing = false;
    this.waiting = false;
    this.shown = { 0: null, 1: null };
    this.loop = this.loop.bind(this);
  }

  load(tl) {
    this.pause();
    this.stage.querySelectorAll(".pv-media").forEach((el) => el.remove());
    this.duration = tl.duration;
    this.shown = { 0: null, 1: null };
    this.back ??= this.stage.appendChild(Object.assign(document.createElement("canvas"), { className: "pv-back", width: 36, height: 64 }));
    this.back.hidden = true;
    this.items = tl.items.map((i) => {
      const k = i.block.kind;
      const el = document.createElement(k === "image" ? "img" : k === "audio" ? "audio" : "video");
      el.className = "pv-media";
      el.dataset.layer = String(i.layer);
      if (k !== "image") {
        el.preload = "auto";
        el.playsInline = true;
        // Vídeo com o áudio desvinculado toca mudo: o som dele está no bloco de áudio.
        el.muted = !sounds(i.block);
        el.volume = Math.min(1, Math.max(0, i.block.vol));
        // A velocidade também vale ao carregar: o navegador zera ao trocar de arquivo.
        const rate = () => (el.defaultPlaybackRate = el.playbackRate = i.speed);
        rate();
        el.addEventListener("loadedmetadata", rate, { once: true });
        // Parado no quadro onde o trecho começa, pronto para entrar.
        el.addEventListener("loadedmetadata", () => el.currentTime === 0 && i.tin && (el.currentTime = i.tin), { once: true });
      }
      // Mostra o primeiro quadro assim que ele chega (antes de tocar).
      el.addEventListener(k === "image" ? "load" : "loadeddata", () => this.show(), { once: true });
      el.src = i.block.src;
      if (k !== "audio") this.stage.append(el);
      return { ...i, el, active: false };
    });
    this.seek(0);
  }

  play() {
    if (!this.items.length) return;
    if (this.t >= this.duration - 0.02) this.seek(0);
    this.playing = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  pause() {
    this.playing = false;
    for (const i of this.items) if (i.el.pause) i.el.pause(), (i.active = false);
  }

  seek(t) {
    this.t = Math.max(0, Math.min(t, this.duration));
    for (const i of this.items) {
      if (!i.el.pause) continue;
      const local = Math.min(Math.max(this.t - i.start, 0), i.len);
      setTime(i.el, i.tin + local * i.speed);
      if (!this.playing) i.el.pause(), (i.active = false);
    }
    this.show();
    // Parado: mostra o quadro novo assim que o navegador terminar de buscar.
    if (!this.playing) for (const i of this.items) i.el.addEventListener?.("seeked", () => this.show(), { once: true });
    this.onTick(this.t, this.duration);
  }

  loop(now) {
    if (!this.playing) return;
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    const on = (i) => this.t >= i.start && this.t < i.start + i.len;
    // Um trecho que toca e ainda não tem dados para seguir: o relógio espera.
    const stalled = this.items.some((i) => i.el.pause && i.active && on(i) && (i.el.readyState < FLOWING || i.el.seeking));
    if (stalled !== this.waiting) {
      this.waiting = stalled;
      for (const i of this.items) if (i.active && i.el.pause) stalled ? i.el.pause() : i.el.play().catch(() => {});
    }
    if (!stalled) this.t += dt;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.pause();
      this.show();
      this.onTick(this.t, this.duration);
      return this.onEnd();
    }
    for (const i of this.items) {
      if (!i.el.pause) continue;
      const want = i.tin + (this.t - i.start) * i.speed;
      if (on(i) && !i.active) {
        setTime(i.el, want, 0.1);
        if (!stalled) i.el.play().catch(() => {});
        i.active = true;
      } else if (on(i) && !stalled && !i.el.seeking && Math.abs(i.el.currentTime - want) > 0.5) {
        setTime(i.el, want);
      } else if (!on(i) && i.active) {
        // Pausa no último quadro (que segue na tela até o próximo ter imagem).
        i.el.pause();
        i.active = false;
      } else if (!on(i) && !i.active && i.start > this.t && i.start - this.t < 1.5) {
        // Logo antes de entrar: confere que está parado no começo do trecho.
        setTime(i.el, i.tin, 0.1);
      }
    }
    this.show();
    this.onTick(this.t, this.duration);
    requestAnimationFrame(this.loop);
  }

  /** Mostra, em cada camada, o trecho da vez; se ele ainda não tem imagem, fica o anterior. */
  show() {
    const t = Math.min(this.t, this.duration - 0.001);
    // Na mesma camada, vale quem está na trilha mais alta: é o último da lista.
    const at = (layer) => this.items.findLast((i) => i.layer === layer && !i.el.error && t >= i.start && t < i.start + i.len);
    const ready = (i) => (i.el.tagName === "IMG" ? i.el.complete : i.el.readyState >= READY && !i.el.seeking);
    const top = at(1);
    const base = at(0);
    // Quem deve aparecer ainda sem imagem: fica o que estava, senão outra coisa pisca na tela.
    const front = top ?? base;
    if (front && !ready(front)) return;
    this.shown[1] = top ?? null;
    // Sem ninguém naquele instante, a camada fica vazia (no fundo há sempre o preto).
    if (!base) this.shown[0] = null;
    else if (ready(base)) this.shown[0] = base;
    for (const i of this.items) {
      if (i.el.tagName === "AUDIO") continue;
      const on = this.shown[0] === i || this.shown[1] === i;
      i.el.classList.toggle("is-on", on);
      if (on) this.place(i);
    }
    this.paintBack();
  }

  /** O bloco com enquadramento fica onde a exportação põe; sem ele, vale o CSS (cobre o quadro). */
  place(i) {
    const frame = i.block.frame;
    const [vw, vh] = [i.el.videoWidth ?? i.el.naturalWidth, i.el.videoHeight ?? i.el.naturalHeight];
    if (!frame || !vw) return;
    const [W, H] = [this.stage.clientWidth, this.stage.clientHeight];
    const local = Math.max(this.t - i.start, 0) * (i.rate ?? 1);
    const { matrix, clip } = placement(frame, vw, vh, W, H, local);
    Object.assign(i.el.style, { inset: "auto", left: "0", top: "0", width: `${vw}px`, height: `${vh}px`, maxWidth: "none", maxHeight: "none", objectFit: "fill", transformOrigin: "0 0", transform: `matrix(${matrix.join(",")})`, clipPath: clip });
  }

  /** Fundo desfocado: um quadro pequeno, esticado e borrado pelo CSS, sem outro vídeo tocando. */
  paintBack() {
    const i = this.shown[1] ?? this.shown[0];
    const blur = i?.block.frame?.fit === "blur";
    this.back.hidden = !blur;
    if (!blur) return;
    try {
      this.back.getContext("2d").drawImage(i.el, 0, 0, 36, 64);
    } catch {}
  }
}

/** Busca um ponto no arquivo só se estiver longe dele (cada busca custa um carregamento). */
function setTime(el, s, tol = 0.04) {
  if (Math.abs(el.currentTime - s) > tol) {
    try {
      el.currentTime = s;
    } catch {}
  }
}

export const clock = (t) => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
