/**
 * Canvas de edição com código próprio: DOM e SVG dentro de um "mundo" com
 * translate/scale. O significado (grupos, coberturas, versões) vem do
 * modelo.js; aqui só desenho e gestos. Quem monta a página passa a
 * configuração em <script type="application/json" id="canvas-config">:
 * { amostra: true } (o protótipo, com o exemplo) ou, no site, { videos: [...] }
 * (os vídeos prontos de quem usa: id, name, src, when), projeto ({ id, name,
 * data, criado, modificado, autor, salvar, arquivos }: o que está salvo e para onde salvar e enviar
 * arquivos, exportar), animacao (a página isolada que roda as animações em código na prévia),
 * exportacao (a última, para retomar) e limites ({ imagem, video }, em bytes); e as frases de erro em
 * erros, que vêm do catálogo src/erros.ts.
 */
import * as M from "./modelo.js";
import { Player, clock } from "./player.js";
import { thumb, sharpWave, probe } from "./miniaturas.js";

const $ = (s, el = document) => el.querySelector(s);
const vp = $("#vp");
const world = $("#world");
const wires = $("#wires");
const chrome = $("#chrome");
const side = $("#side");
const SNAP = { video: "Trilha de vídeo", sound: "Trilha de som" };
const fmt = (s) => `${s.toFixed(1).replace(".", ",")} s`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let CONFIG = {};
try {
  CONFIG = JSON.parse($("#canvas-config")?.textContent || "{}");
} catch {}
const emptyProject = () => ({ blocks: [], finals: [], edges: [] });
const PROJETO = CONFIG.projeto ?? null;
const valid = (d) => d && Array.isArray(d.blocks) && Array.isArray(d.finals) && Array.isArray(d.edges);
let project = valid(PROJETO?.data) ? PROJETO.data : CONFIG.amostra ? M.sample((f) => `midia/${f}`) : emptyProject();
project = M.upgrade(project);
// O canvas vazio começa sem Final (projetos antigos já vinham com um).
if (PROJETO && !project.blocks.length) project = { ...project, finals: [] };
let projectName = PROJETO?.name ?? "";
let projectEdited = PROJETO?.modificado ?? "";
let view = { x: 80, y: 120, z: 0.8 };
let sel = project.finals[0] ? { type: "final", id: project.finals[0].id } : { type: null };
let versionIdx = 0;
// O que a prévia toca: null (a variação escolhida no Final), um grupo ou um bloco.
let preview = null;
// O Final cuja variação escolhida está destacada no canvas.
let litFinal = null;
const undo = [];
const redo = [];

/* ---------- prévia ---------- */

const pv = {
  stage: $("#pv-stage"),
  play: $("#pv-play"),
  time: $("#pv-time"),
  slider: $("#pv-slider"),
  title: $("#pv-title"),
};
const player = new Player(pv.stage, {
  frameSrc: CONFIG.animacao ?? null,
  onTick(t, d) {
    pv.time.textContent = `${clock(t)} / ${clock(d)}`;
    pv.slider.max = d;
    pv.slider.value = t;
    pv.slider.style.setProperty("--p", `${d ? (t / d) * 100 : 0}%`);
    chrome.querySelector(".fin__bar")?.style.setProperty("--p", String(d ? t / d : 0));
    playhead(t);
  },
  onEnd: () => {
    setPlayIcon();
    render({ side: false });
  },
});
const setPlayIcon = () => {
  const ended = !player.playing && player.duration && player.t >= player.duration - 0.02;
  pv.play.querySelector(".icon").textContent = player.playing ? "pause" : ended ? "replay" : "play_arrow";
  pv.play.ariaLabel = pv.play.title = player.playing ? "Pausar" : ended ? "Ver de novo" : "Tocar";
};
pv.play.onclick = () => {
  player.playing ? player.pause() : player.play();
  setPlayIcon();
  render({ side: false });
};
pv.slider.oninput = () => player.seek(+pv.slider.value);
let loadedKey = "";
function loadPreview() {
  const gs = M.groups(project);
  let v = null;
  let title = "Nada para tocar";
  let tl = null;
  if (preview?.type === "group") {
    const g = gs.find((g) => g.id === preview.id);
    if (g) (v = [g]), (title = g.label);
  }
  if (preview?.type === "block") {
    const b = project.blocks.find((b) => b.id === preview.id);
    if (b) {
      // Só o bloco, do corte dele: sem o que está por cima nem o som somado.
      tl = { duration: M.len(b), items: [{ block: b, layer: b.kind === "audio" ? "audio" : 0, start: 0, len: M.len(b), tin: b.tin, speed: b.speed ?? 1 }] };
      title = b.name;
    }
  }
  if (!v && !tl) {
    const f = previewFinal();
    const vs = f ? M.versions(project, f.id, gs) : [];
    if (vs.length) {
      v = vs[versionIdx];
      title = M.versionName(versionIdx);
    }
  }
  tl ??= v ? M.timeline(v, M.finalRate(previewFinal())) : { duration: 0, items: [] };
  const key = JSON.stringify(tl.items.map((i) => [i.block.id, i.block.src, i.block.draft?.fala, i.block.draft?.descricao, i.block.code && M.codeHtml(i.block.code), i.block.tout, i.start, i.len, i.tin, i.speed, i.block.frame, i.block.mute, i.block.vol]));
  pv.title.textContent = title;
  if (key === loadedKey) return playhead(player.t);
  loadedKey = key;
  player.load(tl, M.output(previewFinal()));
  setPlayIcon();
}

/** O Final de onde vem a variação da prévia. */
const previewFinal = () => (sel.type === "final" && project.finals.find((f) => f.id === sel.id)) || project.finals[0];

/** Linha de reprodução sobre o bloco ou o grupo que a prévia toca (na variação, não aparece). */
const head = document.createElement("div");
head.className = "playhead";
head.innerHTML = `<span class="playhead__knob"></span>`;
world.append(head);
let headBox = null;
function playhead(t) {
  let box = null;
  if (preview?.type === "block") {
    const b = project.blocks.find((b) => b.id === preview.id);
    if (b) box = { x: b.x, y: b.y, h: M.height(b) };
  } else if (preview?.type === "group") {
    const g = M.groups(project).find((g) => g.id === preview.id);
    if (g) {
      box = { x: g.x, y: g.top, h: g.bottom - g.top };
    }
  }
  headBox = box;
  // Aparece sempre que a prévia toca um bloco ou um grupo, para poder arrastar.
  head.hidden = !box;
  // Passa 4 px (na tela) acima e abaixo do que toca, com qualquer zoom.
  const pad = 4 / Math.max(1, view.z);
  if (box) Object.assign(head.style, { left: `${box.x + t * M.PX - pad / 4}px`, top: `${box.y - pad}px`, height: `${box.h + 2 * pad}px` });
}
/** Tocar numa variação do Final: destaca o caminho e toca; a que já está na prévia pausa ou continua. */
function pickVariant(id, i) {
  const same = !preview && previewFinal()?.id === id && versionIdx === i;
  litFinal = id;
  sel = { type: "final", id };
  if (same && player.playing) {
    player.pause();
    setPlayIcon();
    return render();
  }
  if (!same) {
    versionIdx = i;
    return playNow(null);
  }
  setTab("previa");
  player.play();
  setPlayIcon();
  render();
}
function playNow(p) {
  // Tocar algo mostra a Prévia.
  setTab("previa");
  preview = p;
  render();
  player.seek(0);
  player.play();
  setPlayIcon();
  render({ side: false });
}

/** O quadro da prévia tem o formato do Final (o escolhido, ou o primeiro). */
function frameRatio() {
  const out = M.output(previewFinal());
  $("#pv-stage").style.setProperty("--ar", String(out.width / out.height));
}

/* ---------- abas da folha ---------- */

