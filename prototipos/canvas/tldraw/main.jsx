/**
 * Canvas de edição com o tldraw: os blocos são uma forma própria, as ligações
 * são as setas do tldraw (presas aos blocos) e o resto (zoom, seleção de
 * vários, desfazer, copiar e colar, alinhar) vem da biblioteca. O significado
 * (grupos, coberturas, versões) é o mesmo do comum/modelo.js.
 */
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Tldraw, ShapeUtil, HTMLContainer, Rectangle2d, T, createShapeId, getArrowBindings,
  DefaultToolbar, SelectToolbarItem, HandToolbarItem, ArrowToolbarItem, useEditor, useValue,
} from "tldraw";
import { getAssetUrls } from "@tldraw/assets/selfHosted";
import tlcss from "tldraw/tldraw.css";
import * as M from "../comum/modelo.js";
import { Player, clock } from "../comum/player.js";
import { thumb, probe } from "../comum/miniaturas.js";

document.head.append(Object.assign(document.createElement("style"), { textContent: tlcss }));
const fmt = (s) => `${s.toFixed(1).replace(".", ",")} s`;
const ICON = { video: "movie", image: "image", audio: "music_note" };

/* ---------- formas ---------- */

class BlocoUtil extends ShapeUtil {
  static type = "bloco";
  static props = {
    w: T.number, h: T.number, kind: T.string, name: T.string, src: T.string,
    dur: T.number, tin: T.number, tout: T.number, mute: T.boolean, vol: T.number,
  };
  getDefaultProps() {
    return { w: 120, h: M.VIS_H, kind: "video", name: "", src: "", dur: 3, tin: 0, tout: 3, mute: false, vol: 1 };
  }
  getGeometry(s) {
    return new Rectangle2d({ width: s.props.w, height: s.props.h, isFilled: true });
  }
  hideRotateHandle() { return true; }
  canEdit() { return false; }
  getIndicatorPath(s) {
    const p = new Path2D();
    p.roundRect(0, 0, s.props.w, s.props.h, s.props.kind === "audio" ? 8 : 12);
    return p;
  }
  // Puxar a ponta corta o arquivo (não estica a imagem); a altura não muda.
  onResize(shape, info) {
    const { initialShape: s0, handle, scaleX } = info;
    const p = s0.props;
    const w = Math.abs(s0.props.w * scaleX);
    const secs = w / M.PX;
    const left = handle.includes("left");
    const max = p.kind === "image" ? M.IMAGE_MAX : p.dur;
    let tin = p.tin;
    let tout = p.tout;
    if (p.kind === "image") tout = Math.min(Math.max(secs, M.MIN_LEN), max);
    else if (left) tin = Math.min(Math.max(p.tout - secs, 0), p.tout - M.MIN_LEN);
    else tout = Math.min(Math.max(p.tin + secs, p.tin + M.MIN_LEN), max);
    const nw = (tout - tin) * M.PX;
    return { x: left ? s0.x + p.w - nw : s0.x, y: s0.y, props: { w: nw, h: p.h, tin, tout } };
  }
  // Num grupo, o corte não abre buraco: o bloco fica onde estava e o que vem
  // depois acompanha (o tldraw sozinho deixaria o espaço).
  onResizeEnd(initial, current) {
    const editor = this.editor;
    const p = readProject(editor);
    const before = { ...p, blocks: p.blocks.map((o) => (o.id === current.id ? { ...o, x: initial.x, tin: initial.props.tin, tout: initial.props.tout } : o)) };
    const g = M.groups(before).find((g) => g.blocks.some((o) => o.id === current.id));
    const delta = current.props.w - initial.props.w;
    if (!g || g.blocks.length < 2 || !delta) return;
    const oldEnd = initial.x + initial.props.w;
    const follow = [...g.blocks, ...g.covers, ...g.audios].filter((o) => o.id !== current.id && o.x >= oldEnd - 1);
    queueMicrotask(() => editor.updateShapes(follow.map((o) => ({ id: o.id, type: "bloco", x: o.x + delta }))));
    return { id: current.id, type: "bloco", x: initial.x };
  }
  // Ao soltar, o mesmo encaixe do outro protótipo: junta, cobre ou soma o som.
  onTranslateEnd(initial, current) {
    const editor = this.editor;
    if (editor.getSelectedShapeIds().length !== 1 || editor.inputs?.altKey) return;
    const project = readProject(editor);
    const s = M.snap(project, current.id, current.x, current.y, 16 / editor.getZoomLevel());
    if (!s.mode) return;
    if (s.mode === "after") {
      const next = M.dropBlock(project, current.id, s);
      const moved = next.blocks.filter((b) => b.id !== current.id && b.x !== project.blocks.find((o) => o.id === b.id).x);
      if (moved.length) queueMicrotask(() => editor.updateShapes(moved.map((b) => ({ id: b.id, type: "bloco", x: b.x }))));
    }
    return { id: current.id, type: "bloco", x: s.x, y: s.y };
  }
  component(shape) {
    return <Bloco shape={shape} />;
  }
}

