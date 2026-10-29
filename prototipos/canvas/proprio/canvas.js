/**
 * Canvas de edição com código próprio: DOM e SVG dentro de um "mundo" com
 * translate/scale. O significado (grupos, coberturas, versões) vem do
 * comum/modelo.js; aqui só desenho e gestos.
 */
import * as M from "../comum/modelo.js";
import { Player, clock } from "../comum/player.js";
import { thumb, probe } from "../comum/miniaturas.js";

const $ = (s, el = document) => el.querySelector(s);
const vp = $("#vp");
const world = $("#world");
const wires = $("#wires");
const chrome = $("#chrome");
const side = $("#side");
const SNAP = { after: "Juntar na sequência", before: "Juntar na sequência", cover: "Cobrir a imagem neste trecho", audio: "Somar este som" };
const fmt = (s) => `${s.toFixed(1).replace(".", ",")} s`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let project = M.sample((f) => `midia/${f}`);
let view = { x: 80, y: 120, z: 0.8 };
let sel = { type: "final", id: "final" };
let versionIdx = 0;
// O que a prévia toca: null (a versão escolhida no Final), um grupo ou um bloco.
let preview = null;
const undo = [];
const redo = [];

/* ---------- prévia ---------- */

const pv = {
  canvas: $("#pv-canvas"),
  play: $("#pv-play"),
  time: $("#pv-time"),
  slider: $("#pv-slider"),
  title: $("#pv-title"),
};
const player = new Player(pv.canvas, {
  onTick(t, d) {
    pv.time.textContent = `${clock(t)} / ${clock(d)}`;
    pv.slider.max = d;
    pv.slider.value = t;
    pv.slider.style.setProperty("--p", `${d ? (t / d) * 100 : 0}%`);
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
    if (g) (v = [g]), (title = `Grupo: ${g.name}`);
  }
  if (preview?.type === "block") {
    const b = project.blocks.find((b) => b.id === preview.id);
    if (b) {
      // Só o bloco, do corte dele: sem o que está por cima nem o som somado.
      tl = { duration: M.len(b), items: [{ block: b, layer: b.kind === "audio" ? "audio" : 0, start: 0, len: M.len(b), tin: b.tin }] };
      title = `Bloco: ${b.name}`;
    }
  }
  if (!v && !tl) {
    const f = project.finals[0] && (sel.type === "final" ? project.finals.find((f) => f.id === sel.id) : project.finals[0]);
    const vs = f ? M.versions(project, f.id, gs) : [];
    if (vs.length) {
      versionIdx = Math.min(versionIdx, vs.length - 1);
      v = vs[versionIdx];
      title = `Versão ${versionIdx + 1}: ${M.versionName(v)}`;
    }
  }
  tl ??= v ? M.timeline(v) : { duration: 0, items: [] };
  const key = JSON.stringify(tl.items.map((i) => [i.block.id, i.block.src, i.start, i.len, i.tin, i.block.mute, i.block.vol]));
  pv.title.textContent = title;
  if (key === loadedKey) return playhead(player.t);
  loadedKey = key;
  player.load(tl);
  setPlayIcon();
}

/** Linha de reprodução sobre o bloco ou o grupo que a prévia toca (na versão, não aparece). */
const head = document.createElement("div");
head.className = "playhead";
function playhead(t) {
  let box = null;
  if (preview?.type === "block") {
    const b = project.blocks.find((b) => b.id === preview.id);
    if (b) box = { x: b.x, y: b.y, h: M.height(b) };
  } else if (preview?.type === "group") {
    const g = M.groups(project).find((g) => g.id === preview.id);
    if (g) {
      const top = Math.min(g.y, ...g.covers.map((c) => c.y));
      const bottom = g.y + (g.soloAudio ? M.AUD_H : M.VIS_H) + (g.audios.length && !g.soloAudio ? M.AUD_H : 0);
      box = { x: g.x, y: top, h: bottom - top };
    }
  }
  head.hidden = !box || (!player.playing && t <= 0);
  if (box) Object.assign(head.style, { left: `${box.x + t * M.PX - 1}px`, top: `${box.y - 4}px`, height: `${box.h + 8}px` });
}
function playNow(p) {
  preview = p;
  render();
  player.seek(0);
  player.play();
  setPlayIcon();
  render({ side: false });
}

/* ---------- histórico ---------- */

function commit(before) {
  if (JSON.stringify(before) === JSON.stringify(project)) return;
  undo.push(before);
  if (undo.length > 100) undo.shift();
  redo.length = 0;
}
function step(from, to) {
  if (!from.length) return;
  to.push(project);
  project = from.pop();
  render();
}

/* ---------- desenho ---------- */

// Espaço entre os blocos e o tracejado da área do grupo.
const FRAME_PAD = 20;
const blockEls = new Map();

function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  vp.style.backgroundSize = `${24 * view.z}px ${24 * view.z}px`;
  vp.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $("#zoom").textContent = `${Math.round(view.z * 100)}%`;
}