const sheetBody = $(".sheet-body");
function setTab(tab) {
  sheetBody.dataset.tab = tab;
  for (const b of document.querySelectorAll(".viewer__sheet [data-tab][role=tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  for (const p of sheetBody.querySelectorAll("[data-panel]")) p.hidden = p.dataset.panel !== tab;
  for (const t of sheetBody.querySelectorAll("#f-fala, #f-descricao, #f-nota")) fitText(t);
  showActions();
  try {
    localStorage.setItem("canvas-aba", tab);
  } catch {}
}
for (const b of document.querySelectorAll(".viewer__sheet [role=tab]")) b.addEventListener("click", () => setTab(b.dataset.tab));
try {
  const saved = localStorage.getItem("canvas-aba");
  if (saved === "previa" || saved === "ajustes") setTab(saved);
} catch {}

/* ---------- histórico ---------- */

function commit(before) {
  if (JSON.stringify(before) === JSON.stringify(project)) return;
  undo.push(before);
  if (undo.length > 100) undo.shift();
  redo.length = 0;
  scheduleSave();
}

/* ---------- salvar (no site: o projeto vai para o servidor pouco depois de cada mudança) ---------- */

const REFRESH_MS = 5000;
let saveTimer = 0;
let saving = Promise.resolve();
let pending = 0;
// Com o botão apertado há um gesto no meio: o projeto não muda embaixo dele.
let pressed = false;
addEventListener("pointerdown", () => (pressed = true), true);
for (const end of ["pointerup", "pointercancel"]) addEventListener(end, () => (pressed = false), true);
let revision = PROJETO?.revisao ?? 0;
let nameDirty = false;
function scheduleSave() {
  if (!PROJETO) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}
function payload(withName = nameDirty) {
  const body = { data: project, revisao: revision };
  if (withName) body.name = projectName;
  return JSON.stringify(body);
}
/** O projeto mudou por fora (a API): passa a valer o do servidor, e o histórico daqui não serve mais. */
function adopt(state) {
  if (!valid(state.data) || state.revisao < revision) return;
  revision = state.revisao;
  project = M.upgrade(state.data);
  projectName = state.nome;
  undo.length = 0;
  redo.length = 0;
  render();
}
async function refresh() {
  const res = await fetch(`${PROJETO.estado}?revisao=${revision}`);
  if (res.status === 200) adopt(await res.json());
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const sentName = nameDirty;
  nameDirty = false;
  pending++;
  // Um salvamento por vez, na ordem: o último sempre chega por último, com a revisão do anterior.
  saving = saving.then(async () => {
    try {
      const res = await fetch(PROJETO.salvar, { method: "POST", headers: { "content-type": "application/json" }, body: payload(sentName) });
      if (res.status === 409) {
        await refresh();
        toast(CONFIG.erros?.conflito ?? "");
        return false;
      }
      if (!res.ok) throw new Error(String(res.status));
      revision = Number(res.headers.get("x-revisao"));
      // No mesmo formato do servidor (formatDate, em src/site/site.ts).
      projectEdited = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const edited = $("#p-edited");
      if (edited) edited.textContent = projectEdited;
      return true;
    } catch {
      if (sentName) nameDirty = true;
      toast(CONFIG.erros?.salvar ?? "");
      return false;
    } finally {
      pending--;
    }
  });
  return saving;
}
// Um agente pode estar editando pela API: a tela confere de tempos em tempos, sem atropelar quem edita.
if (PROJETO) setInterval(() => {
  if (document.hidden || saveTimer || pending || pressed) return;
  refresh().catch(() => {});
}, REFRESH_MS);
// Ao sair da página com mudança ainda não enviada: manda junto com a saída (se couber).
addEventListener("pagehide", () => {
  if (!PROJETO || !saveTimer) return;
  const body = payload();
  if (body.length < 60000) fetch(PROJETO.salvar, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
});
function step(from, to) {
  if (!from.length) return;
  to.push(project);
  project = from.pop();
  render();
  scheduleSave();
}

/* ---------- desenho ---------- */

// Espaço entre os blocos e o tracejado da área do grupo.
const FRAME_PAD = 20;
/** O grupo cuja área (o tracejado) tem este ponto do canvas. */
function groupAt(pt) {
  return M.groups(project).find((g) => {
    if (!M.hasArea(g)) return false;
    return pt.x >= g.x - FRAME_PAD && pt.x <= g.x + g.w + FRAME_PAD && pt.y >= g.top - FRAME_PAD && pt.y <= g.bottom + FRAME_PAD;
  });
}
const blockEls = new Map();
/** As notas, como os blocos: o elemento fica entre um desenho e outro. */
const noteEls = new Map();

/* ---------- onda do som: a leve no bloco, a nítida só no que está à vista com zoom alto ---------- */

const SHARP_ZOOM = 3;
function setWave(m, id, url) {
  m.low = url;
  const b = project.blocks.find((b) => b.id === id);
  if (b) paintWave(m, b);
}
/** A máscara vale para o arquivo inteiro (a leve) ou para um trecho dele (a nítida). */
function paintWave(m, b) {
  if (!m.low) return;
  const { from, to, url } = m.sharp ?? { from: 0, to: b.dur, url: m.low };
  if (m.shown !== url) {
    m.shown = url;
    m.style.maskImage = m.style.webkitMaskImage = `url("${url}")`;
  }
  const sp = b.speed ?? 1;
  m.style.maskSize = m.style.webkitMaskSize = `${((to - from) * M.PX) / sp}px 100%`;
  m.style.maskPosition = m.style.webkitMaskPosition = `${((from - b.tin) * M.PX) / sp}px 0`;
}
let sharpTimer = 0;
function scheduleSharp() {
  clearTimeout(sharpTimer);
  sharpTimer = setTimeout(sharpen, 150);
}
function sharpen() {
  const r = vp.getBoundingClientRect();
  const left = -view.x / view.z;
  const top = -view.y / view.z;
  for (const b of project.blocks) {
    const el = blockEls.get(b.id);
    const m = b.kind === "audio" ? $(".blk__media", el) : M.linked(b) ? $(".blk__wave", el) : null;
    if (!m) continue;
    const s0 = Math.max(0, (left - b.x) / M.PX);
    const s1 = Math.min(M.len(b), (left + r.width / view.z - b.x) / M.PX);
    const seen = view.z >= SHARP_ZOOM && s1 > s0 && b.y < top + r.height / view.z && b.y + M.height(b) > top;
    if (!seen) {
      m.want = null;
      if (m.sharp) (m.sharp = null), paintWave(m, b);
      continue;
    }
    const [a, c] = [b.tin + s0 * (b.speed ?? 1), b.tin + s1 * (b.speed ?? 1)];
    const has = m.want ?? m.sharp;
    if (has && has.from <= a && has.to >= c) continue;
    // Pede um pouco a mais dos dois lados, para andar sem refazer a cada passo.
    const want = { from: Math.max(0, a - (c - a) / 2), to: Math.min(b.dur, c + (c - a) / 2) };
    m.want = want;
    sharpWave(b.src, want.from, want.to)
      .then((url) => {
        if (m.want !== want) return;
        m.want = null;
        m.sharp = { ...want, url };
        const now = project.blocks.find((o) => o.id === b.id);
        if (now) paintWave(m, now);
      })
      .catch(() => {});
  }
}

function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  world.style.setProperty("--zi", String(1 / Math.max(1, view.z)));
  playhead(player.t);
  vp.style.backgroundSize = `${24 * view.z}px ${24 * view.z}px`;
  vp.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $("#zoom").textContent = `${Math.round(view.z * 100)}%`;
  scheduleSharp();
}

/** No arrasto, desenha no máximo uma vez por quadro, sem o painel (ele vem ao soltar). */
let drawing = 0;
function renderSoon() {
  drawing ||= requestAnimationFrame(() => {
    drawing = 0;
    render({ side: false });
  });
}
let chromeHtml = null;
let wiresHtml = null;

function render({ side = true } = {}) {
  const gs = M.groups(project);
  const idx = M.groupIndex(gs);
  const pf = previewFinal();
  const pvs = pf ? M.versions(project, pf.id, gs) : [];
  versionIdx = Math.max(0, Math.min(versionIdx, pvs.length - 1));
  // O destaque sai ao clicar fora do Final dele.
  if (sel.type !== "final" || sel.id !== litFinal) litFinal = null;
  const path = (litFinal && pvs[versionIdx]) || null;
  world.classList.toggle("has-path", !!path);

  // Blocos: mantém os elementos (a miniatura não pisca ao arrastar).
  const seen = new Set();
  for (const b of project.blocks) {
    seen.add(b.id);
    let el = blockEls.get(b.id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = b.id;
      el.innerHTML = `<div class="blk__media"></div><div class="blk__label"><span class="icon blk__kind"></span><span class="blk__name"></span><span class="blk__dur"></span><span class="icon blk__mute">volume_off</span></div><div class="blk__link"><span class="blk__wave"></span></div><i class="trim trim--l" data-trim="l"></i><i class="trim trim--r" data-trim="r"></i>`;
      world.append(el);
      blockEls.set(b.id, el);
    }
    // A miniatura muda com o arquivo: o rascunho trocado pelo vídeo pronto mantém o mesmo bloco.
    const fonte = b.draft ? `rascunho:${draftText(b)}` : b.code ? "codigo" : b.src;
    if (el.fonte !== fonte) {
      el.fonte = fonte;
      const m = $(".blk__media", el);
      m.textContent = "";
      m.style.backgroundImage = "";
      if (!b.draft && !b.code)
        thumb(b).then((u) => {
          if (!u || el.fonte !== fonte) return;
          // O áudio é uma máscara: a onda pega a cor do bloco.
          if (b.kind === "audio") setWave(m, b.id, u);
          else m.style.backgroundImage = `url("${u}")`;
        });
      // O vídeo mostra o próprio som numa faixa embaixo, na cor dele.
      if (b.kind === "video")
        thumb({ kind: "audio", src: b.src, dur: b.dur }).then((u) => {
          if (u && el.fonte === fonte) setWave($(".blk__wave", el), b.id, u);
        });
    }
    const g = idx.get(b.id);
    const role = g?.covers.includes(b) ? "cover" : g?.audios.includes(b) && !g.soloAudio ? "under" : "";
    const look = `blk blk--${b.kind}${b.draft ? " blk--draft" : ""} ${role ? `blk--${role}` : ""} ${sel.type === "block" && sel.id === b.id ? "is-sel" : ""} ${b.mute ? "is-mute" : ""} ${M.linked(b) ? "is-linked" : ""} ${path?.includes(g) ? "is-path" : ""}${el.classList.contains("is-drag") ? " is-drag" : ""}`;
    // Só mexe no elemento se algo mudou: arrastar um bloco não redesenha os outros.
    // O som do vídeo fica na área de som, na faixa dele.
    const sound = g?.sounds.find((s) => s.block === b);
    const state = `${look}|${b.x}|${b.y}|${b.tin}|${b.tout}|${b.dur}|${b.name}|${b.tone}|${b.audio}|${sound?.y}|${b.src}|${b.draft?.fala}|${b.draft?.descricao}`;
    if (el.drawn === state) continue;
    el.drawn = state;
    el.className = look;
    Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${M.width(b)}px`, height: `${M.height(b)}px` });
    if (sound) el.style.setProperty("--link-top", `${sound.y - b.y}px`);
    const tipo = { video: "video", image: "imagem", audio: "audio" }[b.kind];
    el.style.setProperty("--c", `var(--bloco-${tipo}-${b.tone ?? 1})`);
    el.style.setProperty("--on", `var(--bloco-${tipo}-on)`);
    const media = $(".blk__media", el);
    if (M.linked(b)) paintWave($(".blk__wave", el), b);
    if (b.kind === "audio") paintWave(media, b);
    $(".blk__kind", el).textContent = b.draft ? "edit_note" : b.code ? "animation" : { video: "movie", image: "image", audio: "music_note" }[b.kind];
    $(".blk__name", el).textContent = b.name;
    if (b.draft) media.replaceChildren(Object.assign(document.createElement("span"), { className: "blk__fala", textContent: draftText(b) }));
    $(".blk__dur", el).textContent = fmt(M.len(b));
  }
  for (const [id, el] of blockEls) if (!seen.has(id)) el.remove(), blockEls.delete(id);
  // Notas: blocos amarelos com o texto no lugar do quadro (como o rascunho), fora dos grupos.
  const notesSeen = new Set();
  for (const n of project.notes ?? []) {
    notesSeen.add(n.id);
    let el = noteEls.get(n.id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.note = n.id;
      el.innerHTML = `<div class="blk__media"><span class="blk__fala"></span></div><div class="blk__label"><span class="icon blk__kind">sticky_note_2</span><span class="blk__name">Nota</span></div>`;
      el.style.setProperty("--c", "var(--bloco-nota-1)");
      el.style.setProperty("--on", "var(--bloco-nota-on)");
      world.append(el);
      noteEls.set(n.id, el);
    }
    const look = `blk blk--draft blk--nota${sel.type === "note" && sel.id === n.id ? " is-sel" : ""}${el.classList.contains("is-drag") ? " is-drag" : ""}`;
    const state = `${look}|${n.x}|${n.y}|${n.text}`;
    if (el.drawn === state) continue;
    el.drawn = state;
    el.className = look;
    Object.assign(el.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${M.NOTE_W}px`, height: `${M.VIS_H}px` });
    $(".blk__fala", el).textContent = n.text;
  }
  for (const [id, el] of noteEls) if (!notesSeen.has(id)) el.remove(), noteEls.delete(id);
  const empty = $("#canvas-empty");
  if (empty) empty.hidden = project.blocks.length > 0 || (project.notes?.length ?? 0) > 0;

  // Abas dos grupos, portas e blocos finais.
  let html = "";
  for (const g of gs) {
    const top = g.top;
    const rowH = g.soloAudio ? M.AUD_H : M.VIS_H;
    const isSel = sel.type === "group" && sel.id === g.id;
    if (M.hasArea(g)) {
      const gPlaying = player.playing && preview?.type === "group" && preview.id === g.id;
      // A área do grupo: um retângulo tracejado em volta de tudo o que entra nele.
      const bottom = g.bottom;
      const onPath = path?.includes(g) ? "is-path" : "";
      html += `<div class="gframe ${isSel ? "is-sel" : ""} ${onPath}" style="left:${g.x - FRAME_PAD}px;top:${top - FRAME_PAD}px;width:${g.w + 2 * FRAME_PAD}px;height:${bottom - top + 2 * FRAME_PAD}px"></div>`;
      html += `<div class="gtab ${isSel ? "is-sel" : ""} ${onPath}" data-group="${g.id}" style="left:${g.x - FRAME_PAD}px;top:${top - FRAME_PAD - 40}px"><span class="icon">drag_indicator</span>${esc(g.label)} · ${fmt(g.dur)}<button class="gtab__play interactive" type="button" data-play-group="${g.id}" aria-label="${gPlaying ? "Pausar" : "Tocar o bloco"}" title="${gPlaying ? "Pausar" : "Tocar o bloco"}"><span class="icon">${gPlaying ? "pause" : "play_arrow"}</span></button></div>`;
    }
    // As duas áreas do bloco: vídeo em cima, som embaixo.
    if (M.hasArea(g) && g.bottom > g.y + M.VIS_H) {
      const side = g.x - FRAME_PAD;
      html += `<div class="gsplit" style="left:${side}px;top:${g.y + M.VIS_H}px;width:${g.w + 2 * FRAME_PAD}px"></div>`;
      html += `<span class="icon garea" aria-hidden="true" style="left:${side + 1}px;top:${top + 4}px">movie</span>`;
      html += `<span class="icon garea" aria-hidden="true" style="left:${side + 1}px;top:${g.y + M.VIS_H + 12}px">music_note</span>`;
    }
    html += `<div class="port port--in" data-group="${g.id}" style="left:${g.x - PORT_OUT - 9}px;top:${g.y + rowH / 2 - 9}px"></div>`;
    html += `<div class="port port--out" data-group="${g.id}" style="left:${g.x + g.w + PORT_OUT - 9}px;top:${g.y + rowH / 2 - 9}px"></div>`;
  }
  // Bloco escolhido: o botão de tocar só ele, no meio da imagem.
  const sb = sel.type === "block" && project.blocks.find((b) => b.id === sel.id);
  if (sb) {
    const w = M.width(sb);
    const cy = sb.kind === "audio" ? sb.y + M.AUD_H / 2 : sb.y + 28 + (M.VIS_H - 32) / 2;
    const playing = player.playing && preview?.type === "block" && preview.id === sb.id;
    html += `<button class="blk-play interactive" type="button" data-play-block="${sb.id}" style="left:${sb.x + w / 2}px;top:${cy}px" aria-label="${playing ? "Pausar" : "Tocar"}" title="${playing ? "Pausar" : "Tocar"}"><span class="icon">${playing ? "pause" : "play_arrow"}</span></button>`;
  }
  for (const f of project.finals) {
    const vs = M.versions(project, f.id, gs);
    const n = vs.length;
    const isSel = sel.type === "final" && sel.id === f.id;
    html += `<div class="fin ${isSel ? "is-sel" : ""}" data-final="${f.id}" style="left:${f.x}px;top:${f.y}px"><div class="fin__head"><span class="icon">flag</span><span><b>Final</b><small>${n} ${n === 1 ? "variação" : "variações"}</small></span></div>${n ? variantList(vs, f === pf && !preview, selectionIn(f.id, gs, idx), M.finalRate(f)) : ""}${M.overLimit(project, f.id, gs) ? `<p class="fin__hint">${esc(CONFIG.erros?.exportarLimite ?? "")}</p>` : ""}</div>`;
    html += `<div class="port port--in" data-final="${f.id}" style="left:${f.x - 9}px;top:${f.y + 40 - 9}px"></div>`;
  }
  if (html !== chromeHtml) chrome.innerHTML = chromeHtml = html;

  // Linhas.
  let svg = "";
  const boxes = M.wireBoxes(project, gs);
  for (const l of M.links(project, gs)) {
    const f = typeof l.to === "string" ? project.finals.find((f) => f.id === l.to) : null;
    const d = M.linkPath(l, project, boxes);
    const on = sel.type === "edge" && sel.id === l.edge.id;
    const onPath = path && M.linkOn(l, path, litFinal);
    svg += `<path class="wire ${on ? "is-sel" : ""} ${onPath ? "is-path" : ""}" d="${d}"/><path class="wire-hit" data-edge="${l.edge.id}" d="${d}"/>`;
  }
  // A linha sendo puxada fica fora disto: é só o atributo dela que muda.
  if (svg !== wiresHtml) {
    wiresHtml = svg;
    const temp = $("#wire-temp")?.getAttribute("d") ?? "";
    wires.innerHTML = svg + `<path id="wire-temp" class="wire wire--temp" d="${temp}"/>`;
  }

  if (side) renderSide(gs);
  frameRatio();
  loadPreview();
  $("#undo").disabled = !undo.length;
  $("#redo").disabled = !redo.length;
  scheduleSharp();
}