function Bloco({ shape }) {
  const { kind, name, tin, tout, dur, mute, src } = shape.props;
  const [bg, setBg] = useState("");
  useEffect(() => void thumb({ kind, src, dur }).then(setBg), [src]);
  const media = { backgroundImage: bg ? `url("${bg}")` : "none" };
  if (kind === "audio") Object.assign(media, { backgroundSize: `${dur * M.PX}px 100%`, backgroundPosition: `${-tin * M.PX}px 0` });
  return (
    <HTMLContainer className={`blk blk--${kind} ${mute ? "is-mute" : ""}`}>
      <div className="blk__media" style={media} />
      <div className="blk__label">
        <span className="ms blk__kind">{ICON[kind]}</span>
        <span className="blk__name">{name}</span>
        <span className="blk__dur">{fmt(tout - tin)}</span>
        {mute && <span className="ms">volume_off</span>}
      </div>
    </HTMLContainer>
  );
}

class FinalUtil extends ShapeUtil {
  static type = "final";
  static props = { w: T.number, h: T.number };
  getDefaultProps() { return { w: 180, h: 80 }; }
  getGeometry(s) { return new Rectangle2d({ width: s.props.w, height: s.props.h, isFilled: true }); }
  canResize() { return false; }
  hideRotateHandle() { return true; }
  getIndicatorPath(s) {
    const p = new Path2D();
    p.roundRect(0, 0, s.props.w, s.props.h, 16);
    return p;
  }
  component(shape) { return <Final id={shape.id} />; }
}

function Final({ id }) {
  const editor = useEditor();
  const n = useValue("versoes", () => M.versions(readProject(editor), id).length, [editor, id]);
  return (
    <HTMLContainer className="fin">
      <span className="ms">flag</span><b>Final</b><span>{n} {n === 1 ? "versão" : "versões"}</span>
    </HTMLContainer>
  );
}

/* ---------- do tldraw para o modelo ---------- */

function readProject(editor) {
  const blocks = [];
  const finals = [];
  const edges = [];
  for (const s of editor.getCurrentPageShapes()) {
    const b = editor.getShapePageBounds(s);
    if (s.type === "bloco") blocks.push({ id: s.id, ...s.props, x: b.x, y: b.y });
    else if (s.type === "final") finals.push({ id: s.id, x: b.x, y: b.y });
    else if (s.type === "arrow") {
      const { start, end } = getArrowBindings(editor, s);
      if (start && end) edges.push({ id: s.id, from: start.toId, to: end.toId });
    }
  }
  return { blocks, finals, edges };
}