function render({ side = true } = {}) {
  const gs = M.groups(project);
  const idx = M.groupIndex(gs);

  // Blocos: mantém os elementos (a miniatura não pisca ao arrastar).
  const seen = new Set();
  for (const b of project.blocks) {
    seen.add(b.id);
    let el = blockEls.get(b.id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = b.id;
      el.innerHTML = `<div class="blk__media"></div><div class="blk__label"><span class="icon blk__kind"></span><span class="blk__name"></span><span class="blk__dur"></span><span class="icon blk__mute">volume_off</span></div><i class="trim trim--l" data-trim="l"></i><i class="trim trim--r" data-trim="r"></i>`;
      world.append(el);
      blockEls.set(b.id, el);
      thumb(b).then((u) => {
        if (!u) return;
        const m = $(".blk__media", el);
        // O áudio é uma máscara: a onda pega a cor do bloco.
        if (b.kind === "audio") m.style.maskImage = m.style.webkitMaskImage = `url("${u}")`;
        else m.style.backgroundImage = `url("${u}")`;
      });
    }
    const g = idx.get(b.id);
    const role = g?.covers.includes(b) ? "cover" : g?.audios.includes(b) && !g.soloAudio ? "under" : "";
    el.className = `blk blk--${b.kind} ${role ? `blk--${role}` : ""} ${sel.type === "block" && sel.id === b.id ? "is-sel" : ""} ${b.mute ? "is-mute" : ""}`;
    Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${M.width(b)}px`, height: `${M.height(b)}px` });
    const tipo = { video: "video", image: "imagem", audio: "audio" }[b.kind];
    el.style.setProperty("--c", `var(--bloco-${tipo}-${b.tone ?? 1})`);
    el.style.setProperty("--on", `var(--bloco-${tipo}-on)`);
    const media = $(".blk__media", el);
    if (b.kind === "audio") {
      media.style.maskSize = media.style.webkitMaskSize = `${b.dur * M.PX}px 100%`;
      media.style.maskPosition = media.style.webkitMaskPosition = `${-b.tin * M.PX}px 0`;
    }
    $(".blk__kind", el).textContent = { video: "movie", image: "image", audio: "music_note" }[b.kind];
    $(".blk__name", el).textContent = b.name;
    $(".blk__dur", el).textContent = fmt(M.len(b));
  }
  for (const [id, el] of blockEls) if (!seen.has(id)) el.remove(), blockEls.delete(id);

  // Abas dos grupos, portas e blocos finais.
  let html = "";
  for (const g of gs) {
    const top = Math.min(g.y, ...g.covers.map((c) => c.y));
    const rowH = g.soloAudio ? M.AUD_H : M.VIS_H;
    const isSel = sel.type === "group" && sel.id === g.id;
    if (g.blocks.length > 1 || g.covers.length || (g.audios.length && !g.soloAudio)) {
      // A área do grupo: um retângulo tracejado em volta de tudo o que entra nele.
      const bottom = g.y + rowH + (g.audios.length && !g.soloAudio ? M.AUD_H : 0);
      html += `<div class="gframe ${isSel ? "is-sel" : ""}" style="left:${g.x - FRAME_PAD}px;top:${top - FRAME_PAD}px;width:${g.w + 2 * FRAME_PAD}px;height:${bottom - top + 2 * FRAME_PAD}px"></div>`;
      html += `<div class="gtab ${isSel ? "is-sel" : ""}" data-group="${g.id}" style="left:${g.x - FRAME_PAD}px;top:${top - FRAME_PAD - 40}px"><span class="icon">drag_indicator</span>${esc(g.name)} · ${fmt(g.dur)}<button class="gtab__play interactive" type="button" data-play-group="${g.id}" aria-label="Tocar o grupo" title="Tocar o grupo"><span class="icon">play_arrow</span></button></div>`;
    }
    html += `<div class="port port--in" data-group="${g.id}" style="left:${g.x - 9}px;top:${g.y + rowH / 2 - 9}px"></div>`;
    html += `<div class="port port--out" data-group="${g.id}" style="left:${g.x + g.w - 9}px;top:${g.y + rowH / 2 - 9}px"></div>`;
  }
  // Bloco escolhido: o botão de tocar só ele, no meio da imagem.
  const sb = sel.type === "block" && project.blocks.find((b) => b.id === sel.id);
  if (sb) {
    const w = M.width(sb);
    const cy = sb.kind === "audio" ? sb.y + M.AUD_H / 2 : sb.y + 28 + (M.VIS_H - 32) / 2;
    const playing = player.playing && preview?.type === "block" && preview.id === sb.id;
    html += `<button class="blk-play interactive" type="button" data-play-block="${sb.id}" style="left:${sb.x + w / 2 - 20}px;top:${cy - 20}px" aria-label="${playing ? "Pausar" : "Tocar o bloco"}" title="${playing ? "Pausar" : "Tocar o bloco"}"><span class="icon">${playing ? "pause" : "play_arrow"}</span></button>`;
  }
  for (const f of project.finals) {
    const n = M.versions(project, f.id, gs).length;
    const isSel = sel.type === "final" && sel.id === f.id;
    html += `<div class="fin ${isSel ? "is-sel" : ""}" data-final="${f.id}" style="left:${f.x}px;top:${f.y}px"><span class="icon">flag</span><span><b>Final</b><small>${n} ${n === 1 ? "versão" : "versões"}</small></span></div>`;
    html += `<div class="port port--in" data-final="${f.id}" style="left:${f.x - 9}px;top:${f.y + 40 - 9}px"></div>`;
  }
  chrome.innerHTML = html;
  world.append(head);

  // Linhas.
  let svg = "";
  for (const l of M.links(project, gs)) {
    const a = { x: l.from.x + l.from.w, y: l.from.y + (l.from.soloAudio ? M.AUD_H : M.VIS_H) / 2 };
    const f = typeof l.to === "string" ? project.finals.find((f) => f.id === l.to) : null;
    const b = f ? { x: f.x, y: f.y + 40 } : { x: l.to.x, y: l.to.y + (l.to.soloAudio ? M.AUD_H : M.VIS_H) / 2 };
    const d = curve(a, b);
    const on = sel.type === "edge" && sel.id === l.edge.id;
    svg += `<path class="wire ${on ? "is-sel" : ""}" d="${d}"/><path class="wire-hit" data-edge="${l.edge.id}" d="${d}"/>`;
  }
  wires.innerHTML = svg + `<path id="wire-temp" class="wire wire--temp" d=""/>`;

  if (side) renderSide(gs);
  loadPreview();
  $("#undo").disabled = !undo.length;
  $("#redo").disabled = !redo.length;
}

const curve = (a, b) => {
  const k = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
};

/* ---------- painel ---------- */

const sideTitle = $("#side-title");
const sideActions = $("#side-actions");
const btn = (kind, act, icon, text) => `<button class="button button--${kind} interactive" type="button" ${act}><span class="icon">${icon}</span>${text}</button>`;
const field = (id, label, value, attrs = "") =>
  `<div class="text-field"><input class="text-field__input" id="${id}" value="${esc(value)}" placeholder=" " ${attrs}><label class="text-field__label" for="${id}">${label}</label></div>`;
const row = (icon, label, value) => `<div class="qe-result__row"><span class="icon" aria-hidden="true">${icon}</span><span class="qe-result__label">${label}</span><span class="qe-result__value">${value}</span></div>`;

function renderSide(gs) {
  let title = "Projeto";
  let h = "";
  let actions = "";
  if (sel.type === "final") {
    const vs = M.versions(project, sel.id, gs);
    title = "Final";
    h += `<section class="viewer__section"><h3 class="viewer__title">Versões</h3><p class="sheet-hint">${vs.length ? `${vs.length} ${vs.length === 1 ? "versão sai" : "versões saem"} das linhas que chegam aqui.` : "Ligue um grupo ao Final para ter versões."}</p>`;
    h += `<div class="xlist">${vs
      .map((v, i) => `<button class="xlist__item interactive" type="button" data-version="${i}" aria-current="${i === versionIdx && !preview}"><span class="xlist__lead">${i + 1}</span><span class="xlist__text">${esc(M.versionName(v))}</span><span class="xlist__trail">${fmt(M.timeline(v).duration)}</span></button>`)
      .join("")}</div></section>`;
    if (vs.length) actions = btn("outlined", 'data-export="one"', "download", "Exportar esta") + btn("filled", 'data-export="all"', "download", `Exportar ${vs.length}`);
  } else if (sel.type === "block") {
    const b = project.blocks.find((b) => b.id === sel.id);
    title = { video: "Vídeo", image: "Imagem", audio: "Áudio" }[b.kind];
    h += field("f-name", "Nome", b.name);
    if (b.kind === "image") h += field("f-tout", "Duração (s)", b.tout.toFixed(1), `type="number" step="0.1" min="${M.MIN_LEN}" max="${M.IMAGE_MAX}"`);
    else
      h += `<div class="text-field"><div class="fields-row">${field("f-tin", "Começa em (s)", b.tin.toFixed(1), 'type="number" step="0.1" min="0"')}${field("f-tout", "Termina em (s)", b.tout.toFixed(1), `type="number" step="0.1" max="${b.dur.toFixed(1)}"`)}</div><p class="text-field__supporting">Arquivo de ${fmt(b.dur)}. Puxe as pontas do bloco para cortar.</p></div>`;
    if (b.kind !== "image")
      h += `<section class="viewer__section"><h3 class="viewer__title">Som</h3><label class="switch-row" for="f-mute">Sem som<span class="switch"><input type="checkbox" role="switch" id="f-mute" ${b.mute ? "checked" : ""}><span class="switch__track"></span><span class="switch__handle"></span></span></label>
        <div class="slider-field"><span class="slider-field__label"><span>Volume</span><span id="f-vol-n">${Math.round(b.vol * 100)}%</span></span><input class="vbar__seek" type="range" id="f-vol" min="0" max="1" step="0.05" value="${b.vol}" style="--p:${b.vol * 100}%" aria-label="Volume" ${b.mute ? "disabled" : ""}></div></section>`;
    actions = btn("outlined", 'data-act="dup"', "content_copy", "Duplicar") + btn("text", 'data-act="del"', "delete", "Excluir");
  } else if (sel.type === "group") {
    const g = gs.find((g) => g.id === sel.id);
    if (g) {
      title = "Grupo";
      h += `<div class="viewer__card"><p class="qe-result__title">${esc(g.name)}</p><div>${row("schedule", "Duração", fmt(g.dur))}${row("movie", "Em sequência", g.blocks.length)}${row("layers", "Por cima", g.covers.length)}${row("music_note", "Som somado", g.audios.length)}</div></div>`;
      actions = btn("text", 'data-act="del"', "delete", "Excluir grupo");
    }
  } else if (sel.type === "edge") {
    title = "Linha";
    h += `<p class="sheet-hint">Liga um grupo ao seguinte. Cada caminho até o Final é uma versão.</p>`;
    actions = btn("text", 'data-act="del"', "delete", "Excluir linha");
  } else {
    h += `<p class="sheet-hint">Escolha um bloco, um grupo ou o Final.</p>`;
  }
  sideTitle.textContent = title;
  side.innerHTML = h;
  sideActions.innerHTML = actions;
  sideActions.hidden = !actions;
}

sideActions.addEventListener("click", (e) => side.onclickAction(e));
side.onclickAction = (e) => {
  const v = e.target.closest("[data-version]");
  if (v) {
    versionIdx = +v.dataset.version;
    preview = null;
    render();
    player.play();
    setPlayIcon();
  }
  const ex = e.target.closest("[data-export]");
  if (ex) {
    const vs = M.versions(project, sel.id);
    const list = ex.dataset.export === "all" ? vs : [vs[versionIdx]];
    $("#dlg-body").textContent = JSON.stringify(list.map(M.exportPlan), null, 2);
    $("#dlg-title").textContent = list.length === 1 ? "Exportar 1 versão" : `Exportar ${list.length} versões`;
    $("#dlg").showModal();
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "del") removeSelection();
  if (act === "dup") duplicate();
};
side.addEventListener("click", side.onclickAction);
side.addEventListener("input", (e) => {
  if (sel.type !== "block") return;
  const before = project;
  project = structuredClone(project);
  const b = project.blocks.find((b) => b.id === sel.id);
  const t = e.target;
  if (t.id === "f-name") b.name = t.value;
  if (t.id === "f-mute") b.mute = t.checked;
  if (t.id === "f-vol") b.vol = +t.value;
  if (t.id === "f-tin" && t.value !== "") project = M.trim(project, b.id, "l", +t.value - b.tin);
  if (t.id === "f-tout" && t.value !== "") project = M.trim(project, b.id, "r", +t.value - b.tout);
  commit(before);
  if (t.id === "f-vol") {
    t.style.setProperty("--p", `${b.vol * 100}%`);
    $("#f-vol-n").textContent = `${Math.round(b.vol * 100)}%`;
  }
  // Não redesenha o painel enquanto digita ou arrasta (perderia o foco), só o resto.
  render({ side: t.id === "f-mute" });
});
$("#dlg-close").onclick = () => $("#dlg").close();

/* ---------- ações ---------- */

function removeSelection() {
  const before = project;
  if (sel.type === "group") {
    const g = M.groups(project).find((g) => g.id === sel.id);
    if (g) project = M.removeItems(project, [...g.blocks, ...g.covers, ...g.audios].map((b) => b.id));
  } else if (sel.type) project = M.removeItems(project, [sel.id]);
  commit(before);
  sel = { type: null };
  render();
}

function duplicate() {
  if (sel.type !== "block") return;
  const before = project;
  project = structuredClone(project);
  const b = project.blocks.find((b) => b.id === sel.id);
  const c = { ...b, id: M.newId("b"), y: b.y + M.height(b) + 140, name: `${b.name} (cópia)` };
  project.blocks.push(c);
  sel = { type: "block", id: c.id };
  commit(before);
  render();
}

async function importFiles(files, at) {
  const before = project;
  project = structuredClone(project);
  let y = at.y;
  for (const file of files) {
    try {
      const { src, kind, dur } = await probe(file);
      const b = { id: M.newId("b"), tone: M.nextTone(project, kind, src), kind, name: file.name.replace(/\.[^.]+$/, ""), src, dur: kind === "image" ? M.IMAGE_MAX : dur, tin: 0, tout: Math.min(dur, kind === "image" ? 3 : dur), x: at.x, y, mute: false, vol: 1 };
      project.blocks.push(b);
      sel = { type: "block", id: b.id };
      y += M.height(b) + 48;
    } catch {
      toast(`Não deu para abrir ${file.name}. Use MP4, MOV, JPG, PNG, MP3 ou M4A.`);
    }
  }
  commit(before);
  render();
}

const toWorld = (cx, cy) => {
  const r = vp.getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z };
};

$("#import").onclick = () => $("#file").click();
$("#file").onchange = (e) => {
  const r = vp.getBoundingClientRect();
  importFiles([...e.target.files], toWorld(r.left + r.width / 3, r.top + r.height / 3));
  e.target.value = "";
};
vp.addEventListener("dragover", (e) => e.preventDefault());
vp.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files], toWorld(e.clientX, e.clientY));
});
$("#add-final").onclick = () => {
  const before = project;
  const r = vp.getBoundingClientRect();
  const at = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  project = structuredClone(project);
  const f = { id: M.newId("f"), x: at.x, y: at.y };
  project.finals.push(f);
  sel = { type: "final", id: f.id };
  commit(before);
  render();
};
$("#undo").onclick = () => step(undo, redo);
$("#redo").onclick = () => step(redo, undo);
$("#reset").onclick = () => {
  const before = project;
  project = M.sample((f) => `midia/${f}`);
  sel = { type: "final", id: "final" };
  preview = null;
  commit(before);
  fit();
  render();
};
$("#zoom-in").onclick = () => zoomAt(1.2);
$("#zoom-out").onclick = () => zoomAt(1 / 1.2);
$("#fit").onclick = () => fit();

function zoomAt(k, cx, cy) {
  const r = vp.getBoundingClientRect();
  cx ??= r.left + r.width / 2;
  cy ??= r.top + r.height / 2;
  const z = Math.min(3, Math.max(0.15, view.z * k));
  const px = cx - r.left;
  const py = cy - r.top;
  view.x = px - ((px - view.x) * z) / view.z;
  view.y = py - ((py - view.y) * z) / view.z;
  view.z = z;
  applyView();
}

function fit() {
  const xs = [];
  const ys = [];
  for (const b of project.blocks) xs.push(b.x, b.x + M.width(b)), ys.push(b.y - FRAME_PAD - 40, b.y + M.height(b) + FRAME_PAD);
  for (const f of project.finals) xs.push(f.x, f.x + 180), ys.push(f.y, f.y + 80);
  if (!xs.length) return;
  const r = vp.getBoundingClientRect();
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  view.z = Math.min(1.2, (r.width - 80) / w, (r.height - 100) / h);
  view.x = (r.width - w * view.z) / 2 - x0 * view.z;
  view.y = (r.height - h * view.z) / 2 - y0 * view.z;
  applyView();
}

function toast(msg) {
  const t = $("#toast");
  $("#toast-text").textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 4000);
}

/* ---------- gestos ---------- */

vp.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    else {
      view.x -= e.deltaX;
      view.y -= e.deltaY;
      applyView();
    }
  },
  { passive: false },
);

vp.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  // Sem isso o navegador começa a arrastar texto selecionado e cancela o gesto.
  e.preventDefault();
  const t = e.target;
  const start = { x: e.clientX, y: e.clientY };
  const base = project;
  const dW = (ev) => ({ x: (ev.clientX - start.x) / view.z, y: (ev.clientY - start.y) / view.z });
  let moved = false;
  let onMove;
  let onUp = () => {};

  const playEl = t.closest("[data-play-block], [data-play-group]");
  if (playEl) {
    const p = playEl.dataset.playBlock ? { type: "block", id: playEl.dataset.playBlock } : { type: "group", id: playEl.dataset.playGroup };
    if (p.type === "group") sel = { type: "group", id: p.id };
    const same = preview?.type === p.type && preview.id === p.id;
    if (same && player.playing) player.pause(), setPlayIcon(), render();
    else playNow(p);
    return;
  }
  const trimEl = t.closest("[data-trim]");
  const outPort = t.closest(".port--out");
  const tab = t.closest(".gtab");
  const blk = t.closest(".blk");
  const fin = t.closest(".fin");
  const hit = t.closest(".wire-hit");

  if (e.button === 1 || (!trimEl && !outPort && !tab && !blk && !fin && !hit && !t.closest(".port"))) {
    const v0 = { ...view };
    onMove = (ev) => {
      view.x = v0.x + ev.clientX - start.x;
      view.y = v0.y + ev.clientY - start.y;
      applyView();
    };
    onUp = () => {
      if (!moved && sel.type) (sel = { type: null }), (preview = null), render();
    };
    vp.classList.add("is-panning");
  } else if (trimEl) {
    const id = trimEl.closest(".blk").dataset.id;
    sel = { type: "block", id };
    onMove = (ev) => {
      project = M.trim(base, id, trimEl.dataset.trim, dW(ev).x / M.PX);
      render();
    };
  } else if (outPort) {
    const gid = outPort.dataset.group;
    const temp = $("#wire-temp");
    const g = M.groups(project).find((g) => g.id === gid);
    const a = { x: g.x + g.w, y: g.y + (g.soloAudio ? M.AUD_H : M.VIS_H) / 2 };
    onMove = (ev) => temp.setAttribute("d", curve(a, toWorld(ev.clientX, ev.clientY)));
    onUp = (ev) => {
      temp.setAttribute("d", "");
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const gs = M.groups(project);
      const idx = M.groupIndex(gs);
      const fEl = over?.closest("[data-final]");
      const gEl = over?.closest(".port--in[data-group], .gtab");
      const bEl = over?.closest(".blk");
      let to = fEl?.dataset.final;
      if (!to) {
        const tg = gEl ? gs.find((x) => x.id === gEl.dataset.group) : bEl ? idx.get(bEl.dataset.id) : null;
        if (tg && tg.id !== gid) to = tg.first.id;
      }
      if (!to) return;
      const from = g.last.id;
      const dup = M.links(project).some((l) => l.from.id === gid && (l.to === to || l.to.id === idx.get(to)?.id));
      if (dup) return;
      project = structuredClone(project);
      project.edges.push({ id: M.newId("e"), from, to });
    };
  } else if (tab) {
    const gid = tab.dataset.group;
    sel = { type: "group", id: gid };
    preview = { type: "group", id: gid };
    render();
    onMove = (ev) => {
      const d = dW(ev);
      project = M.moveGroup(base, gid, d.x, d.y);
      render();
    };
  } else if (blk) {
    const id = blk.dataset.id;
    const b0 = base.blocks.find((b) => b.id === id);
    sel = { type: "block", id };
    preview = { type: "block", id };
    render();
    onMove = (ev) => {
      const d = dW(ev);
      const s = ev.altKey ? { x: b0.x + d.x, y: b0.y + d.y, mode: null } : M.snap(base, id, b0.x + d.x, b0.y + d.y, 16 / view.z);
      project = M.dropBlock(base, id, s);
      $("#snapinfo").textContent = SNAP[s.mode] ?? "";
      blockEls.get(id)?.classList.add("is-drag");
      render();
    };
    onUp = () => {
      $("#snapinfo").textContent = "";
      blockEls.get(id)?.classList.remove("is-drag");
    };
  } else if (fin) {
    const id = fin.dataset.final;
    const f0 = base.finals.find((f) => f.id === id);
    if (sel.id !== id) versionIdx = 0;
    sel = { type: "final", id };
    preview = null;
    render();
    onMove = (ev) => {
      const d = dW(ev);
      project = structuredClone(base);
      Object.assign(project.finals.find((f) => f.id === id), { x: f0.x + d.x, y: f0.y + d.y });
      render();
    };
  } else if (hit) {
    sel = { type: "edge", id: hit.dataset.edge };
    render();
  }

  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
    moved = true;
    onMove?.(ev);
  };
  const up = (ev) => {
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
  if (e.target.closest("input, textarea")) return;
  const mod = e.ctrlKey || e.metaKey;
  if ((e.key === "Delete" || e.key === "Backspace") && sel.type) removeSelection();
  else if (mod && e.key.toLowerCase() === "z") step(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo);
  else if (mod && e.key.toLowerCase() === "y") step(redo, undo);
  else if (mod && e.key.toLowerCase() === "d") e.preventDefault(), duplicate();
  else if (e.key === " " && !e.repeat) e.preventDefault(), pv.play.click();
  else return;
});

applyView();
render();
requestAnimationFrame(fit);
window.canvasDebug = { get project() { return project; }, get view() { return view; } };