/** Diz se o que está selecionado (bloco, grupo ou linha) entra numa variação deste Final. */
function selectionIn(finalId, gs, idx) {
  if (sel.type === "block") return (v) => v.includes(idx.get(sel.id));
  if (sel.type === "group") return (v) => v.some((g) => g.id === sel.id);
  const link = sel.type === "edge" && M.links(project, gs).find((l) => l.edge.id === sel.id);
  return link ? (v) => M.linkOn(link, v, finalId) : () => false;
}

/** As variações de um Final: em lista até 3 colunas, em números depois, com a escolhida em cima. */
function variantList(vs, active, part, rate = 1) {
  const { rows, cols } = M.variantShape(vs.length);
  const style = M.variantLabel(cols);
  const bar = active ? `<span class="fin__bar" style="--p:${player.duration ? player.t / player.duration : 0}"></span>` : "";
  const label = (i) => (style === "full" ? M.versionName(i) : `V. ${i + 1}`);
  const glyph = (i) => (active && i === versionIdx && player.playing ? "pause" : "play_arrow");
  const lead = (i) => `<span class="icon" aria-hidden="true">${glyph(i)}</span>`;
  const time = (v) => `<span class="xlist__trail">${fmt(M.timeline(v, rate).duration)}</span>`;
  const item = (v, i) => {
    const on = active && i === versionIdx;
    const attrs = `class="xlist__item interactive ${part(v) ? "is-part" : ""}" type="button" data-variant="${i}" aria-label="${M.versionName(i)}" aria-current="${on}"`;
    if (style === "number") return `<button ${attrs}>${i + 1}</button>`;
    return `<button ${attrs}>${lead(i)}<span class="xlist__text">${label(i)}</span>${time(v)}${on ? bar : ""}</button>`;
  };
  const cur = active ? versionIdx : 0;
  const now = style === "number" ? `<button class="xlist__item interactive" type="button" data-variant="${cur}" aria-label="${M.versionName(cur)}">${lead(cur)}<span class="xlist__text">${M.versionName(cur)}</span>${time(vs[cur])}${bar}</button>` : "";
  return `<div class="fin__body">${now}<div class="fin__list fin__list--${style}" style="--rows:${rows}">${vs.map(item).join("")}</div></div>`;
}

const { PORT_OUT, outPoint, inPoint, finalPoint, curve } = M;

/* ---------- painel ---------- */

const sideActions = $("#side-actions");
const btn = (kind, act, icon, text) => `<button class="button button--${kind} interactive" type="button" ${act}><span class="icon">${icon}</span>${text}</button>`;
/** O limite da fala do rascunho, o mesmo dos comandos (src/comandos.ts). */
const MAX_FALA = 2000;
/**
 * O campo de texto cresce com o texto, como na página do modelo. Escondido (na aba Prévia), não
 * há o que medir: mede de novo quando a aba Ajustes abre (setTab).
 */
/** Um campo de texto do rascunho (Descrição, Fala) e da nota: cresce com o texto e conta os caracteres, sem frase de apoio. */
function draftField(id, label, value, max = MAX_FALA) {
  return `<div class="text-field"><textarea class="text-field__input" id="${id}" rows="1" maxlength="${max}" placeholder=" " aria-describedby="${id}-n" data-max="${max}">${esc(value)}</textarea><label class="text-field__label" for="${id}">${label}</label><p class="text-field__supporting"><span></span><span id="${id}-n">${value.length}/${max}</span></p></div>`;
}

/** O texto que o cartão do rascunho mostra: a fala ou, sem ela, a descrição. */
function draftText(b) {
  return b.draft.fala.trim() || b.draft.descricao?.trim() || "";
}

