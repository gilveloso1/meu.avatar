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
 *
 * A animação em código é uma página isolada (iframe com sandbox, src/canvas/animacao.html) no
 * tamanho do Final, reduzida para o quadro; só a que está na tela é levada ao instante.
 */
import { codeHtml, placement, sounds } from "./modelo.js";
import { draftCard } from "./miniaturas.js";

const READY = 2; // HAVE_CURRENT_DATA: já há quadro para mostrar.
const FLOWING = 3; // HAVE_FUTURE_DATA: dá para seguir tocando.
const FRAME_WAIT_MS = 8000;

export class Player {
  constructor(stage, { onTick = () => {}, onEnd = () => {}, frameSrc = null } = {}) {
    this.stage = stage;
    this.frameSrc = frameSrc;
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.items = [];
    this.duration = 0;
    this.t = 0;
    this.playing = false;
    this.waiting = false;
    this.shown = { 0: null, 1: [] };
    this.loop = this.loop.bind(this);
    // Só vale o que vem de um quadro desta prévia; o resto da página não ouve o código.
    addEventListener("message", (e) => {
      const i = this.items.find((o) => o.el.contentWindow && o.el.contentWindow === e.source);
      if (!i) return;
      if (e.data?.tipo === "pronto") (i.ready = true), (i.sent = null), this.show();
      if (e.data?.tipo === "erro") console.warn("Animação com erro:", i.block.name, e.data.motivo);
    });
  }

  /** size: o tamanho do Final ({ width, height }), em que a animação se desenha. */
  load(tl, size = { width: 720, height: 1280 }) {
    this.pause();
    this.size = size;
    // Os elementos da prévia anterior ficam à mão: o trecho do mesmo arquivo reaproveita o dele, já
    // carregado e com imagem, em vez de baixar e decodificar tudo de novo a cada troca (escolher outro
    // bloco, outra variação, mexer num corte). Um que deu erro não volta: o novo tenta de novo.
    const spare = new Map();
    for (const i of this.items) {
      const el = i.el;
      if (el.tagName === "IFRAME" || el.error || (el.tagName === "IMG" && el.complete && !el.naturalWidth)) {
        discard(el);
        continue;
      }
      el.classList.remove("is-on");
      // O enquadramento do trecho de antes sai (place() o põe de novo no que tiver).
      el.removeAttribute("style");
      (spare.get(i.key) ?? spare.set(i.key, []).get(i.key)).push(el);
    }
    this.duration = tl.duration;
    this.shown = { 0: null, 1: [] };
    this.back ??= this.stage.appendChild(Object.assign(document.createElement("canvas"), { className: "pv-back", width: 36, height: 64 }));
    this.back.hidden = true;
    this.items = tl.items.map((i) => {
      if (i.block.code && this.frameSrc) return this.frame(i);
      const k = i.block.kind;
      const tag = k === "image" ? "img" : k === "audio" ? "audio" : "video";
      const src = i.block.draft ? draftCard(i.block) : i.block.src;
      const key = `${tag}\n${src}`;
      const el = spare.get(key)?.shift() ?? this.media(tag, src);
      const item = { ...i, el, key, active: false };
      // Os ouvintes do elemento leem o trecho de agora.
      el.item = item;
      el.dataset.layer = String(i.layer);
      if (k !== "image") {
        // Vídeo com o áudio desvinculado toca mudo: o som dele está no bloco de áudio.
        el.muted = !sounds(i.block);
        el.volume = Math.min(1, Math.max(0, i.block.vol));
        // A velocidade também vale ao carregar: o navegador zera ao trocar de arquivo.
        el.defaultPlaybackRate = el.playbackRate = i.speed;
      }
      return item;
    });
    // O que não serviu a esta prévia sai, e para de baixar.
    for (const list of spare.values()) list.forEach(discard);
    // No quadro, na ordem da lista (quem vem depois fica por cima), depois do fundo; só anda o que saiu do lugar.
    let at = this.back.nextElementSibling;
    for (const i of this.items) {
      if (i.el.tagName === "AUDIO") continue;
      if (i.el === at) at = at.nextElementSibling;
      else this.stage.insertBefore(i.el, at);
    }
    this.seek(0);
  }

  /** Um elemento novo de vídeo, áudio ou imagem para um arquivo; os ouvintes valem para o trecho que o estiver usando. */
  media(tag, src) {
    const el = document.createElement(tag);
    el.className = "pv-media";
    if (tag !== "img") {
      el.preload = "auto";
      el.playsInline = true;
      el.addEventListener(
        "loadedmetadata",
        () => {
          const i = el.item;
          if (!i) return;
          el.defaultPlaybackRate = el.playbackRate = i.speed;
          // Parado no quadro onde o trecho começa, pronto para entrar.
          if (el.currentTime === 0 && i.tin) el.currentTime = i.tin;
        },
        { once: true },
      );
      // Parado: mostra o quadro novo assim que o navegador terminar de buscar. Um ouvinte só por
      // arquivo (um a cada seek se acumulava ao arrastar o controle).
      el.addEventListener("seeked", () => !this.playing && el.item && this.show());
    }
    // Mostra o primeiro quadro assim que ele chega (antes de tocar).
    el.addEventListener(tag === "img" ? "load" : "loadeddata", () => el.item && this.show(), { once: true });
    el.src = src;
    return el;
  }