function loadSample(editor) {
  const p = M.sample((f) => `midia/${f}`);
  const id = (k) => createShapeId(k);
  editor.run(() => {
    editor.createShapes(p.blocks.map((b) => ({
      id: id(b.id), type: "bloco", x: b.x, y: b.y,
      props: { w: M.width(b), h: M.height(b), kind: b.kind, name: b.name, src: b.src, dur: b.dur, tin: b.tin, tout: b.tout, mute: b.mute, vol: b.vol },
    })));
    editor.createShapes(p.finals.map((f) => ({ id: id(f.id), type: "final", x: f.x, y: f.y })));
    for (const e of p.edges) {
      const aid = id(e.id);
      editor.createShape({ id: aid, type: "arrow", props: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } } });
      editor.createBindings([
        { type: "arrow", fromId: aid, toId: id(e.from), props: { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 }, isExact: false, isPrecise: true } },
        { type: "arrow", fromId: aid, toId: id(e.to), props: { terminal: "end", normalizedAnchor: { x: 0, y: 0.5 }, isExact: false, isPrecise: true } },
      ]);
    }
  });
  editor.zoomToFit();
}

/* ---------- tela ---------- */

function Toolbar() {
  return (
    <DefaultToolbar>
      <SelectToolbarItem />
      <HandToolbarItem />
      <ArrowToolbarItem />
    </DefaultToolbar>
  );
}

// Fora do App: o tldraw recria o editor se estes objetos mudarem a cada render.
const SHAPES = [BlocoUtil, FinalUtil];
const ASSETS = getAssetUrls({ baseUrl: "./tl" });
const COMPONENTS = { Toolbar, StylePanel: null, PageMenu: null, MainMenu: null, DebugPanel: null, DebugMenu: null, HelpMenu: null, SharePanel: null };