function fitText(t) {
  if (!t.offsetParent) return;
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight + (t.offsetHeight - t.clientHeight)}px`;
}
const field = (id, label, value, attrs = "") =>
  `<div class="text-field"><input class="text-field__input" id="${id}" value="${esc(value)}" placeholder=" " ${attrs}><label class="text-field__label" for="${id}">${label}</label></div>`;
const row = (icon, label, value) => `<div class="qe-result__row"><span class="icon" aria-hidden="true">${icon}</span><span class="qe-result__label">${label}</span><span class="qe-result__value">${value}</span></div>`;

const selectUndos = [];
function renderSide(gs) {
  let title = "Projeto";
  let h = "";
  let actions = "";
  if (sel.type === "final") {
    const vs = M.versions(project, sel.id, gs);
    title = "Final";
    const durs = vs.map((v) => M.timeline(v, M.finalRate(project.finals.find((f) => f.id === sel.id))).duration);
    const [least, most] = [Math.min(...durs), Math.max(...durs)];
    const dur = least === most ? fmt(most) : `${fmt(least).replace(" s", "")} a ${fmt(most)}`;
    h += vs.length ? `<div class="viewer__card"><div>${row("movie", "Variações", vs.length)}${row("schedule", "Duração", dur)}</div></div>` : `<p class="sheet-hint">Ligue um bloco ao Final para ter variações.</p>`;
    const out = M.output(project.finals.find((f) => f.id === sel.id));
    // Os mesmos campos dos modelos: Resolução em botões conectados, Formato no campo de seleção.
    h += `<section class="viewer__section"><h3 class="viewer__title">Qualidade e formato</h3>
      <div class="segmented-field"><span class="segmented-field__label">Resolução</span><div class="segmented-button sheet-segmented" role="radiogroup" aria-label="Resolução">${M.RESOLUTIONS.map(
        (r) => `<label class="segmented-button__segment interactive"><input type="radio" name="f-resolution" value="${r}"${r === out.resolution ? " checked" : ""}><span class="icon segmented-button__check" aria-hidden="true">check</span><span>${r}</span></label>`,
      ).join("")}</div></div>
      <div class="text-field text-field--select"><select class="text-field__input" id="f-format" aria-describedby="f-format-ajuda">${M.FORMATS.map(
        (o) => `<option value="${o.value}"${o.value === out.format ? " selected" : ""}>${o.value}</option>`,
      ).join("")}</select><label class="text-field__label" for="f-format">Formato</label><span class="icon text-field__trailing" aria-hidden="true">arrow_drop_down</span>
        <p class="text-field__supporting" id="f-format-ajuda"><span>${M.FORMATS.find((o) => o.value === out.format).description}</span><span>${out.width} × ${out.height}</span></p></div></section>`;
    if (CONFIG.exportacao?.status === "done") h += `<section class="viewer__section"><h3 class="viewer__title">Última exportação</h3>${btn("outlined", 'data-export="last"', "download", "Ver os arquivos")}</section>`;
    // Os mesmos nomes do menu do card.
    if (vs.length > 1 && PROJETO) actions += btn("outlined", 'data-export="one"', "download", `Baixar ${M.versionName(versionIdx)}`) + btn("filled", 'data-export="all"', "download", `Baixar todas (${vs.length})`);
    else if (vs.length && PROJETO) actions += btn("filled", 'data-export="one"', "download", "Baixar");
  } else if (sel.type === "block") {
    const b = project.blocks.find((b) => b.id === sel.id);
    title = b.draft ? "Rascunho" : b.code ? "Animação" : { video: "Vídeo", image: "Imagem", audio: "Áudio" }[b.kind];
    h += field("f-name", "Nome", b.name);
    // O lugar de um vídeo que ainda não existe: a fala vai para o modelo, a descrição diz o resto
    // (a cena, o enquadramento, referências), e o vídeo pronto entra aqui. As duas podem ficar vazias.
    // O mesmo campo de texto que cresce da página do modelo.
    if (b.draft) h += draftField("f-descricao", "Descrição", b.draft.descricao ?? "") + draftField("f-fala", "Fala", b.draft.fala);
    if (b.kind === "image") h += field("f-tout", "Duração (s)", b.tout.toFixed(1), `type="number" step="0.1" min="${M.MIN_LEN}" max="${M.maxEnd(b)}"`);
    // O que o template deixa mudar sem mexer no código: nome, preço, cor da marca.
    if (b.code?.params)
      h += `<section class="viewer__section"><h3 class="viewer__title">Parâmetros</h3>${Object.entries(b.code.params)
        .map(([k, v]) => field(`f-param-${k}`, esc(k), String(v), `data-param="${esc(k)}" maxlength="500"`))
        .join("")}</section>`;
    else
      h += `<div class="text-field"><div class="fields-row">${field("f-tin", "Começa em (s)", b.tin.toFixed(1), 'type="number" step="0.1" min="0"')}${field("f-tout", "Termina em (s)", b.tout.toFixed(1), `type="number" step="0.1" max="${b.dur.toFixed(1)}"`)}</div></div>`;
    if (b.kind === "video" && !M.linked(b))
      h += `<section class="viewer__section"><h3 class="viewer__title">Som</h3>${b.audio === "none" ? `<p class="sheet-hint">Este vídeo não tem som.</p>` : `<p class="sheet-hint">O som deste vídeo está desvinculado.</p><button class="button button--outlined interactive" type="button" data-act="relink"><span class="icon">link</span>Vincular ao áudio</button>`}</section>`;
    else if (b.kind !== "image")
      h += `<section class="viewer__section"><h3 class="viewer__title">Som</h3><label class="switch-row" for="f-mute">Sem som<span class="switch"><input type="checkbox" role="switch" id="f-mute" ${b.mute ? "checked" : ""}><span class="switch__track"></span><span class="switch__handle"></span></span></label>
        <div class="slider-field"><span class="slider-field__label"><span>Volume</span><span id="f-vol-n">${Math.round(b.vol * 100)}%</span></span><input class="vbar__seek" type="range" id="f-vol" min="0" max="1" step="0.05" value="${b.vol}" style="--p:${b.vol * 100}%" aria-label="Volume" ${b.mute ? "disabled" : ""}></div>${b.kind === "video" ? `<button class="button button--outlined interactive" type="button" data-act="unlink"><span class="icon">link_off</span>Desvincular o áudio</button>` : ""}${b.origin === "video" ? `<button class="button button--outlined interactive" type="button" data-act="tovideo"><span class="icon">link</span>Vincular ao vídeo</button>` : ""}</section>`;
    actions = btn("outlined", 'data-act="dup"', "control_point_duplicate", "Duplicar") + btn("text", 'data-act="del"', "delete", "Excluir");
  } else if (sel.type === "group") {
    const g = gs.find((g) => g.id === sel.id);
    if (g) {
      title = "Bloco";
      if (M.hasArea(g)) h += field("f-group", "Nome", g.label, 'maxlength="60"');
      h += `<div class="viewer__card"><div>${row("schedule", "Duração", fmt(g.dur))}${row("movie", "Vídeos e imagens", g.blocks.length + g.covers.length)}${row("music_note", "Sons", g.audios.length + g.sounds.length)}</div></div>`;
      actions = btn("outlined", 'data-act="dup"', "control_point_duplicate", "Duplicar") + btn("text", 'data-act="del"', "delete", "Excluir bloco");
    }
  } else if (sel.type === "note") {
    const n = project.notes?.find((o) => o.id === sel.id);
    title = "Nota";
    if (n) h += draftField("f-nota", "Texto", n.text, M.NOTE_MAX);
    actions = btn("outlined", 'data-act="dup"', "control_point_duplicate", "Duplicar") + btn("text", 'data-act="del"', "delete", "Excluir");
  } else if (sel.type === "edge") {
    title = "Linha";
    h += `<p class="sheet-hint">Liga um bloco ao seguinte. Cada caminho até o Final é uma variação.</p>`;
    actions = btn("text", 'data-act="del"', "delete", "Excluir linha");
  } else {
    if (PROJETO) {
      title = "Projeto";
      h += field("f-project", "Nome do projeto", projectName, 'maxlength="120"');
      const variants = project.finals.reduce((n, f) => n + M.versions(project, f.id, gs).length, 0);
      h += `<div class="viewer__card"><div>${row("calendar_today", "Criado em", esc(PROJETO.criado))}${row("edit", "Modificado em", `<span id="p-edited">${esc(projectEdited)}</span>`)}${row("person", "Criado por", esc(PROJETO.autor))}${row("movie", "Blocos", project.blocks.length)}${row("flag", "Variações", variants)}</div></div>`;
    }
  }
  for (const undo of selectUndos.splice(0)) undo();
  side.innerHTML = `<h2 class="sheet-title">${title}</h2>` + h;
  for (const t of side.querySelectorAll("#f-fala, #f-descricao, #f-nota")) fitText(t);
  // No site, o campo de seleção vira o menu do M3 (window.mdSelect, do script do site).
  if (window.mdSelect) for (const s of side.querySelectorAll(".text-field--select select")) selectUndos.push(window.mdSelect(s));
  sideActions.innerHTML = actions;
  showActions();
}

/** Os botões de baixo (Exportar, Duplicar, Excluir) só aparecem na aba Ajustes. */
function showActions() {
  // Busca o elemento aqui: setTab() roda no começo, antes das constantes do painel.
  const el = $("#side-actions");
  el.hidden = !el.innerHTML || $(".sheet-body").dataset.tab !== "ajustes";
}

sideActions.addEventListener("click", (e) => side.onclickAction(e));
side.onclickAction = (e) => {
  const ex = e.target.closest("[data-export]");
  if (ex) {
    if (ex.dataset.export === "last") showExport(CONFIG.exportacao);
    else startExport(sel.id, ex.dataset.export === "all" ? undefined : [versionIdx]);
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "del") removeSelection();
  if (act === "dup") duplicate();
  if (act === "unlink") {
    const before = project;
    const r = M.unlinkAudio(project, sel.id);
    project = r.project;
    if (r.audioId) sel = { type: "block", id: r.audioId }, (preview = { type: "block", id: r.audioId });
    commit(before);
    render();
    toast("Áudio desvinculado. A cópia dele é um bloco próprio.");
  }
  if (act === "relink") {
    const before = project;
    project = M.relinkVideo(project, sel.id);
    commit(before);
    render();
    toast(M.doubledSound(project) ? "Este bloco tem o som duas vezes: o do vídeo e o da cópia." : "O vídeo voltou a tocar o próprio som.");
  }
  if (act === "tovideo") {
    const before = project;
    const r = M.audioToVideo(project, sel.id);
    project = r.project;
    if (r.videoId) sel = { type: "block", id: r.videoId }, (preview = { type: "block", id: r.videoId });
    commit(before);
    render();
    toast("O áudio voltou a mostrar o vídeo.");
  }
};
side.addEventListener("click", side.onclickAction);
// O campo de seleção (o menu do site) avisa com "change"; o resto, com "input".
side.addEventListener("change", (e) => e.target.id === "f-format" && onSideInput(e.target));
side.addEventListener("input", (e) => e.target.id !== "f-format" && onSideInput(e.target));
/** Nome do projeto: muda o título da barra e da aba, e vai junto no próximo salvamento. */
function renameProject(value) {
  const name = value.trim();
  if (!name) return;
  projectName = name;
  nameDirty = true;
  const bar = $(".title-edit__text");
  if (bar) bar.textContent = name;
  document.title = document.title.replace(/^.*?( · [^·]+)$/, `${name}$1`);
  scheduleSave();
}

/* O nome na barra superior: um clique troca o título por um campo; sair dele salva, Esc desiste. */
const barTitle = $(".top-app-bar__title");
if (PROJETO && barTitle) {
  barTitle.innerHTML = `<button class="title-edit interactive" type="button" aria-label="Mudar o nome do projeto" title="Mudar o nome do projeto"><span class="title-edit__text"></span></button><input class="title-edit__input" maxlength="120" aria-label="Nome do projeto" hidden>`;
  const open = $(".title-edit", barTitle);
  const input = $(".title-edit__input", barTitle);
  $(".title-edit__text", barTitle).textContent = projectName;
  const close = (commit) => {
    if (input.hidden) return;
    input.hidden = true;
    open.hidden = false;
    if (commit && input.value.trim() && input.value.trim() !== projectName) {
      renameProject(input.value);
      if (!sel.type) render();
    } else if (commit && !input.value.trim()) toast(CONFIG.erros?.nome ?? "");
  };
  open.onclick = () => {
    input.value = projectName;
    open.hidden = true;
    input.hidden = false;
    input.select();
  };
  input.onblur = () => close(true);
  input.onkeydown = (e) => {
    if (e.key === "Enter") close(true);
    if (e.key === "Escape") close(false);
  };
}

function onSideInput(t0) {
  if (t0.id === "f-project") return renameProject(t0.value);
  if ((t0.name === "f-resolution" || t0.id === "f-format") && sel.type === "final") {
    const before = project;
    project = structuredClone(project);
    const f = project.finals.find((f) => f.id === sel.id);
    if (t0.name === "f-resolution") f.resolution = t0.value;
    else f.format = t0.value;
    delete f.size;
    commit(before);
    // O texto de apoio e o quadro da prévia seguem a escolha.
    const out = M.output(f);
    const help = $("#f-format-ajuda");
    if (help) help.innerHTML = `<span>${M.FORMATS.find((o) => o.value === out.format).description}</span><span>${out.width} × ${out.height}</span>`;
    frameRatio();
    return;
  }
  if (t0.id === "f-group") {
    const before = project;
    project = M.renameGroup(project, M.groups(project).find((g) => g.id === sel.id), t0.value);
    commit(before);
    return render({ side: false });
  }
  if (t0.id === "f-nota" && sel.type === "note") {
    fitText(t0);
    $("#f-nota-n").textContent = `${t0.value.length}/${M.NOTE_MAX}`;
    const before = project;
    project = structuredClone(project);
    project.notes.find((n) => n.id === sel.id).text = t0.value;
    commit(before);
    return render({ side: false });
  }
  if (sel.type !== "block") return;
  const before = project;
  project = structuredClone(project);
  const b = project.blocks.find((b) => b.id === sel.id);
  const t = t0;
  if (t.id === "f-name") b.name = t.value;
  if (t.dataset.param && b.code?.params) {
    // O número continua número (params.x nos scripts); o resto é texto.
    const old = b.code.params[t.dataset.param];
    b.code.params[t.dataset.param] = typeof old === "number" && t.value.trim() !== "" && Number.isFinite(+t.value) ? +t.value : t.value;
  }
  if (t.id === "f-fala" || t.id === "f-descricao") {
    fitText(t);
    $(`#${t.id}-n`).textContent = `${t.value.length}/${MAX_FALA}`;
    if (t.id === "f-fala") b.draft.fala = t.value;
    else if (t.value) b.draft.descricao = t.value;
    else delete b.draft.descricao;
  }
  if (t.id === "f-mute") b.mute = t.checked;
  if (t.id === "f-vol") b.vol = +t.value;
  if (t.id === "f-tin" && t.value !== "") project = M.trim(project, b.id, "l", (+t.value - b.tin) / (b.speed ?? 1));
  if (t.id === "f-tout" && t.value !== "") project = M.trim(project, b.id, "r", (+t.value - b.tout) / (b.speed ?? 1));
  commit(before);
  if (t.id === "f-vol") {
    t.style.setProperty("--p", `${b.vol * 100}%`);
    $("#f-vol-n").textContent = `${Math.round(b.vol * 100)}%`;
  }
  // Não redesenha o painel enquanto digita ou arrasta (perderia o foco), só o resto.
  render({ side: t.id === "f-mute" });
}
$("#dlg-close").onclick = () => {
  exportHidden = true;
  $("#dlg").close();
};