  /** A animação: o quadro carrega a página e recebe o código; fica pronta quando ela avisa. */
  frame(i) {
    const el = document.createElement("iframe");
    el.className = "pv-media pv-frame";
    el.dataset.layer = String(i.layer);
    el.setAttribute("sandbox", "allow-scripts");
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    const { width, height } = this.size;
    Object.assign(el.style, { width: `${width}px`, height: `${height}px` });
    el.addEventListener("load", () => el.contentWindow.postMessage({ tipo: "carregar", html: codeHtml(i.block.code), largura: width, altura: height, duracao: i.block.tout }, "*"), { once: true });
    el.src = this.frameSrc;
    const item = { ...i, el, active: false, ready: false, sent: null };
    // Sem resposta (quadro bloqueado, código que trava), a prévia segue sem a animação.
    setTimeout(() => !item.ready && ((item.failed = true), this.show()), FRAME_WAIT_MS);
    return item;
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

  /**
   * Mostra, em cada camada, o trecho da vez; se ele ainda não tem imagem, fica o anterior. Na camada de cima
   * entram todas as coberturas do instante, empilhadas pela trilha (a ordem da lista): a animação é transparente
   * e deixa ver a imagem de baixo, como na exportação.
   */
  show() {
    const t = Math.min(this.t, this.duration - 0.001);
    const on = (i) => !i.el.error && !i.failed && t >= i.start && t < i.start + i.len;
    const ready = (i) => (i.el.tagName === "IFRAME" ? i.ready : i.el.tagName === "IMG" ? i.el.complete : i.el.readyState >= READY && !i.el.seeking);
    // Na mesma camada de base, vale quem está na trilha mais alta: é o último da lista.
    const base = this.items.findLast((i) => i.layer === 0 && on(i));
    // As de fundo (-1) entram com as de cima: a ordem da lista as põe atrás da base no quadro.
    const tops = this.items.filter((i) => (i.layer === 1 || i.layer === -1) && on(i));
    // Quem deve aparecer ainda sem imagem: fica o que estava, senão outra coisa pisca na tela.
    const front = tops.length ? tops : base ? [base] : [];
    if (front.some((i) => !ready(i))) return;
    this.shown[1] = tops;
    // Sem ninguém naquele instante, a camada fica vazia (no fundo há sempre o preto).
    if (!base) this.shown[0] = null;
    else if (ready(base)) this.shown[0] = base;
    for (const i of this.items) {
      if (i.el.tagName === "AUDIO") continue;
      const visible = this.shown[0] === i || this.shown[1].includes(i);
      i.el.classList.toggle("is-on", visible);
      if (visible) this.place(i);
    }
    this.paintBack();
  }

  /** O bloco com enquadramento (e posição) fica onde a exportação põe; sem ele, vale o CSS (cobre o quadro). */
  place(i) {
    if (i.el.tagName === "IFRAME") return this.placeFrame(i);
    const frame = i.block.frame;
    const [vw, vh] = [i.el.videoWidth ?? i.el.naturalWidth, i.el.videoHeight ?? i.el.naturalHeight];
    if (!frame || !vw) return;
    const [W, H] = [this.stage.clientWidth, this.stage.clientHeight];
    const local = Math.max(this.t - i.start, 0) * (i.rate ?? 1);
    const { matrix, clip } = placement(frame, vw, vh, W, H, local);
    Object.assign(i.el.style, { inset: "auto", left: "0", top: "0", width: `${vw}px`, height: `${vh}px`, maxWidth: "none", maxHeight: "none", objectFit: "fill", transformOrigin: "0 0", transform: `matrix(${matrix.join(",")})`, clipPath: clip });
  }

  /** A animação cobre o quadro, reduzida do tamanho do Final, no instante dela. */
  placeFrame(i) {
    i.el.style.transform = `scale(${this.stage.clientWidth / this.size.width})`;
    const t = +(i.tin + Math.max(this.t - i.start, 0)).toFixed(3);
    if (i.ready && i.sent !== t) i.el.contentWindow.postMessage({ tipo: "tempo", t }, "*"), (i.sent = t);
  }

  /** Fundo desfocado: um quadro pequeno, esticado e borrado pelo CSS, sem outro vídeo tocando. */
  paintBack() {
    // O fundo é o da imagem mais de cima que não é animação.
    const pick = (o) => !o.block.code;
    const i = this.shown[1].findLast((o) => pick(o) && o.layer === 1) ?? this.shown[0] ?? this.shown[1].findLast(pick);
    // Numa área (posição), o desfocado fica só na exportação: aqui a imagem cabe na área, sem o fundo.
    const blur = i?.block.frame?.fit === "blur" && !i.block.frame.box;
    if (this.back.hidden === blur) this.back.hidden = !blur;
    if (!blur) return;
    try {
      this.back.getContext("2d").drawImage(i.el, 0, 0, 36, 64);
    } catch {}
  }
}

/** O elemento que a prévia não usa mais: sai do quadro e solta o arquivo (para de baixar e de decodificar). */
function discard(el) {
  el.item = null;
  el.remove();
  if (el.pause) {
    el.pause();
    el.removeAttribute("src");
    el.load();
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