function App() {
  const [editor, setEditor] = useState(null);
  const [project, setProject] = useState({ blocks: [], finals: [], edges: [] });
  const [selected, setSelected] = useState([]);
  const [vIdx, setVIdx] = useState(0);
  const [playToken, setPlayToken] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setProject(readProject(editor));
        setSelected(editor.getSelectedShapeIds());
      });
    };
    update();
    return editor.store.listen(update);
  }, [editor]);

  const gs = useMemo(() => M.groups(project), [project]);
  const sel = selected.length === 1 ? editor?.getShape(selected[0]) : null;
  const finalId = sel?.type === "final" ? sel.id : project.finals[0]?.id;
  const vs = useMemo(() => (finalId ? M.versions(project, finalId, gs) : []), [project, finalId, gs]);
  const version = vs[Math.min(vIdx, vs.length - 1)];

  const mount = (ed) => {
    ed.user.updateUserPreferences({ locale: "pt-br", isSnapMode: true });
    ed.registerExternalContentHandler("files", async ({ files, point }) => {
      const at = point ?? ed.getViewportPageBounds().center;
      let y = at.y;
      for (const file of files) {
        try {
          const { src, kind, dur } = await probe(file);
          const tout = kind === "image" ? 3 : dur;
          ed.createShape({ type: "bloco", x: at.x, y, props: { w: tout * M.PX, h: kind === "audio" ? M.AUD_H : M.VIS_H, kind, name: file.name.replace(/\.[^.]+$/, ""), src, dur: kind === "image" ? M.IMAGE_MAX : dur, tin: 0, tout, mute: false, vol: 1 } });
          y += M.VIS_H + 48;
        } catch {}
      }
    });
    loadSample(ed);
    ed.select(createShapeId("final"));
    setEditor(ed);
  };

  const setProp = (patch) => editor.updateShapes([{ id: sel.id, type: "bloco", props: patch }]);

  return (
    <div className="app">
      <header className="bar">
        <div className="brand"><span className="ms">video_library</span>Canvas de edição <small>com tldraw</small></div>
        <button className="btn btn--tonal" onClick={() => fileRef.current.click()}><span className="ms">upload</span>Importar</button>
        <input ref={fileRef} type="file" accept="video/*,image/*,audio/*" multiple hidden onChange={(e) => {
          editor.putExternalContent({ type: "files", files: [...e.target.files], point: editor.getViewportPageBounds().center });
          e.target.value = "";
        }} />
        <button className="btn btn--text" onClick={() => {
          const c = editor.getViewportPageBounds().center;
          const id = createShapeId();
          editor.createShape({ id, type: "final", x: c.x, y: c.y });
          editor.select(id);
        }}><span className="ms">flag</span>Bloco final</button>
        <span className="grow" />
        <span className="hint">Seta (A) liga blocos · Shift + clique escolhe vários · Alt solta sem encaixar</span>
      </header>
      <div className="main">
        <div className="stage">
          <Tldraw
            shapeUtils={SHAPES}
            assetUrls={ASSETS}
            components={COMPONENTS}
            onMount={mount}
          />
        </div>
        <aside className="sheet">
          <Preview version={version} playToken={playToken} title={version ? `Versão ${vs.indexOf(version) + 1}: ${M.versionName(version)}` : "Nada para tocar"} />
          <div className="divider" />
          {sel?.type === "bloco" ? (
            <BlockPanel shape={sel} setProp={setProp} onDelete={() => editor.deleteShapes([sel.id])} />
          ) : (
            <>
              <h2>Final</h2>
              <p className="hint">{vs.length ? `${vs.length} ${vs.length === 1 ? "versão sai" : "versões saem"} das setas que chegam aqui.` : "Ligue um grupo ao Final com a seta."}</p>
              <div className="list">
                {vs.map((v, i) => (
                  <button key={i} className={`item ${v === version ? "is-on" : ""}`} onClick={() => (setVIdx(i), setPlayToken((n) => n + 1))}>
                    <span className="item__n">{i + 1}</span><span className="item__t">{M.versionName(v)}</span><span className="item__d">{fmt(M.timeline(v).duration)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function BlockPanel({ shape, setProp, onDelete }) {
  const p = shape.props;
  return (
    <>
      <h2>{{ video: "Vídeo", image: "Imagem", audio: "Áudio" }[p.kind]}</h2>
      <label className="field"><span>Nome</span><input value={p.name} onChange={(e) => setProp({ name: e.target.value })} /></label>
      <p className="hint">{p.kind === "image" ? `Dura ${fmt(p.tout)}.` : `Do ${fmt(p.tin)} ao ${fmt(p.tout)} de um arquivo de ${fmt(p.dur)}.`} Puxe as pontas para cortar.</p>
      {p.kind !== "image" && (
        <>
          <label className="switch"><input type="checkbox" checked={p.mute} onChange={(e) => setProp({ mute: e.target.checked })} /><span>Sem som</span></label>
          <label className="field"><span>Volume: {Math.round(p.vol * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={p.vol} disabled={p.mute} onChange={(e) => setProp({ vol: +e.target.value })} /></label>
        </>
      )}
      <div className="row"><button className="btn btn--text" onClick={onDelete}><span className="ms">delete</span>Excluir</button></div>
    </>
  );
}

function Preview({ version, title, playToken }) {
  const canvas = useRef(null);
  const player = useRef(null);
  const [state, setState] = useState({ t: 0, d: 0, playing: false });
  const key = version ? JSON.stringify(M.exportPlan(version)) : "";
  useEffect(() => {
    player.current = new Player(canvas.current, {
      onTick: (t, d) => setState((s) => ({ ...s, t, d })),
      onEnd: () => setState((s) => ({ ...s, playing: false })),
    });
  }, []);
  useEffect(() => {
    player.current.load(version ? M.timeline(version) : { duration: 0, items: [] });
    setState((s) => ({ ...s, playing: false }));
  }, [key]);
  useEffect(() => {
    if (!playToken) return;
    player.current.play();
    setState((s) => ({ ...s, playing: true }));
  }, [playToken]);
  const toggle = () => {
    const p = player.current;
    p.playing ? p.pause() : p.play();
    setState((s) => ({ ...s, playing: p.playing }));
  };
  return (
    <div className="pv">
      <div className="pv__screen"><canvas ref={canvas} width="360" height="640" /></div>
      <div className="pv__title">{title}</div>
      <div className="pv__bar">
        <button className="btn btn--icon" onClick={toggle} aria-label="Tocar"><span className="ms">{state.playing ? "pause" : "play_arrow"}</span></button>
        <input type="range" min="0" max={state.d || 1} step="0.01" value={state.t} onChange={(e) => player.current.seek(+e.target.value)} aria-label="Andamento" />
        <span className="pv__time">{clock(state.t)} / {clock(state.d)}</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