/* ---------- ações ---------- */

function removeSelection() {
  const before = project;
  if (sel.type === "group") {
    const g = M.groups(project).find((g) => g.id === sel.id);
    if (g) project = M.removeItems(project, M.members(g).map((b) => b.id));
  } else if (sel.type) project = M.removeItems(project, [sel.id]);
  commit(before);
  sel = { type: null };
  render();
}

/** Duplicar: o que está escolhido (bloco, grupo, nota ou Final) de novo, logo embaixo, com "(cópia)" nos blocos. */
function duplicate() {
  const items = M.copyItems(project, sel);
  if (!items) return;
  const box = M.itemsBox(items);
  placeItems(items, { x: box.x, y: box.bottom + 140 }, { suffix: true });
}

/** Põe no canvas o que foi copiado (ou duplicado) e escolhe o primeiro elemento novo. */
function placeItems(items, at, o = {}) {
  const before = project;
  const r = M.pasteItems(project, items, at, o);
  project = r.project;
  const id = r.ids[0];
  // Um grupo inteiro colado continua escolhido como grupo; o resto, pelo tipo.
  const type = items.blocks.length > 1 ? "group" : items.blocks.length ? "block" : items.notes.length ? "note" : "final";
  sel = { type, id: type === "group" ? (M.groups(project).find((g) => M.members(g).some((b) => b.id === id))?.id ?? id) : id };
  commit(before);
  render();
}

/** No site, o arquivo vai para o projeto no servidor (não some ao recarregar); devolve o endereço e se o vídeo tem som. */
async function upload(file) {
  if (!PROJETO) return null;
  const image = file.type.startsWith("image/");
  const max = image ? CONFIG.limites?.imagem : CONFIG.limites?.video;
  if (max && file.size > max) throw new Error(image ? CONFIG.erros?.grandeImagem : CONFIG.erros?.grandeVideo);
  const res = await fetch(PROJETO.arquivos, { method: "POST", headers: { "content-type": file.type, "x-nome": encodeURIComponent(file.name) }, body: file });
  if (!res.ok) throw new Error(res.status === 413 || res.status === 400 ? await res.text() : CONFIG.erros?.enviar);
  return res.json();
}

async function importFiles(files, at) {
  let y = at.y;
  for (const file of files) {
    try {
      if (PROJETO) toast(`Enviando ${file.name}…`, true);
      const local = await probe(file);
      const sent = await upload(file);
      // O arquivo do navegador (blob:) só serviu para medir: no site fica o do servidor.
      if (sent) URL.revokeObjectURL(local.src);
      const { kind, dur } = local;
      const src = sent?.src ?? local.src;
      const before = project;
      project = structuredClone(project);
      // Vídeo sem som (a animação em WebM) entra sem a camada de áudio embaixo.
      const b = { id: M.newId("b"), tone: M.nextTone(project, kind, src), kind, name: file.name.replace(/\.[^.]+$/, ""), src, dur: kind === "image" ? M.IMAGE_MAX : dur, tin: 0, tout: Math.min(dur, kind === "image" ? 3 : dur), x: at.x, y, mute: false, vol: 1, ...(kind === "video" && sent?.som === false ? { audio: "none" } : {}) };
      project.blocks.push(b);
      const first = M.linkFirst(project, b);
      sel = { type: "block", id: b.id };
      y += M.height(b) + 48;
      commit(before);
      render();
      if (first) fit();
      if (PROJETO) toast(`${file.name} entrou no canvas.`);
    } catch (err) {
      toast(err?.message && err.message !== "[object Event]" ? err.message : (CONFIG.erros?.arquivo ?? ""));
    }
  }
}

const toWorld = (cx, cy) => {
  const r = vp.getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z };
};

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-file]")) $("#file").click();
  if (e.target.closest("[data-open-library]")) openLibrary();
});

/* ---------- seus vídeos ---------- */

const lib = $("#lib-dlg");
function openLibrary() {
  const videos = CONFIG.videos ?? [];
  $("#lib-list").innerHTML = videos.length
    ? videos
        .map((v, i) => `<button class="xlist__item interactive" type="button" data-lib="${i}"><span class="xlist__thumb"><video src="${esc(v.src)}#t=0.5" preload="metadata" muted playsinline></video></span><span class="xlist__text">${esc(v.name)}</span><span class="xlist__trail">${esc(v.when ?? "")}</span><span class="icon" hidden>check</span></button>`)
        .join("")
    : `<p class="sheet-hint">Você ainda não tem vídeos prontos.</p>`;
  lib.showModal();
}
$("#lib-close")?.addEventListener("click", () => lib.close());
$("#lib-list")?.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-lib]");
  if (!item || item.dataset.adding) return;
  item.dataset.adding = "1";
  item.classList.add("is-busy");
  item.insertAdjacentHTML("beforeend", `<svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.8"/></svg>`);
  const v = CONFIG.videos[+item.dataset.lib];
  try {
    const dur = await probeUrl(v.src);
    const r = vp.getBoundingClientRect();
    const at = toWorld(r.left + 80, r.top + 120);
    const before = project;
    project = structuredClone(project);
    // Um embaixo do outro, para não cair em cima do que já está no canvas.
    const y = Math.max(at.y, ...project.blocks.map((b) => b.y + M.height(b) + 48));
    const b = { id: M.newId("b"), tone: M.nextTone(project, "video", v.src), kind: "video", name: v.name, src: v.src, dur, tin: 0, tout: dur, x: at.x, y, mute: false, vol: 1 };
    project.blocks.push(b);
    const first = M.linkFirst(project, b);
    sel = { type: "block", id: b.id };
    preview = { type: "block", id: b.id };
    commit(before);
    render();
    if (first) fit();
    item.querySelector(".icon").hidden = false;
    toast(`${v.name} entrou no canvas.`);
  } catch {
    toast(CONFIG.erros?.video ?? "");
  }
  delete item.dataset.adding;
  item.classList.remove("is-busy");
  item.querySelector(".spinner").remove();
});

function probeUrl(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = reject;
    el.src = src;
  });
}

$("#import")?.addEventListener("click", () => $("#file").click());
$("#file").onchange = (e) => {
  const r = vp.getBoundingClientRect();
  importFiles([...e.target.files], toWorld(r.left + r.width / 3, r.top + r.height / 3));
  e.target.value = "";
};
/* ---------- arrastar e colar: arquivos entram como blocos; texto vira nota ---------- */

// Onde o mouse está no canvas: o que for colado entra ali. Fora dele, embaixo de tudo o que já está
// no canvas (como os "Seus vídeos"), para não cair em cima de nada.
let pointer = null;
vp.addEventListener("pointermove", (e) => (pointer = { x: e.clientX, y: e.clientY }));
vp.addEventListener("pointerleave", () => (pointer = null));
function dropPoint() {
  if (pointer) return toWorld(pointer.x, pointer.y);
  const r = vp.getBoundingClientRect();
  const at = toWorld(r.left + 80, r.top + 120);
  const bottoms = [...project.blocks.map((b) => b.y + M.height(b)), ...(project.notes ?? []).map((n) => n.y + M.VIS_H)];
  return { x: at.x, y: Math.max(at.y, ...bottoms.map((y) => y + 48)) };
}

/** Uma nota nova com esse texto, escolhida (os Ajustes abrem nela). */
function addNote(text, at) {
  const before = project;
  const r = M.addNote(project, at, text);
  project = r.project;
  sel = { type: "note", id: r.id };
  commit(before);
  render();
}

/** Só imagem, vídeo e áudio entram; o resto avisa. A imagem colada não tem nome: "Imagem colada". */
function bringIn(files, at) {
  const ok = files.filter((f) => /^(image|video|audio)\//.test(f.type));
  if (ok.length < files.length) toast(CONFIG.erros?.arquivo ?? "");
  if (ok.length) importFiles(ok.map((f) => (/^image\.\w+$/.test(f.name) ? new File([f], `Imagem colada.${f.name.split(".").pop()}`, { type: f.type }) : f)), at);
}

const carries = (e) => [...(e.dataTransfer?.types ?? [])].some((t) => t === "Files" || t === "text/plain");
const typing = (el) => el?.closest?.("input, textarea, [contenteditable]");
// O aviso de soltar fica no canvas enquanto algo de fora passa por cima da página.
let dragDepth = 0;
const dropping = (on) => vp.classList.toggle("is-dropping", on);
document.addEventListener("dragenter", (e) => {
  if (carries(e)) dragDepth++, dropping(true);
});
document.addEventListener("dragleave", (e) => {
  if (carries(e) && --dragDepth <= 0) (dragDepth = 0), dropping(false);
});
// Soltar fora do canvas não deixa o navegador abrir o arquivo (e sair do projeto): entra no canvas também.
document.addEventListener("dragover", (e) => {
  if (carries(e) && !typing(e.target)) e.preventDefault();
});
document.addEventListener("drop", (e) => {
  dragDepth = 0;
  dropping(false);
  if (!carries(e) || typing(e.target)) return;
  e.preventDefault();
  const at = vp.contains(e.target) ? toWorld(e.clientX, e.clientY) : dropPoint();
  if (e.dataTransfer.files.length) return bringIn([...e.dataTransfer.files], at);
  const text = e.dataTransfer.getData("text/plain").trim();
  if (text) addNote(text, at);
});
/* ---------- copiar e colar elementos do canvas ---------- */

// O que foi copiado no canvas e o texto que foi junto para a área de transferência: enquanto ela tiver
// esse texto, colar põe os elementos; se a pessoa copiou outra coisa depois, vale a outra coisa.
let copied = null;
let copiedText = null;
const summary = (items) => [...items.notes.map((n) => n.text), ...items.blocks.map((b) => b.name), ...items.finals.map(() => "Final")].join("\n");

/** Copiar pelo menu: os elementos ficam aqui e o resumo vai para a área de transferência. */
async function copySelection() {
  const items = M.copyItems(project, sel);
  if (!items) return;
  copied = items;
  copiedText = summary(items);
  try {
    await navigator.clipboard.writeText(copiedText);
  } catch {
    // Sem permissão para escrever: o colar daqui confia no que ficou guardado.
    copiedText = null;
  }
}

/**
 * Cola em `at`: os elementos copiados no canvas (se a área de transferência ainda tem o texto deles,
 * ou se não dá para lê-la), senão a imagem (vira bloco) ou o texto (vira nota) de fora.
 */
function pasteFrom({ files, text }, at, fromMenu = false) {
  const outside = files.length > 0 || Boolean(text?.trim());
  const own = copied && (copiedText === null ? !outside : !files.length && text === copiedText);
  if (own) return placeItems(copied, at);
  if (files.length) return bringIn(files, at);
  if (text?.trim()) return addNote(text.trim(), at);
  if (fromMenu) toast(CONFIG.erros?.colar ?? "");
}

/** Colar pelo menu: lê a área de transferência (o navegador pode pedir permissão). */
async function pasteHere(at) {
  const files = [];
  let text = null;
  try {
    for (const item of await navigator.clipboard.read()) {
      const image = item.types.find((t) => t.startsWith("image/"));
      if (image) files.push(new File([await item.getType(image)], `image.${image.split("/")[1]}`, { type: image }));
      else if (item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
    }
  } catch {
    try {
      text = await navigator.clipboard.readText();
    } catch {}
  }
  pasteFrom({ files, text }, at, true);
}

// Ctrl+C / Cmd+C com um elemento escolhido (e nada de texto selecionado): copia o elemento.
document.addEventListener("copy", (e) => {
  if (typing(e.target) || String(window.getSelection() ?? "") || !e.clipboardData) return;
  const items = M.copyItems(project, sel);
  if (!items) return;
  e.preventDefault();
  copied = items;
  copiedText = summary(items);
  e.clipboardData.setData("text/plain", copiedText);
});
// Colar (Ctrl+V / Cmd+V) fora de um campo: o que foi copiado no canvas, a imagem (vira bloco) ou o texto (vira nota).
document.addEventListener("paste", (e) => {
  if (typing(e.target) || !e.clipboardData) return;
  const files = [...e.clipboardData.files];
  const text = e.clipboardData.getData("text/plain");
  if (!files.length && !text.trim() && !copied) return;
  e.preventDefault();
  pasteFrom({ files, text }, dropPoint());
});
$("#add-final")?.addEventListener("click", () => {
  const before = project;
  const r = vp.getBoundingClientRect();
  const at = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  project = structuredClone(project);
  const f = { id: M.newId("f"), x: at.x, y: at.y };
  project.finals.push(f);
  sel = { type: "final", id: f.id };
  commit(before);
  render();
});
$("#undo").onclick = () => step(undo, redo);
$("#redo").onclick = () => step(redo, undo);
$("#reset")?.addEventListener("click", () => {
  const before = project;
  project = M.sample((f) => `midia/${f}`);
  sel = { type: "final", id: "final" };
  preview = null;
  commit(before);
  fit();
  render();
});
$("#zoom-in").onclick = () => zoomAt(1.2);
$("#zoom-out").onclick = () => zoomAt(1 / 1.2);
$("#fit").onclick = () => fit();
// Info: o tooltip sobe do botão, 8 px acima da barra, sem sair da janela.
$("#info-tip").addEventListener("toggle", (e) => {
  if (e.newState !== "open") return;
  const tip = e.target;
  const r = $("#info").getBoundingClientRect();
  tip.style.left = `${Math.max(16, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - 16))}px`;
  tip.style.bottom = `${innerHeight - $(".float-bar").getBoundingClientRect().top + 8}px`;
});
$("#arrange").onclick = () => {
  const before = project;
  project = M.arrange(project);
  commit(before);
  render();
};

const ZOOM_MIN = 0.15;
const FIT_Y = 88;
// Até 800%: dá para ver a onda do som de perto para cortar.
const ZOOM_MAX = 8;
// Cada giro da roda vale no máximo isto, e o gesto de pinça, que manda valores pequenos, não muda.
const WHEEL_MAX = 30;
const WHEEL_SPEED = 0.007;

/** Dois cliques num bloco: amplia até ele ocupar a largura do canvas (a proporção não muda). */
function zoomToBlock(b) {
  zoomGoal = null;
  const r = vp.getBoundingClientRect();
  const w = M.width(b);
  const h = M.height(b);
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (r.width - 96) / w));
  // Se não cabe na altura, fica à vista a parte de baixo (a onda do som), acima da barra flutuante.
  const top = h * z <= r.height - 200 ? (r.height - h * z) / 2 : r.height - 112 - h * z;
  view = { z, x: (r.width - w * z) / 2 - b.x * z, y: top - b.y * z };
  applyView();
}
vp.addEventListener("dblclick", (e) => {
  const el = e.target.closest(".blk");
  if (!el) return;
  const b = project.blocks.find((o) => o.id === el.dataset.id);
  if (b) zoomToBlock(b);
});

/** Zoom da roda: anda até o alvo em alguns quadros, em vez de saltar. */
let zoomGoal = null;
function smoothZoom(k, cx, cy) {
  const running = !!zoomGoal;
  zoomGoal = { z: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (zoomGoal?.z ?? view.z) * k)), cx, cy };
  if (!running) requestAnimationFrame(zoomStep);
}
function zoomStep() {
  if (!zoomGoal) return;
  const k = zoomGoal.z / view.z;
  if (Math.abs(k - 1) < 0.002) {
    zoomAt(k, zoomGoal.cx, zoomGoal.cy);
    zoomGoal = null;
    return;
  }
  zoomAt(k ** 0.3, zoomGoal.cx, zoomGoal.cy);
  requestAnimationFrame(zoomStep);
}

function zoomAt(k, cx, cy) {
  const r = vp.getBoundingClientRect();
  cx ??= r.left + r.width / 2;
  cy ??= r.top + r.height / 2;
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.z * k));
  const px = cx - r.left;
  const py = cy - r.top;
  view.x = px - ((px - view.x) * z) / view.z;
  view.y = py - ((py - view.y) * z) / view.z;
  view.z = z;
  applyView();
}

function fit() {
  zoomGoal = null;
  const xs = [];
  const ys = [];
  for (const g of M.groups(project)) xs.push(g.x, g.x + g.w), ys.push(g.top, g.bottom);
  for (const n of project.notes ?? []) xs.push(n.x, n.x + M.NOTE_W), ys.push(n.y, n.y + M.VIS_H);
  const r = vp.getBoundingClientRect();
  // Canvas vazio: o aviso do começo fica no meio; o Final, à direita dele.
  if (!project.blocks.length && !project.notes?.length && project.finals.length) {
    const f = project.finals[0];
    view = { x: r.width * 0.8 - 90 - f.x, y: r.height / 2 - 40 - f.y, z: 1 };
    return applyView();
  }
  for (const f of project.finals) {
    const el = chrome.querySelector(`.fin[data-final="${f.id}"]`);
    xs.push(f.x, f.x + (el?.offsetWidth ?? 180));
    ys.push(f.y, f.y + (el?.offsetHeight ?? 80));
  }
  if (!xs.length) return;
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  // Centralizado, com folga para a barra de baixo (80 px) igual em cima e embaixo.
  view.z = Math.min(1.2, (r.width - 80) / w, (r.height - 2 * FIT_Y) / h);
  view.x = (r.width - w * view.z) / 2 - x0 * view.z;
  view.y = (r.height - h * view.z) / 2 - y0 * view.z;
  applyView();
}

/* ---------- exportar (no site: o servidor monta; a tela chama um passo depois do outro) ---------- */

let exportHidden = false;
let exportNow = null;
function showExport(st) {
  exportNow = st.status === "running" ? st : null;
  const done = st.status === "done";
  $("#dlg-title").textContent = done ? (st.versoes.length === 1 ? "Vídeo pronto" : `${st.versoes.length} vídeos prontos`) : "Exportando";
  $("#dlg-text").textContent = st.erro ?? (done ? `Disponíveis por 24 horas. ${st.versoes.length > 1 && !st.zip ? "Juntos passam do limite do ZIP: baixe um por vez." : "Baixe para guardar."}` : st.total ? `Montando: ${st.feitos} de ${st.total}. Feche para continuar editando.` : "Preparando a exportação.");
  const bar = $("#dlg-progress");
  bar.hidden = done || !!st.erro;
  // Sem nenhum passo pronto, o indeterminado mostra que está andando; depois, o andamento.
  bar.classList.toggle("linear-progress--determinate", st.feitos > 0);
  bar.style.setProperty("--progress", st.total ? st.feitos / st.total : 0);
  if (st.feitos > 0) bar.setAttribute("aria-valuenow", Math.round((st.feitos / st.total) * 100));
  else bar.removeAttribute("aria-valuenow");
  $("#dlg-list").innerHTML = st.versoes
    .map((v, i) => `<a class="xlist__item interactive" href="${esc(v.href)}" download><span class="xlist__lead">${i + 1}</span><span class="xlist__text">${esc(v.nome)}</span><span class="icon" aria-hidden="true">download</span></a>`)
    .join("");
  const zip = $("#dlg-zip");
  zip.hidden = !st.zip;
  if (st.zip) zip.href = st.zip;
  // Quem fechou o diálogo continua editando; ele só volta quando ficar pronto.
  if (!$("#dlg").open && (!exportHidden || st.status !== "running")) $("#dlg").showModal();
}

async function followExport(st) {
  const url = `${PROJETO.exportar.replace(/\/exportar$/, "/exportacoes")}/${st.id}`;
  showExport(st);
  while (st.status === "running") {
    const before = st.feitos;
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    st = await res.json();
    showExport(st);
    // Sem avanço: outro pedido está no passo; espera um pouco antes de perguntar de novo.
    if (st.status === "running" && st.feitos === before) await new Promise((r) => setTimeout(r, 1500));
  }
  CONFIG.exportacao = st;
  if (st.status === "done") render();
}

async function startExport(finalId, versoes) {
  exportHidden = false;
  // Outra já em andamento: mostra ela, em vez de começar de novo.
  if (exportNow) return showExport(exportNow);
  // O diálogo abre no clique, antes de qualquer resposta do servidor.
  showExport({ status: "running", feitos: 0, total: 0, versoes: [], zip: null, erro: null });
  try {
    // A exportação usa o projeto salvo: manda o que ainda não foi e, sem salvar, não exporta.
    if (!(await save())) return failExport(CONFIG.erros?.salvar);
    const res = await fetch(PROJETO.exportar, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ final: finalId, versoes }) });
    if (!res.ok) return failExport(res.status === 400 ? await res.text() : CONFIG.erros?.exportar);
    await followExport(await res.json());
  } catch {
    failExport(CONFIG.erros?.exportar);
  }
}

/* ---------- menu do botão direito ---------- */

// O menu vertical do M3, o mesmo do card Final: no Final, Baixar a variação e todas; em qualquer
// elemento, Copiar, Colar, Duplicar e Excluir; no vazio, só Colar. Colar põe no ponto do clique.
const ctxMenu = $("#ctx-menu");
const closeMenu = () => ctxMenu.matches(":popover-open") && ctxMenu.hidePopover();
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const keyHint = (k) => (MAC ? `⌘${k}` : `Ctrl+${k}`);
const menuItem = (attr, icon, text, trail = "") =>
  `<button class="menu__item interactive" type="button" role="menuitem" ${attr}><span class="icon" aria-hidden="true">${icon}</span>${text}${trail ? `<span class="menu__trail">${trail}</span>` : ""}</button>`;
let menuAt = null;
vp.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const t = e.target;
  const note = t.closest("[data-note]");
  const fin = t.closest(".fin");
  const tab = t.closest(".gtab");
  const blk = note ? null : t.closest(".blk");
  const edge = t.closest(".wire-hit");
  const target = note ? { type: "note", id: note.dataset.note } : fin ? { type: "final", id: fin.dataset.final } : tab ? { type: "group", id: tab.dataset.group } : blk ? { type: "block", id: blk.dataset.id } : edge ? { type: "edge", id: edge.dataset.edge } : null;
  // O elemento do clique fica escolhido, como no clique comum (os Ajustes mostram o que o menu vai mudar).
  if (target && (sel.type !== target.type || sel.id !== target.id)) {
    if (target.type === "final") versionIdx = 0;
    sel = target;
    render();
  }
  menuAt = toWorld(e.clientX, e.clientY);
  let html = "";
  const n = fin && PROJETO ? M.versions(project, fin.dataset.final).length : 0;
  if (n) {
    // A variação do clique; fora de uma, a escolhida. Não muda o que está na prévia.
    const el = t.closest("[data-variant]");
    const i = el ? +el.dataset.variant : fin.dataset.final === previewFinal()?.id ? versionIdx : 0;
    ctxMenu.dataset.final = fin.dataset.final;
    html += menuItem(`data-down="${i}"`, "download", `Baixar ${M.versionName(i)}`) + (n > 1 ? menuItem('data-down="all"', "download", `Baixar todas (${n})`) : "") + `<hr class="menu__divider">`;
  }
  const copies = target && target.type !== "edge";
  if (copies) html += menuItem('data-menu="copy"', "content_copy", "Copiar", keyHint("C"));
  html += menuItem('data-menu="paste"', "content_paste", "Colar", keyHint("V"));
  if (copies) html += menuItem('data-menu="dup"', "control_point_duplicate", "Duplicar", keyHint("D"));
  if (target) html += `<hr class="menu__divider">` + menuItem('data-menu="del"', "delete", "Excluir", MAC ? "⌫" : "Delete");
  ctxMenu.innerHTML = html;
  ctxMenu.showPopover();
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
  ctxMenu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  ctxMenu.querySelector("button").focus();
});
// O menu abre com o botão ainda apertado; no "auto", soltar o botão já o fecharia.
window.addEventListener("pointerdown", (e) => ctxMenu.contains(e.target) || closeMenu(), true);
ctxMenu.addEventListener("click", (e) => {
  const item = e.target.closest("[data-down], [data-menu]");
  if (!item) return;
  closeMenu();
  const { down, menu } = item.dataset;
  if (down !== undefined) return startExport(ctxMenu.dataset.final, down === "all" ? undefined : [+down]);
  if (menu === "copy") copySelection();
  if (menu === "paste") pasteHere(menuAt);
  if (menu === "dup") duplicate();
  if (menu === "del") removeSelection();
});
// Setas, Home e End andam pelos itens, como no campo de seleção do site.
ctxMenu.addEventListener("keydown", (e) => {
  const items = [...ctxMenu.querySelectorAll("button")];
  const i = items.indexOf(document.activeElement);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  items[(to + items.length) % items.length].focus();
});

function failExport(msg) {
  exportNow = null;
  if ($("#dlg").open) $("#dlg").close();
  toast(msg ?? "");
}

/** Com `busy`, o aviso fica na tela com a barra até o próximo aviso. */
function toast(msg, busy = false) {
  const t = $("#toast");
  $("#toast-text").textContent = msg;
  t.hidden = false;
  $("#toast-progress").hidden = !busy;
  clearTimeout(toast.t);
  if (!busy) toast.t = setTimeout(() => (t.hidden = true), 4000);
}

/* ---------- gestos ---------- */

vp.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    closeMenu();
    if (e.ctrlKey || e.metaKey) smoothZoom(Math.exp(-Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, e.deltaY)) * WHEEL_SPEED), e.clientX, e.clientY);
    else {
      view.x -= e.deltaX;
      view.y -= e.deltaY;
      applyView();
    }
  },
  { passive: false },
);

/**
 * Puxar uma ligação de um ponto até outro grupo ou Final. end: a ponta que fica parada, de
 * saída (out) ou de entrada, num grupo (group, o id dele) ou num Final (final).
 */
function linkDrag(end) {
  const gs0 = M.groups(project);
  const f = end.final && project.finals.find((o) => o.id === end.final);
  const g = gs0.find((o) => o.id === end.group);
  const a = f ? finalPoint(f) : end.out ? outPoint(g) : inPoint(g);
  return {
    onMove(ev) {
      const at = toWorld(ev.clientX, ev.clientY);
      $("#wire-temp").setAttribute("d", end.out ? curve(a, at) : curve(at, a));
    },
    onUp(ev) {
      $("#wire-temp").setAttribute("d", "");
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const gs = M.groups(project);
      const idx = M.groupIndex(gs);
      const fEl = over?.closest("[data-final]");
      const gEl = over?.closest(".port[data-group], .gtab");
      const bEl = over?.closest(".blk");
      const other = gEl ? gs.find((x) => x.id === gEl.dataset.group) : bEl ? idx.get(bEl.dataset.id) : null;
      const self = gs.find((x) => x.id === end.group);
      let from, to;
      if (end.out) (from = self?.last.id), (to = fEl?.dataset.final ?? other?.first.id);
      else (from = other?.last.id), (to = end.final ?? self?.first.id);
      if (!from || !to) return;
      const problem = M.linkProblem(project, from, to);
      const text = { cycle: CONFIG.erros?.ligacaoCiclo, repeated: CONFIG.erros?.ligacaoRepetida, limit: CONFIG.erros?.exportarLimite }[problem];
      if (text) toast(text);
      if (problem) return;
      project = structuredClone(project);
      project.edges.push({ id: M.newId("e"), from, to });
    },
  };
}

vp.addEventListener("pointerdown", (e) => {
  if ((e.button !== 0 && e.button !== 1) || (e.button === 0 && e.ctrlKey)) return;
  // Sem isso o navegador começa a arrastar texto selecionado e cancela o gesto.
  e.preventDefault();
  const t = e.target;
  const start = { x: e.clientX, y: e.clientY };
  const base = project;
  const dW = (ev) => ({ x: (ev.clientX - start.x) / view.z, y: (ev.clientY - start.y) / view.z });
  let moved = false;
  let onMove;
  let onUp = () => {};

  if (t.closest(".playhead") && headBox) {
    // Arrastar a linha de reprodução: anda pela prévia (tocando ou parada).
    const box = headBox;
    const seekTo = (ev) => player.seek(Math.min(Math.max((toWorld(ev.clientX, ev.clientY).x - box.x) / M.PX, 0), player.duration));
    head.classList.add("is-drag");
    const mv = (ev) => seekTo(ev);
    const end = () => {
      head.classList.remove("is-drag");
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return;
  }
  const variant = t.closest("[data-variant]");
  if (variant) return pickVariant(variant.closest(".fin").dataset.final, +variant.dataset.variant);
  const playEl = t.closest("[data-play-block], [data-play-group]");
  if (playEl) {
    const p = playEl.dataset.playBlock ? { type: "block", id: playEl.dataset.playBlock } : { type: "group", id: playEl.dataset.playGroup };
    if (p.type === "group") sel = { type: "group", id: p.id };
    const same = preview?.type === p.type && preview.id === p.id;
    if (same && player.playing) player.pause(), setPlayIcon(), render();
    // A mesma prévia continua de onde parou (ou de onde a linha foi arrastada).
    else if (same) player.play(), setPlayIcon(), render({ side: false });
    else playNow(p);
    return;
  }
  const trimEl = t.closest("[data-trim]");
  const port = t.closest(".port");
  const tab = t.closest(".gtab");
  // A nota tem a cara de um bloco, mas não entra em grupo: só anda.
  const note = t.closest("[data-note]");
  const blk = note ? null : t.closest(".blk");
  const fin = t.closest(".fin");
  const hit = t.closest(".wire-hit");

  if (e.button === 1 || (!trimEl && !port && !tab && !blk && !note && !fin && !hit)) {
    const v0 = { ...view };
    onMove = (ev) => {
      view.x = v0.x + ev.clientX - start.x;
      view.y = v0.y + ev.clientY - start.y;
      applyView();
    };
    onUp = (ev) => {
      if (moved) return;
      // Clique no vazio dentro da área de um grupo: a prévia vai para aquele ponto do grupo.
      const at = toWorld(ev.clientX, ev.clientY);
      const g = groupAt(at);
      if (g) {
        sel = { type: "group", id: g.id };
        preview = { type: "group", id: g.id };
        render();
        player.seek(Math.min(Math.max((at.x - g.x) / M.PX, 0), g.dur));
        setPlayIcon();
        return;
      }
      if (sel.type) (sel = { type: null }), (preview = null), render();
    };
    vp.classList.add("is-panning");
  } else if (trimEl) {
    const id = trimEl.closest(".blk").dataset.id;
    sel = { type: "block", id };
    onMove = (ev) => {
      project = M.trim(base, id, trimEl.dataset.trim, dW(ev).x / M.PX);
      renderSoon();
    };
  } else if (port) {
    const drag = linkDrag({ out: port.classList.contains("port--out"), group: port.dataset.group, final: port.dataset.final });
    onMove = drag.onMove;
    onUp = drag.onUp;
  } else if (tab) {
    const gid = tab.dataset.group;
    sel = { type: "group", id: gid };
    preview = { type: "group", id: gid };
    render();
    onMove = (ev) => {
      const d = dW(ev);
      project = M.moveGroup(base, gid, d.x, d.y);
      renderSoon();
    };
  } else if (note) {
    const id = note.dataset.note;
    const n0 = base.notes.find((n) => n.id === id);
    sel = { type: "note", id };
    render();
    onMove = (ev) => {
      const d = dW(ev);
      project = structuredClone(base);
      Object.assign(project.notes.find((n) => n.id === id), { x: Math.round(n0.x + d.x), y: Math.round(n0.y + d.y) });
      noteEls.get(id)?.classList.add("is-drag");
      renderSoon();
    };
    onUp = () => noteEls.get(id)?.classList.remove("is-drag");
  } else if (blk) {
    const id = blk.dataset.id;
    const b0 = base.blocks.find((b) => b.id === id);
    // Puxar pela faixa de som: anda junto com o vídeo e muda só a faixa do som.
    const bySound = !!t.closest(".blk__link");
    sel = { type: "block", id };
    preview = { type: "block", id };
    render();
    // O bloco que segura o elemento neste arrasto.
    let keep = {};
    let placed = "";
    onMove = (ev) => {
      const d = dW(ev);
      const dy = bySound ? 0 : d.y;
      const s = ev.altKey ? { x: b0.x + d.x, y: b0.y + dy, mode: null } : M.snap(base, id, b0.x + d.x, b0.y + dy, 16 / view.z, keep);
      keep = { group: s.group?.id, track: s.track, beside: s.beside };
      // O mouse anda, mas o elemento pode estar parado no encaixe: nada a redesenhar.
      const at = `${s.x}|${s.y}|${bySound ? Math.round(d.y / M.AUD_H) : ""}`;
      if (at === placed) return;
      placed = at;
      project = M.dropBlock(base, id, s);
      if (bySound) project = M.setLane(project, id, toWorld(ev.clientX, ev.clientY).y);
      $("#snapinfo").textContent = SNAP[s.mode] ?? "";
      blockEls.get(id)?.classList.add("is-drag");
      renderSoon();
    };
    onUp = () => {
      $("#snapinfo").textContent = "";
      blockEls.get(id)?.classList.remove("is-drag");
      if (moved) render();
    };
  } else if (fin) {
    const id = fin.dataset.final;
    const f0 = base.finals.find((f) => f.id === id);
    if (sel.type === "final" && sel.id !== id) versionIdx = 0;
    sel = { type: "final", id };
    preview = null;
    render();
    onMove = (ev) => {
      const d = dW(ev);
      project = structuredClone(base);
      Object.assign(project.finals.find((f) => f.id === id), { x: f0.x + d.x, y: f0.y + d.y });
      renderSoon();
    };
  } else if (hit) {
    // Puxar a linha solta a ponta mais perto: cair num ponto liga de novo; no vazio, ela some.
    const id = hit.dataset.edge;
    sel = { type: "edge", id };
    render();
    let drag = null;
    onMove = (ev) => {
      if (!drag) {
        const l = M.links(project).find((l) => l.edge.id === id);
        const at = toWorld(ev.clientX, ev.clientY);
        const f = typeof l.to === "string" ? project.finals.find((f) => f.id === l.to) : null;
        const [p0, p1] = [outPoint(l.from), f ? finalPoint(f) : inPoint(l.to)];
        const keepOut = Math.hypot(at.x - p1.x, at.y - p1.y) < Math.hypot(at.x - p0.x, at.y - p0.y);
        project = M.removeItems(base, [id]);
        sel = { type: null };
        render();
        drag = linkDrag(keepOut ? { out: true, group: l.from.id } : { out: false, group: f ? undefined : l.to.id, final: f?.id });
      }
      drag.onMove(ev);
    };
    onUp = (ev) => drag?.onUp(ev);
  }

  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
    moved = true;
    onMove?.(ev);
  };
  const up = (ev) => {
    cancelAnimationFrame(drawing);
    drawing = 0;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    vp.classList.remove("is-panning");
    onUp(ev);
    if (moved) commit(base), render();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
  if (e.target.closest("input, textarea, [popover]")) return;
  const mod = e.ctrlKey || e.metaKey;
  if ((e.key === "Delete" || e.key === "Backspace") && sel.type) removeSelection();
  else if (mod && e.key.toLowerCase() === "z") step(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo);
  else if (mod && e.key.toLowerCase() === "y") step(redo, undo);
  else if (mod && e.key.toLowerCase() === "d") e.preventDefault(), duplicate();
  else if (e.key === " " && !e.repeat) e.preventDefault(), pv.play.click();
  else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && sel.type === "final" && !preview && !e.target.closest(".text-field--select")) {
    const i = versionIdx + (e.key === "ArrowLeft" ? -1 : 1);
    if (i >= 0 && i < M.versions(project, sel.id).length) e.preventDefault(), pickVariant(sel.id, i);
  }
  else return;
});

applyView();
render();
requestAnimationFrame(fit);
if (CONFIG.exportacao?.status === "running") followExport(CONFIG.exportacao).catch(() => toast(CONFIG.erros?.exportar ?? ""));
window.canvasDebug = { get project() { return project; }, get view() { return view; } };
