// Player do vídeo: lê projects/<nome>/storyboard.json e desenha qualquer instante t (segundos).
// Tudo é função pura de t — o render (tools/render.mjs) chama window.renderAt(t) quadro a quadro.
// Referência completa do formato: docs/storyboard.md
//
// URL: /engine/player.html?projeto=projects/exemplo            (visualizar no navegador, com controles)
//      /engine/player.html?projeto=projects/exemplo&render=1   (usado pelo render, sem controles)

import * as THREE from 'three';
import {
  makePreset, makeScenery, animate, moveSpeed, setProgress, updateScenery, rollWheels, sceneryBox,
  setupEnvironment, setEnvironmentTime,
} from '../assets/index.js';
import { criarLegendas } from './legendas.js';
import { criarFluxo } from './fluxos.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => x * x * (3 - 2 * x);
const dif = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // menor diferença angular

const q = new URLSearchParams(location.search);
const projeto = q.get('projeto');
const modoRender = q.get('render') === '1';

function erro(msg) {
  window.__erro = msg;
  console.error(msg);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;background:#7a1f1f;color:#fff;padding:10px;font:14px system-ui;z-index:99;white-space:pre-wrap';
  d.textContent = `Erro: ${msg}`;
  document.body.appendChild(d);
}
addEventListener('error', (e) => erro(e.message));
addEventListener('unhandledrejection', (e) => erro(String(e.reason?.message || e.reason)));

async function pegarJSON(url, opcional = false) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) {
    if (opcional) return null;
    throw new Error(`Não consegui abrir ${url} (${r.status}). Confira o caminho do projeto.`);
  }
  return r.json();
}

if (!projeto) throw new Error('Faltou ?projeto=projects/<nome> na URL.');
const sb = await pegarJSON(`/${projeto}/storyboard.json`);
const palavras = sb.palavras ? (await pegarJSON(`/${projeto}/${sb.palavras}`, true)) || [] : [];

// ---------- palco ----------
const W = Number(q.get('w')) || sb.formato?.largura || 1080;
const H = Number(q.get('h')) || sb.formato?.altura || 1920;
const FPS = sb.formato?.fps || 30;
const DUR = sb.duracao;
const palco = document.getElementById('palco');
palco.style.width = `${W}px`;
palco.style.height = `${H}px`;
palco.style.setProperty('--u', `${H / 1920}px`);
if (!modoRender) {
  const ajustar = () => {
    const s = Math.min(innerWidth / W, (innerHeight - 40) / H);
    palco.style.transform = `scale(${s})`;
    palco.style.marginLeft = `${(innerWidth - W * s) / 2}px`;
  };
  ajustar();
  addEventListener('resize', ajustar);
}

// qualidade: "alta" (padrão: sombreamento suave, oclusão de luz, brilho e correção de cor) ou "basica" (rápida)
const qualidade = q.get('qualidade') || sb.qualidade || 'alta';
const canvas = document.getElementById('tela');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: qualidade === 'basica', preserveDrawingBuffer: true });
} catch (e) {
  throw new Error(`Não foi possível iniciar o WebGL (${e.message}). Ative a aceleração de hardware do navegador.`);
}
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.5, 900);
const env = setupEnvironment(scene, { time: sb.ambiente?.horario || 'dia', area: 30, fogFar: 420 });
scene.add(env.sun.target);
env.sun.shadow.bias = -0.0004;
env.sun.shadow.normalBias = 0.04;

// luz ambiente por imagem: preenchimento suave e reflexos discretos nos materiais
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

// céu em degradê (cores por horário/clima)
const CEUS = {
  dia: ['#2f86e0', '#bfe3fb'], tarde: ['#4a68b0', '#f6bf94'], nublado: ['#7f90a6', '#d0d9e1'], chuva: ['#4c5e78', '#9fadbd'],
};
const domo = new THREE.Mesh(
  new THREE.SphereGeometry(600, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { topo: { value: new THREE.Color() }, horizonte: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 topo; uniform vec3 horizonte; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizonte, topo, pow(h, 0.5)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  }),
);
domo.renderOrder = -10;
domo.frustumCulled = false;
scene.add(domo);

// chão com variação de cor (textura procedural), para não parecer um plano liso
const CHAO = { grama: '#86c15f', terra: '#8a5f3a', areia: '#e6d3a1', concreto: '#bdbdb7', asfalto: '#3b3d42', madeira: '#b98a56', piso: '#d8d2c4' };
function texturaChao() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ececec';
  g.fillRect(0, 0, 512, 512);
  let s = 11;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 380; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const rad = 16 + r() * 54;
    const v = Math.floor(196 + r() * 60);
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.6)`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 90);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const chaoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: CHAO.grama, roughness: 1, map: texturaChao() }));
chaoMesh.rotation.x = -Math.PI / 2;
chaoMesh.position.y = -0.04;
chaoMesh.receiveShadow = true;
scene.add(chaoMesh);

// aleatório com semente (mesma decoração em todo render)
function semente(n) { let s = n; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// tufos de grama e flores espalhados (só em chão de grama e sem ruas na cena)
const decoracao = new THREE.Group();
{
  const rnd = semente(5);
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const esc = new THREE.Vector3();
  const cor = new THREE.Color();
  const tufo = new THREE.ConeGeometry(0.09, 0.34, 4);
  tufo.translate(0, 0.17, 0);
  const N = 2600;
  const grama = new THREE.InstancedMesh(tufo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), N);
  const verdes = ['#68a944', '#78b84e', '#5b9a3d', '#8ac95a'];
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = 4 + Math.sqrt(rnd()) * 75;
    pos.set(Math.cos(a) * rr, -0.02, Math.sin(a) * rr);
    euler.set((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4);
    quat.setFromEuler(euler);
    const k = 0.7 + rnd() * 1.1;
    esc.set(k, k * (0.8 + rnd() * 0.6), k);
    m.compose(pos, quat, esc);
    grama.setMatrixAt(i, m);
    grama.setColorAt(i, cor.set(verdes[i % 4]));
  }
  decoracao.add(grama);
  const NF = 300;
  const flores = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true }), NF);
  const corFlor = ['#ffffff', '#ffd54a', '#f48fb1', '#ff8a65', '#b39ddb'];
  for (let i = 0; i < NF; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = 5 + Math.sqrt(rnd()) * 70;
    pos.set(Math.cos(a) * rr, 0.3 + rnd() * 0.08, Math.sin(a) * rr);
    m.compose(pos, quat.identity(), esc.set(1, 1, 1));
    flores.setMatrixAt(i, m);
    flores.setColorAt(i, cor.set(corFlor[i % 5]));
  }
  decoracao.add(flores);
  decoracao.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  scene.add(decoracao);
}

// colinas verdes com pinheiros ao fundo (dá profundidade, como nos vídeos de referência)
const colinas = new THREE.Group();
{
  const rnd = semente(33);
  // sem neblina (fog:false) e já com um tom de distância, para as colinas ficarem vivas e não esmaecidas
  const verdes = ['#74bd62', '#69b258', '#5fa955', '#7ec46a'];
  const geo = new THREE.SphereGeometry(1, 14, 8);
  const pinheiro = new THREE.ConeGeometry(1, 3, 5);
  pinheiro.translate(0, 1.5, 0);
  const pinheiros = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.5;
    const r = 230 + rnd() * 110;
    const [rx, ry, rz] = [70 + rnd() * 70, 26 + rnd() * 26, 60 + rnd() * 60];
    const h = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: verdes[i % 4], roughness: 1, flatShading: true, fog: false }));
    h.scale.set(rx, ry, rz);
    h.position.set(Math.cos(a) * r, -ry * 0.18, Math.sin(a) * r);
    h.rotation.y = rnd() * 6;
    colinas.add(h);
    for (let k = 0; k < 16; k++) {
      const u = (rnd() - 0.5) * 1.5;
      const v = (rnd() - 0.5) * 1.5;
      const q2 = u * u + v * v;
      if (q2 > 0.7) continue;
      const y = ry * Math.sqrt(1 - q2) - ry * 0.18;
      const e = 7 + rnd() * 5;
      pinheiros.push({ x: h.position.x + u * rx, y: y - 1, z: h.position.z + v * rz, e });
    }
  }
  const mp = new THREE.InstancedMesh(pinheiro, new THREE.MeshStandardMaterial({ color: '#3a8c55', roughness: 1, flatShading: true, fog: false }), pinheiros.length);
  const m = new THREE.Matrix4();
  pinheiros.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(p.e * 0.38, p.e * 0.45, p.e * 0.38));
    mp.setMatrixAt(i, m);
  });
  colinas.add(mp);
  colinas.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  scene.add(colinas);
}

// ---------- cenários de fundo (sempre existe um: nunca cor sólida) ----------
// campo (colinas), cidade, floresta, deserto, litoral, industrial, interior
const FUNDOS = { campo: colinas };
{
  const rnd = semente(77);
  const grupo = (nome) => { const g = new THREE.Group(); g.name = `fundo:${nome}`; g.visible = false; g.traverse?.(() => {}); scene.add(g); FUNDOS[nome] = g; return g; };
  const std = (cor, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 1, flatShading: true, fog: false, ...extra });

  // textura de janelas para os prédios (canvas)
  const cj = document.createElement('canvas');
  cj.width = cj.height = 128;
  {
    const g = cj.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y * 3) % 5 === 0 ? '#ffe9a8' : '#9fc6e0';
      g.fillRect(x * 32 + 7, y * 32 + 7, 18, 20);
    }
  }
  const texJanelas = new THREE.CanvasTexture(cj);
  texJanelas.wrapS = texJanelas.wrapT = THREE.RepeatWrapping;
  texJanelas.colorSpace = THREE.SRGBColorSpace;

  // cidade: anel de prédios coloridos com janelas
  {
    const g = grupo('cidade');
    const cores = ['#e8d9bd', '#cfd8e3', '#f0c9b0', '#c9dfc4', '#d9c6e0', '#f2e2a6', '#b9c9d6', '#e6b8b0'];
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + rnd() * 0.08;
      const r = 120 + rnd() * 140;
      const w = 14 + rnd() * 22;
      const d = 14 + rnd() * 22;
      const alto = rnd() < 0.18;
      const hh = alto ? 70 + rnd() * 90 : 18 + rnd() * 40;
      const geo = new THREE.BoxGeometry(w, hh, d);
      const uv = geo.attributes.uv;
      for (let v = 0; v < uv.count; v++) {
        const face = Math.floor(v / 4);
        const lado = face < 2 ? d : w; // +x/-x usam a profundidade; +z/-z a largura
        if (face >= 4) { uv.setXY(v, 0, 0); continue; }
        uv.setXY(v, (uv.getX(v) * lado) / 12, (uv.getY(v) * hh) / 12);
      }
      const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cores[i % cores.length], map: texJanelas, roughness: 1, flatShading: true, fog: false }));
      b.position.set(Math.cos(a) * r, hh / 2 - 1, Math.sin(a) * r);
      b.rotation.y = rnd() * 3;
      g.add(b);
      if (rnd() < 0.5) { const topo = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 3, d * 0.4), std('#8b94a0')); topo.position.set(b.position.x, hh + 0.5, b.position.z); topo.rotation.y = b.rotation.y; g.add(topo); }
    }
    // morros ao longe, para a cidade não ficar "cortada" no horizonte
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), std('#8fb59a'));
      m.scale.set(120, 30, 90);
      m.position.set(Math.cos(a) * 380, -6, Math.sin(a) * 380);
      g.add(m);
    }
  }

  // floresta: anel denso de árvores
  {
    const g = grupo('floresta');
    const cone = new THREE.ConeGeometry(1, 3, 6);
    cone.translate(0, 1.5, 0);
    const bola = new THREE.IcosahedronGeometry(1, 1);
    const N = 360;
    const pinos = new THREE.InstancedMesh(cone, std('#2f7d46'), N);
    const copas = new THREE.InstancedMesh(bola, std('#5aa84a'), N);
    const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 5), std('#7a5230'), N);
    const m = new THREE.Matrix4();
    const cor = new THREE.Color();
    const verdes = ['#4f9d4a', '#5aa84a', '#3f8f46', '#6ab255'];
    const pinhos = ['#2f7d46', '#2a6f3f', '#3a8c55'];
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 55 + Math.sqrt(rnd()) * 230;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const e = 7 + rnd() * 9;
      const eh = e * (0.9 + rnd() * 0.5);
      if (i % 2) {
        m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(e * 0.42, eh, e * 0.42));
        pinos.setMatrixAt(i, m);
        pinos.setColorAt(i, cor.set(pinhos[i % 3]));
        m.makeScale(0, 0, 0); copas.setMatrixAt(i, m); troncos.setMatrixAt(i, m);
      } else {
        m.compose(new THREE.Vector3(x, e * 0.55 + e * 0.35, z), new THREE.Quaternion(), new THREE.Vector3(e * 0.55, e * 0.5, e * 0.55));
        copas.setMatrixAt(i, m);
        copas.setColorAt(i, cor.set(verdes[i % 4]));
        m.compose(new THREE.Vector3(x, e * 0.275, z), new THREE.Quaternion(), new THREE.Vector3(e * 0.4, e * 0.55, e * 0.4));
        troncos.setMatrixAt(i, m);
        m.makeScale(0, 0, 0); pinos.setMatrixAt(i, m);
      }
    }
    g.add(pinos, copas, troncos);
    for (let i = 0; i < 4; i++) { // colinas verdes atrás das árvores
      const a = (i / 4) * Math.PI * 2 + 0.8;
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), std('#6fb64a'));
      h.scale.set(130, 40, 100);
      h.position.set(Math.cos(a) * 330, -8, Math.sin(a) * 330);
      g.add(h);
    }
  }

  // deserto: dunas e cactos
  {
    const g = grupo('deserto');
    const areias = ['#e8c77a', '#dcb866', '#f0d28e'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd() * 0.3;
      const d = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 7), std(areias[i % 3]));
      d.scale.set(90 + rnd() * 90, 18 + rnd() * 26, 70 + rnd() * 60);
      d.position.set(Math.cos(a) * (130 + rnd() * 160), -d.scale.y * 0.3, Math.sin(a) * (130 + rnd() * 160));
      d.rotation.y = rnd() * 3;
      g.add(d);
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 40 + rnd() * 120;
      const c = new THREE.Group();
      const hh = 3 + rnd() * 4;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, hh, 7), std('#4f9a55'));
      t.position.y = hh / 2;
      const braco = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 6), std('#4f9a55'));
      braco.position.set(0.9, hh * 0.6, 0);
      braco.rotation.z = 0.5;
      c.add(t, braco);
      c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.add(c);
    }
  }

  // litoral: mar até o horizonte e palmeiras
  {
    const g = grupo('litoral');
    const mar = new THREE.Mesh(new THREE.RingGeometry(75, 700, 48, 1), new THREE.MeshStandardMaterial({ color: '#3fa5e0', roughness: 0.25, metalness: 0.1, fog: false }));
    mar.rotation.x = -Math.PI / 2;
    mar.position.y = -0.02;
    g.add(mar);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + rnd() * 0.2;
      const r = 50 + rnd() * 18;
      const p = new THREE.Group();
      const hh = 7 + rnd() * 3;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, hh, 6), std('#a07a52'));
      t.position.y = hh / 2;
      p.add(t);
      for (let k = 0; k < 6; k++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 3.4), std('#4faa52'));
        f.position.set(Math.sin(k) * 1.4, hh + 0.2, Math.cos(k) * 1.4);
        f.rotation.set(0.5, k, 0);
        p.add(f);
      }
      p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.add(p);
    }
    const ilha = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), std('#6fb64a'));
    ilha.scale.set(60, 22, 40);
    ilha.position.set(-260, -6, -300);
    g.add(ilha);
  }

  // industrial: galpões, chaminés e tanques ao redor
  {
    const g = grupo('industrial');
    const paredes = ['#b9c4cf', '#c9ced4', '#aab8c6', '#d6d0c2'];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.1;
      const r = 90 + rnd() * 150;
      const w = 24 + rnd() * 30;
      const d = 18 + rnd() * 24;
      const hh = 8 + rnd() * 10;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), std(paredes[i % 4]));
      b.position.set(Math.cos(a) * r, hh / 2 - 1, Math.sin(a) * r);
      b.rotation.y = rnd() * 3;
      g.add(b);
      const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 1.2, d * 0.98), std('#7b8794'));
      t.position.set(b.position.x, hh + 0.2, b.position.z);
      t.rotation.y = b.rotation.y;
      g.add(t);
      if (i % 3 === 0) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 40 + rnd() * 20, 8), std('#b0533a'));
        ch.position.set(b.position.x + 8, 24, b.position.z);
        g.add(ch);
      }
      if (i % 4 === 1) {
        const tq = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 16, 12), std('#d5dae0'));
        tq.position.set(b.position.x - 22, 7, b.position.z + 10);
        g.add(tq);
      }
    }
  }

  // interior: sala com paredes, janelas e rodapé (para temas dentro de casa/laboratório)
  {
    const g = grupo('interior');
    const L = 34;
    const hh = 16;
    const parede = std('#f1e6d0', { roughness: 0.9 });
    const lados = [[0, -L, 0, 2 * L, hh, 1], [0, L, 0, 2 * L, hh, 1], [-L, 0, 1.5708, 2 * L, hh, 1], [L, 0, 1.5708, 2 * L, hh, 1]];
    for (const [x, z, ry, w, h2] of lados) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h2, 1), parede);
      p.position.set(x, h2 / 2, z);
      p.rotation.y = ry;
      g.add(p);
      const rd = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 1.4), std('#cdbb9a'));
      rd.position.set(x, 0.6, z);
      rd.rotation.y = ry;
      g.add(rd);
      for (const dx of [-14, 12]) {
        const j = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 1.2), std('#9fd0f0', { emissive: '#7fb8e0', emissiveIntensity: 0.35 }));
        const off = new THREE.Vector3(dx, 9, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        j.position.set(x + off.x, off.y, z + off.z);
        j.rotation.y = ry;
        g.add(j);
      }
    }
    const teto = new THREE.Mesh(new THREE.BoxGeometry(2 * L, 1, 2 * L), std('#faf3e6'));
    teto.position.y = hh + 0.5;
    g.add(teto);
    const lamp = new THREE.PointLight('#fff1d0', 2.2, 120, 1.2);
    lamp.position.set(0, hh - 2, 0);
    g.add(lamp);
  }
}
const CHAO_PADRAO = { campo: 'grama', floresta: 'grama', cidade: 'concreto', deserto: 'areia', litoral: 'areia', industrial: 'concreto', interior: 'madeira' };

// nuvens fofas em volta (fundo)
const nuvens = new THREE.Group();
{
  const rnd = semente(9);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.32, flatShading: true, fog: false });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rnd() * 0.3;
    const r = 170 + rnd() * 110;
    const c = new THREE.Group();
    const partes = 5 + Math.floor(rnd() * 3);
    for (let k = 0; k < partes; k++) {
      const b = new THREE.Mesh(geo, mat);
      const raio = 7 + rnd() * 9;
      b.scale.set(raio, raio * (0.6 + rnd() * 0.25), raio * 0.8);
      b.position.set((k - partes / 2) * 9 + rnd() * 4, rnd() * 5, rnd() * 6 - 3);
      c.add(b);
    }
    c.position.set(Math.cos(a) * r, 48 + rnd() * 40, Math.sin(a) * r);
    c.rotation.y = -a + Math.PI / 2;
    nuvens.add(c);
  }
  nuvens.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  scene.add(nuvens);
}

// chuva (clima: "chuva")
const chuva = (() => {
  const N = 900;
  const rnd = semente(21);
  const base = Array.from({ length: N }, () => ({ x: (rnd() - 0.5) * 36, z: rnd() * 34 - 2, y0: rnd() * 26, v: 16 + rnd() * 8 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  const linhas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#e3edf7', transparent: true, opacity: 0.5, fog: false }));
  linhas.frustumCulled = false;
  linhas.visible = false;
  scene.add(linhas);
  return { linhas, base, N };
})();

// ---------- pós-processamento ----------
const GRADE = {
  uniforms: { tDiffuse: { value: null }, contraste: { value: 1.08 }, saturacao: { value: 1.2 }, vinheta: { value: 0.18 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contraste; uniform float saturacao; uniform float vinheta; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb; float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturacao); col = (col - 0.5) * contraste + 0.5;
      float d = distance(vUv, vec2(0.5)); col *= 1.0 - vinheta * smoothstep(0.38, 0.9, d);
      gl_FragColor = vec4(col, c.a); }`,
};
let composer = null;
if (qualidade !== 'basica') {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, W, H);
  gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.1, 0.5, 0.92));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GRADE));
}

// ---------- elementos opcionais: setas, ícones e etiquetas (desenho cartoon com contorno preto) ----------
const PRETO = '#111';
const fonteSvg = 'font-family="Arial Black, Segoe UI Black, Impact, sans-serif"';
const risco = (d, cor, esp = 18) => `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke="${PRETO}" stroke-width="${esp + 14}"/><path d="${d}" stroke="${cor}" stroke-width="${esp}"/></g>`;
const forma = (svg, cor) => svg.replace('COR', cor);
const ICONES = {
  x: (c) => risco('M24 24 L76 76 M76 24 L24 76', c || '#e53935', 20),
  v: (c) => risco('M20 54 L42 76 L82 26', c || '#2fb344', 20),
  alerta: (c) => forma(`<path d="M50 8 L94 88 L6 88 Z" fill="COR" stroke="${PRETO}" stroke-width="7" stroke-linejoin="round"/><rect x="45" y="34" width="10" height="30" rx="5" fill="${PRETO}"/><circle cx="50" cy="75" r="6" fill="${PRETO}"/>`, c || '#ffd60a'),
  interrogacao: (c) => forma(`<circle cx="50" cy="50" r="42" fill="COR" stroke="${PRETO}" stroke-width="7"/><text x="50" y="70" font-size="62" font-weight="900" text-anchor="middle" fill="#fff" stroke="${PRETO}" stroke-width="4" paint-order="stroke" ${fonteSvg}>?</text>`, c || '#ff9800'),
  exclamacao: (c) => forma(`<circle cx="50" cy="50" r="42" fill="COR" stroke="${PRETO}" stroke-width="7"/><text x="50" y="70" font-size="62" font-weight="900" text-anchor="middle" fill="#fff" stroke="${PRETO}" stroke-width="4" paint-order="stroke" ${fonteSvg}>!</text>`, c || '#e53935'),
  coracao: (c) => forma(`<path d="M50 86 C10 58 6 30 26 20 C38 14 48 22 50 30 C52 22 62 14 74 20 C94 30 90 58 50 86 Z" fill="COR" stroke="${PRETO}" stroke-width="7" stroke-linejoin="round"/>`, c || '#ec407a'),
  estrela: (c) => forma(`<polygon points="50,6 62,36 94,38 69,58 78,90 50,72 22,90 31,58 6,38 38,36" fill="COR" stroke="${PRETO}" stroke-width="7" stroke-linejoin="round"/>`, c || '#ffd60a'),
  lampada: (c) => forma(`<path d="M50 8 C28 8 18 24 18 40 C18 54 30 60 34 72 L66 72 C70 60 82 54 82 40 C82 24 72 8 50 8 Z" fill="COR" stroke="${PRETO}" stroke-width="7" stroke-linejoin="round"/><rect x="36" y="76" width="28" height="8" rx="3" fill="#9aa0a6" stroke="${PRETO}" stroke-width="5"/><rect x="40" y="86" width="20" height="7" rx="3" fill="#9aa0a6" stroke="${PRETO}" stroke-width="5"/>`, c || '#ffe066'),
  relogio: (c) => forma(`<circle cx="50" cy="50" r="42" fill="COR" stroke="${PRETO}" stroke-width="7"/><path d="M50 24 L50 52 L68 62" fill="none" stroke="${PRETO}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`, c || '#ffffff'),
  dinheiro: (c) => forma(`<circle cx="50" cy="50" r="42" fill="COR" stroke="${PRETO}" stroke-width="7"/><text x="50" y="68" font-size="56" font-weight="900" text-anchor="middle" fill="#fff" stroke="${PRETO}" stroke-width="4" paint-order="stroke" ${fonteSvg}>$</text>`, c || '#2fb344'),
  fogo: (c) => forma(`<path d="M50 6 C54 24 78 34 78 62 C78 80 66 92 50 92 C34 92 22 80 22 62 C22 48 30 42 34 32 C40 40 42 44 46 44 C46 30 44 18 50 6 Z" fill="COR" stroke="${PRETO}" stroke-width="7" stroke-linejoin="round"/><path d="M50 56 C58 64 62 70 58 78 C56 82 44 82 42 76 C40 68 46 64 50 56 Z" fill="#ffd60a"/>`, c || '#ff6d00'),
  proibido: (c) => forma(`<circle cx="50" cy="50" r="38" fill="none" stroke="${PRETO}" stroke-width="22"/><circle cx="50" cy="50" r="38" fill="none" stroke="COR" stroke-width="12"/><path d="M24 76 L76 24" stroke="${PRETO}" stroke-width="22" stroke-linecap="round"/><path d="M24 76 L76 24" stroke="COR" stroke-width="12" stroke-linecap="round"/>`, c || '#e53935'),
  raio: (c) => forma(`<polygon points="58,4 22,56 46,56 38,96 80,40 54,40" fill="COR" stroke="${PRETO}" stroke-width="7" stroke-linejoin="round"/>`, c || '#ffd60a'),
};
// setas: desenhadas apontando para a direita; as outras direções giram
const SETA_SIMPLES = (c) => `<polygon points="4,36 56,36 56,12 96,50 56,88 56,64 4,64" fill="${c}" stroke="${PRETO}" stroke-width="7" stroke-linejoin="round"/>`;
// seta dupla = duas setas separadas, uma para cada lado (como nos vídeos de referência); viewBox 200×100
const SETA_DUPLA = (c) => `<g transform="translate(108 0) scale(0.9 1)">${SETA_SIMPLES(c)}</g><g transform="translate(92 100) rotate(180) scale(0.9 1)">${SETA_SIMPLES(c)}</g>`;
const SETA_ROT = { direita: 0, baixo: 90, esquerda: 180, cima: 270, horizontal: 0, vertical: 90 };

function criarElemento(e) {
  const el = document.createElement('div');
  el.className = `elemento ${e.tipo}`;
  let rot = 0;
  let dirSeta = [0, 0];
  let dupla = false;
  if (e.tipo === 'seta') {
    const dir = e.direcao || 'direita';
    const duplo = dir === 'horizontal' || dir === 'vertical';
    dupla = duplo;
    const cor = e.cor || '#2f80ed';
    el.innerHTML = duplo
      ? `<svg viewBox="0 0 200 100">${SETA_DUPLA(cor)}</svg>`
      : `<svg viewBox="0 0 100 100">${SETA_SIMPLES(cor)}</svg>`;
    rot = SETA_ROT[dir] ?? 0;
    const r = (rot * Math.PI) / 180;
    dirSeta = [Math.cos(r), Math.sin(r)];
  } else if (e.tipo === 'icone') {
    const f = ICONES[e.icone];
    el.innerHTML = `<svg viewBox="0 0 100 100">${f ? f(e.cor) : ''}</svg>`;
  } else if (e.tipo === 'etiqueta') {
    el.innerHTML = `<span class="ponto" style="background:${e.ponto || '#ffd60a'}"></span><span>${e.texto}</span>`;
  }
  el.style.display = 'none';
  document.getElementById('elementos').appendChild(el);
  return { el, e, rot: rot + (e.rotacao || 0), dirSeta, dupla };
}

// ---------- construção das cenas ----------
const norm3 = (p, y = 0) => (p.length === 2 ? [p[0], y, p[1]] : [p[0], p[1], p[2]]);
const textosEl = document.getElementById('textos');
const fx = document.getElementById('fx');

function construirCena(def) {
  const grp = new THREE.Group();
  grp.visible = false;
  scene.add(grp);
  const ents = {};
  const cena = { def, grp, ents, textos: [] };

  const novaEnt = (id, tipo, holder, d, tamanho, extra = {}) => {
    if (!id) throw new Error(`Toda entidade precisa de "id" (cena ${def.inicio}s).`);
    if (ents[id]) throw new Error(`id repetido na cena de ${def.inicio}s: "${id}".`);
    const pos0 = norm3(d.pos || [0, 0], 0);
    const ent = {
      id, tipo, holder, def: d, pos0, yaw0: (d.giro || 0) * DEG, tamanho,
      movimentos: (d.movimentos || []).slice().sort((a, b) => a.de - b.de),
      eventosYaw: [], ...extra,
    };
    // eventos de giro: um por movimento (vira na direção do movimento) + os pedidos em "viraPara"
    let cx = pos0[0];
    let cz = pos0[2];
    for (const m of ent.movimentos) {
      const dx = m.para[0] - cx;
      const dz = m.para[1] - cz;
      if (Math.hypot(dx, dz) > 0.01) ent.eventosYaw.push({ t: m.de, yaw: Math.atan2(dx, dz), rapido: true });
      cx = m.para[0];
      cz = m.para[1];
    }
    for (const v of d.viraPara || []) ent.eventosYaw.push({ t: v.em, alvo: v.alvo });
    ent.eventosYaw.sort((a, b) => a.t - b.t);
    ents[id] = ent;
    return ent;
  };

  for (const o of def.objetos || []) {
    const obj = makeScenery(o.asset, { ...(o.variante ? { variant: o.variante } : {}), ...(o.params || {}) });
    // "opacidade" < 1 deixa o objeto transparente (para mostrar o que há por dentro: máquinas, tubos, cortes)
    if (o.opacidade !== undefined && o.opacidade < 1) {
      obj.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.transparent = true;
        m.material.opacity = o.opacidade;
        m.material.depthWrite = false;
        m.castShadow = false;
      });
    }
    const holder = new THREE.Group();
    holder.add(obj);
    grp.add(holder);
    const s = o.escala || 1;
    holder.scale.setScalar(s);
    const size = sceneryBox(obj).getSize(new THREE.Vector3()).multiplyScalar(s);
    novaEnt(o.id, 'objeto', holder, o, [size.x, size.y, size.z], { obj, escala: s });
  }

  for (const c of def.personagens || []) {
    const ch = makePreset(c.preset, c.overrides || {});
    grp.add(ch.root);
    const s = ch.heightScale;
    const ent = novaEnt(c.id, 'personagem', ch.root, c, [0.9 * s, 1.72 * s, 0.9 * s], { ch, escala: s });
    // linhas do tempo de animação (camada 0 = corpo)
    const camadas = [];
    const add = (i, seg) => { (camadas[i] ||= []).push(seg); };
    for (const m of ent.movimentos) {
      const clip = m.clip || 'walk';
      let speed = 1;
      try {
        const alvoVel = m.velocidade || 1;
        let x0 = ent.pos0[0];
        let z0 = ent.pos0[2];
        for (const mm of ent.movimentos) {
          if (mm === m) break;
          x0 = mm.para[0];
          z0 = mm.para[1];
        }
        const dist = Math.hypot(m.para[0] - x0, m.para[1] - z0);
        const real = dist / Math.max(0.01, m.ate - m.de);
        speed = clamp((real / moveSpeed(ch, clip)) * alvoVel, 0.3, 2.6);
      } catch { speed = 1; }
      add(0, { clip, start: m.de, end: m.ate, speed, fade: 0.2 });
    }
    for (const a of c.acoes || []) {
      add(a.camada || 0, {
        clip: a.clip, start: a.de, end: a.ate, speed: a.velocidade, params: { ...(a.params || {}) },
        expression: a.expressao, mask: a.mascara, fade: a.suavizacao, fala: !!a.fala,
      });
    }
    ent.camadas = [];
    for (let i = 0; i < camadas.length; i++) ent.camadas.push((camadas[i] || []).sort((a, b) => a.start - b.start));
  }

  for (const t of def.textos || []) {
    const el = document.createElement('div');
    el.className = `texto ${t.estilo || 'destaque'}`;
    el.textContent = t.texto;
    el.style.display = 'none';
    textosEl.appendChild(el);
    cena.textos.push({ el, de: t.de ?? def.inicio, ate: t.ate ?? def.fim, estilo: t.estilo || 'destaque' });
  }
  cena.elementos = (def.elementos || []).map((e) => {
    if (e.ancora && !ents[e.ancora]) throw new Error(`Elemento com ancora "${e.ancora}" que não existe na cena.`);
    const o = criarElemento(e);
    o.de = e.de ?? def.inicio;
    o.ate = e.ate ?? def.fim;
    return o;
  });
  cena.efeitos = def.efeitos || [];

  // fluxos de material (partículas do processo) e rastros (faixa que cresce atrás de uma máquina)
  const checaPonto = (p, rot) => {
    if (p && !Array.isArray(p) && !ents[p.ancora]) throw new Error(`Fluxo: ${rot} com ancora "${p.ancora}" que não existe na cena.`);
  };
  cena.fluxos = (def.fluxos || []).map((f) => {
    if (!f.origem && !f.caminho) throw new Error('Fluxo sem "origem" (ou "caminho").');
    checaPonto(f.origem, 'origem');
    checaPonto(f.destino, 'destino');
    const fl = criarFluxo({ ...f, de: f.de ?? def.inicio, ate: f.ate ?? def.fim }, (p, t, out) => resolverPonto(cena, p, t, out));
    grp.add(fl.mesh);
    return fl;
  });
  cena.rastros = (def.rastros || []).map((r) => {
    const ent = ents[r.seguir];
    if (!ent) throw new Error(`Rastro seguindo "${r.seguir}" que não existe na cena.`);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: r.cor || '#26262a', roughness: r.brilho ? 0.35 : 0.92, flatShading: true }),
    );
    m.receiveShadow = true;
    m.visible = false;
    grp.add(m);
    return { r, ent, m };
  });
  return cena;
}

const cenas = sb.cenas.map((c, i) => {
  try { return construirCena(c); } catch (e) { throw new Error(`Cena ${i + 1} (${c.inicio}s): ${e.message}`); }
});

// ---------- trajetórias e posições (funções puras de t) ----------
function trajeto(ent, t) {
  let x = ent.pos0[0];
  const y = ent.pos0[1];
  let z = ent.pos0[2];
  let dist = 0;
  for (const m of ent.movimentos) {
    if (t <= m.de) break;
    const seg = Math.hypot(m.para[0] - x, m.para[1] - z);
    if (t >= m.ate) { dist += seg; x = m.para[0]; z = m.para[1]; continue; }
    const k = (t - m.de) / (m.ate - m.de);
    dist += seg * k;
    x += (m.para[0] - x) * k;
    z += (m.para[1] - z) * k;
    break;
  }
  return { x, y, z, dist };
}

// ponto do mundo: [x,y,z] ou { ancora: "id", desloca: [dx,dy,dz] } (gira junto com o objeto/personagem)
function resolverPonto(cena, p, t, out) {
  if (Array.isArray(p)) return out.set(p[0], p[1], p[2] ?? 0);
  const ent = cena.ents[p.ancora];
  const tr = trajeto(ent, t);
  const yaw = yawDe(cena, ent, t);
  const [dx, dy, dz] = p.desloca || [0, 0, 0];
  const s = ent.escala || 1;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return out.set(tr.x + (dx * c + dz * sn) * s, tr.y + dy * s, tr.z + (-dx * sn + dz * c) * s);
}

const centro = (cena, alvo, t) => {
  if (Array.isArray(alvo)) return new THREE.Vector3(...norm3(alvo, 0));
  const ent = cena.ents[alvo];
  if (!ent) throw new Error(`Alvo "${alvo}" não existe na cena de ${cena.def.inicio}s.`);
  const p = trajeto(ent, t);
  return new THREE.Vector3(p.x, p.y + ent.tamanho[1] * 0.5, p.z);
};

function yawDe(cena, ent, t) {
  let prev = ent.yaw0;
  let cur = ent.yaw0;
  let tc = -Infinity;
  let rapido = false;
  for (const e of ent.eventosYaw) {
    if (e.t > t) break;
    if (e.yaw === undefined) {
      const p = trajeto(ent, e.t);
      let alvo;
      if (e.alvo === 'camera') alvo = cameraEm(cena, e.t).pos;
      else if (typeof e.alvo === 'number') { e.yaw = e.alvo * DEG; }
      else alvo = centro(cena, e.alvo, e.t);
      if (alvo) e.yaw = Math.atan2(alvo.x - p.x, alvo.z - p.z);
    }
    prev = cur;
    cur = e.yaw;
    tc = e.t;
    rapido = !!e.rapido;
  }
  const k = smooth(clamp((t - tc) / (rapido ? 0.2 : 0.4), 0, 1));
  return prev + dif(cur - prev) * k;
}

// ---------- câmera ----------
const aspecto = W / H;
function cameraEm(cena, t) {
  const c = cena.def.camera || { tipo: 'enquadrar', alvo: Object.keys(cena.ents)[0], plano: 'geral' };
  const dur = Math.max(0.01, cena.def.fim - cena.def.inicio);
  const prog = clamp((t - cena.def.inicio) / dur, 0, 1);
  const fov0 = c.fov || 38;
  const alvoOlhar = (a) => (Array.isArray(a) ? new THREE.Vector3(...norm3(a, 0)) : centro(cena, a, t));

  if (c.tipo === 'fixa') {
    return { pos: new THREE.Vector3(...norm3(c.pos, 0)), look: alvoOlhar(c.olha), fov: fov0 };
  }
  if (c.tipo === 'travelling') {
    const k = c.easing === 'linear' ? prog : smooth(prog);
    const a = c.de;
    const b = c.para;
    const pa = new THREE.Vector3(...norm3(a.pos, 0));
    const pb = new THREE.Vector3(...norm3(b.pos, 0));
    const la = alvoOlhar(a.olha);
    const lb = alvoOlhar(b.olha ?? a.olha);
    return { pos: pa.lerp(pb, k), look: la.lerp(lb, k), fov: lerp(a.fov || fov0, b.fov || fov0, k) };
  }
  // enquadrar (padrão): enquadra um objeto/personagem automaticamente
  const ent = cena.ents[c.alvo];
  if (!ent) throw new Error(`Câmera: alvo "${c.alvo}" não existe na cena de ${cena.def.inicio}s.`);
  const plano = c.plano || 'medio';
  const p = trajeto(ent, t);
  let cy;
  let R;
  if (ent.tipo === 'personagem') {
    const s = ent.escala;
    const [a, b] = { geral: [0.95, 1.5], medio: [1.25, 0.85], close: [1.5, 0.45], topo: [0.9, 1.5] }[plano] || [1.25, 0.85];
    cy = p.y + s * a;
    R = s * b;
  } else {
    const [sx, sy, sz] = ent.tamanho;
    const m = Math.max(sx, sy, sz) / 2;
    cy = p.y + sy / 2;
    R = m * ({ geral: 1.15, medio: 0.8, close: 0.5, topo: 1.2 }[plano] || 0.9);
  }
  const fovV = fov0 * DEG;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspecto);
  let dist = R / Math.tan(Math.min(fovV, fovH) / 2);
  dist *= lerp(1, c.aproxima ?? 1, smooth(prog));
  const ang = ((c.angulo || 0) + (c.deriva || 0) * prog) * DEG + ent.yaw0;
  const elev = (c.elevacao ?? (plano === 'topo' ? 70 : plano === 'close' ? 5 : plano === 'medio' ? 10 : 16)) * DEG;
  const look = new THREE.Vector3(p.x, cy, p.z);
  if (c.olhaDesloca) look.add(new THREE.Vector3(...c.olhaDesloca));
  const pos = new THREE.Vector3(
    look.x + Math.sin(ang) * Math.cos(elev) * dist,
    look.y + Math.sin(elev) * dist,
    look.z + Math.cos(ang) * Math.cos(elev) * dist,
  );
  pos.y = Math.max(pos.y, 0.4);
  return { pos, look, fov: fov0 };
}

// ---------- boca sincronizada com a fala ----------
function bocaNaFala(t) {
  let lo = 0;
  let hi = palavras.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = palavras[mid];
    if (t < w.inicio) hi = mid - 1;
    else if (t >= w.fim) lo = mid + 1;
    else {
      const silabas = Math.max(1, Math.round(w.palavra.replace(/[^\p{L}]/gu, '').length / 3));
      const k = (t - w.inicio) / Math.max(0.05, w.fim - w.inicio);
      return 0.22 + 0.62 * Math.abs(Math.sin(Math.PI * silabas * k));
    }
  }
  return 0.03;
}

// ---------- interpolação de keyframes [[t, valor], ...] ----------
function chaves(ks, t) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1];
      const [t1, v1] = ks[i];
      return lerp(v0, v1, (t - t0) / Math.max(1e-6, t1 - t0));
    }
  }
  return ks[ks.length - 1][1];
}
const popBack = (x) => { const c = 1.70158; const k = x - 1; return 1 + (c + 1) * k * k * k + c * k * k; };

// ---------- legendas ----------
const legendaEl = document.getElementById('legenda');
const legendas = sb.legendas?.ativo === false || !palavras.length
  ? null
  : criarLegendas(legendaEl, palavras, sb.legendas || {});

// ---------- quadro ----------
let cenaAtiva = null;
let horarioAtual = null;

function cenaEm(t) {
  let r = cenas[0];
  for (const c of cenas) if (t >= c.def.inicio) r = c;
  return r;
}

window.renderAt = (t) => {
  t = clamp(t, 0, DUR);
  const cena = cenaEm(t);
  if (cena !== cenaAtiva) {
    if (cenaAtiva) cenaAtiva.grp.visible = false;
    cena.grp.visible = true;
    cenaAtiva = cena;
    for (const c of cenas) {
      if (c === cena) continue;
      for (const x of c.textos) x.el.style.display = 'none';
      for (const x of c.elementos) x.el.style.display = 'none';
    }
  }
  const amb = cena.def.ambiente || {};
  const horario = amb.horario || sb.ambiente?.horario || 'dia';
  const clima = amb.clima || sb.ambiente?.clima || 'limpo';
  // sempre existe um cenário de fundo e um chão: "nenhum"/desconhecido viram o padrão (nunca cor sólida)
  let fundo = amb.fundo ?? sb.ambiente?.fundo ?? 'campo';
  if (fundo === 'colinas' || !FUNDOS[fundo]) fundo = 'campo';
  let chao = amb.chao || sb.ambiente?.chao || CHAO_PADRAO[fundo];
  if (!CHAO[chao]) chao = CHAO_PADRAO[fundo];
  const temRua = (cena.def.objetos || []).some((o) => o.asset === 'rua_reta' || o.asset === 'cruzamento');
  const decorar = (amb.decoracao ?? sb.ambiente?.decoracao) !== false && chao === 'grama' && !temRua && fundo !== 'interior';
  const chaveAmb = `${horario}|${chao}|${clima}|${decorar}|${fundo}`;
  if (chaveAmb !== horarioAtual) {
    horarioAtual = chaveAmb;
    setEnvironmentTime(scene, env, horario);
    const [topo, horiz] = CEUS[clima === 'chuva' ? 'chuva' : horario] || CEUS.dia;
    domo.material.uniforms.topo.value.set(topo);
    domo.material.uniforms.horizonte.value.set(horiz);
    scene.fog.color.set(horiz);
    scene.background = new THREE.Color(horiz);
    scene.fog.near = 70;
    env.hemi.intensity *= 0.8;
    if (clima === 'chuva') { env.sun.intensity *= 0.45; env.hemi.intensity *= 0.9; scene.fog.near = 25; }
    for (const [nome, g] of Object.entries(FUNDOS)) g.visible = nome === fundo;
    domo.visible = fundo !== 'interior';
    if (fundo === 'interior') scene.background = new THREE.Color('#e9dfcc');
    chaoMesh.visible = true;
    chaoMesh.material.color.set(CHAO[chao]);
    decoracao.visible = decorar;
    chuva.linhas.visible = clima === 'chuva';
    nuvens.visible = (amb.nuvens ?? sb.ambiente?.nuvens) !== false;
  }

  // entidades
  for (const ent of Object.values(cena.ents)) {
    const p = trajeto(ent, t);
    ent.holder.position.set(p.x, p.y, p.z);
    ent.holder.rotation.set(0, yawDe(cena, ent, t), 0);
    const d = ent.def;
    let escAnim = 1;
    if (d.anim) {
      // animação livre: pos/giro/escala por keyframes, rotação contínua, oscilação e pulso (tudo função de t)
      const an = d.anim;
      if (an.pos) {
        const v = chavesVec(an.pos, t, an.suave !== false);
        ent.holder.position.set(v[0], v[1], v[2]);
      }
      const eixo = an.eixo || 'y';
      let ang = 0;
      if (an.giro) ang += chaves(an.giro, t) * DEG;
      if (an.gira) ang += an.gira * t * DEG;
      if (ang) ent.holder.rotation[eixo] += ang;
      if (an.escala) escAnim *= chaves(an.escala, t);
      if (an.pulsa) escAnim *= 1 + an.pulsa * Math.sin(t * 6);
      if (an.oscila) {
        const o = an.oscila;
        const v = Math.sin(t * (o.freq ?? 1) * Math.PI * 2) * (o.amp ?? 0.2);
        ent.holder.position[o.eixo || 'y'] += v;
      }
    }
    if (ent.tipo === 'objeto') {
      if (d.etapa) setProgress(ent.obj, clamp(chaves(d.etapa, t), 0, 1));
      updateScenery(ent.obj, t);
      rollWheels(ent.obj, p.dist);
      let vis = true;
      let esc = ent.escala;
      if (d.aparece !== undefined) {
        const k = (t - d.aparece) / 0.4;
        if (k < 0) vis = false;
        else esc *= clamp(popBack(clamp(k, 0, 1)), 0, 1.25);
      }
      if (d.some !== undefined && t >= d.some) {
        const k = 1 - (t - d.some) / 0.25;
        if (k <= 0) vis = false;
        else esc *= k;
      }
      ent.holder.visible = vis;
      ent.holder.scale.setScalar(Math.max(0.0001, esc * escAnim));
    } else {
      for (const camada of ent.camadas) for (const seg of camada) if (seg.fala) seg.params.mouthOpen = bocaNaFala(t);
      animate(ent.ch, ent.camadas, t);
    }
  }

  // fluxos de material e rastros
  for (const f of cena.fluxos) f.atualizar(t);
  for (const { r, ent, m } of cena.rastros) {
    const t0 = r.de ?? cena.def.inicio;
    if (t < t0) { m.visible = false; continue; }
    const a = trajeto(ent, t0);
    const b = trajeto(ent, Math.min(t, r.ate ?? cena.def.fim));
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L0 = Math.hypot(dx, dz);
    const len = L0 - (r.recuo || 0);
    if (L0 < 0.05 || len < 0.05) { m.visible = false; continue; }
    const ux = dx / L0;
    const uz = dz / L0;
    const lat = r.lateral || 0;
    const alt = r.altura ?? 0.07;
    m.visible = true;
    m.position.set(a.x + (ux * len) / 2 - uz * lat, (r.base ?? 0) + alt / 2, a.z + (uz * len) / 2 + ux * lat);
    m.scale.set(r.largura ?? 3, alt, len);
    m.rotation.y = Math.atan2(ux, uz);
  }

  // câmera
  const cam = cameraEm(cena, t);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  const distCam = cam.pos.distanceTo(cam.look);
  const area = clamp(distCam * 0.9, 14, 90);
  env.sun.target.position.copy(cam.look);
  env.sun.position.copy(cam.look).add(new THREE.Vector3(area * 0.5, area * 1.1, area * 0.8));
  Object.assign(env.sun.shadow.camera, { left: -area, right: area, top: area, bottom: -area, far: area * 5 });
  env.sun.shadow.camera.updateProjectionMatrix();
  nuvens.position.set(cam.look.x, 0, cam.look.z);
  domo.position.copy(cam.pos);
  for (const [nome, g] of Object.entries(FUNDOS)) if (nome !== 'interior') g.position.set(cam.look.x * 0.9, 0, cam.look.z * 0.9);
  scene.fog.far = Math.max(520, distCam * 6);
  if (chuva.linhas.visible) {
    const fr = new THREE.Vector3().subVectors(cam.look, cam.pos).setY(0).normalize();
    const dir = new THREE.Vector3(fr.z, 0, -fr.x);
    const pos = chuva.linhas.geometry.attributes.position.array;
    chuva.base.forEach((b, i) => {
      const y = 24 - ((b.y0 + t * b.v) % 24);
      const x = cam.pos.x + dir.x * b.x + fr.x * b.z;
      const z = cam.pos.z + dir.z * b.x + fr.z * b.z;
      pos.set([x, y, z, x - 0.08, y - 0.95, z - 0.02], i * 6);
    });
    chuva.linhas.geometry.attributes.position.needsUpdate = true;
  }

  // textos, legendas e transição
  let tituloVisivel = false;
  for (const x of cena.textos) {
    const dentro = t >= x.de && t < x.ate;
    x.el.style.display = dentro ? 'block' : 'none';
    if (dentro) {
      if (x.estilo === 'titulo' || x.estilo === 'destaque') tituloVisivel = true;
      const k = clamp((t - x.de) / 0.25, 0, 1);
      const sai = clamp((x.ate - t) / 0.15, 0, 1);
      x.el.style.transform = `rotate(${x.estilo === 'destaque' ? -3 : 0}deg) scale(${lerp(0.6, 1, popBack(k))})`;
      x.el.style.opacity = String(Math.min(k * 2, sai));
    }
  }
  // elementos opcionais (setas, ícones, etiquetas)
  camera.updateMatrixWorld();
  for (const o of cena.elementos) {
    const e = o.e;
    const dentro = t >= o.de && t < o.ate;
    o.el.style.display = dentro ? 'flex' : 'none';
    if (!dentro) continue;
    let x = (e.pos ? e.pos[0] : 0.5) * W;
    let y = (e.pos ? e.pos[1] : 0.5) * H;
    if (e.ancora) {
      const ent = cena.ents[e.ancora];
      const p = trajeto(ent, t);
      const v = new THREE.Vector3(p.x, p.y + ent.tamanho[1] * (e.alturaRel ?? 0.5) + (e.y || 0), p.z).project(camera);
      x = (v.x * 0.5 + 0.5) * W + (e.dx || 0) * W;
      y = (-v.y * 0.5 + 0.5) * H + (e.dy || 0) * H;
    }
    const k = clamp((t - o.de) / 0.3, 0, 1);
    const sai = clamp((o.ate - t) / 0.2, 0, 1);
    let esc = popBack(k) * (e.pulsa ? 1 + 0.06 * Math.sin(t * 12) : 1);
    let ox = 0;
    let oy = 0;
    if (e.tipo === 'seta' && e.balanca !== false) {
      const b = Math.sin(t * 8) * 0.014 * W;
      ox = o.dirSeta[0] * b;
      oy = o.dirSeta[1] * b;
    }
    const larg = (e.tamanho ?? (e.tipo === 'etiqueta' ? 1 : 0.22)) * W;
    if (e.tipo === 'etiqueta') { o.el.style.fontSize = `${(e.tamanho ?? 1) * 40 * (H / 1920)}px`; o.el.style.width = 'auto'; }
    else { o.el.style.width = `${larg}px`; o.el.style.height = `${o.dupla ? larg / 2 : larg}px`; }
    o.el.style.left = `${x + ox}px`;
    o.el.style.top = `${y + oy}px`;
    o.el.style.transform = `translate(-50%, -50%) rotate(${e.tipo === 'etiqueta' ? 0 : o.rot}deg) scale(${Math.max(0.001, esc)})`;
    o.el.style.opacity = String(Math.min(k * 3, sai));
  }

  // efeitos de imagem (preto e branco, zoom, tremor) aplicados só ao 3D, sem afetar legendas e textos
  let cinza = 0;
  let zoom = 1;
  let tx = 0;
  let ty = 0;
  for (const f of cena.efeitos) {
    if (!(t >= f.de && t < f.ate)) continue;
    const dur = f.ate - f.de;
    const k = (t - f.de) / dur;
    const rampa = smooth(clamp(Math.min((t - f.de) / 0.25, (f.ate - t) / 0.25), 0, 1));
    if (f.tipo === 'pretoebranco') { cinza = Math.max(cinza, rampa); zoom *= 1 + ((f.zoom ?? 1.12) - 1) * smooth(k); }
    else if (f.tipo === 'zoom') zoom *= 1 + ((f.para ?? 1.2) - 1) * smooth(k);
    else if (f.tipo === 'tremor') { const a = (f.intensidade ?? 0.5) * 9 * (H / 1920); tx += Math.sin(t * 61) * a; ty += Math.cos(t * 73) * a; }
  }
  canvas.style.filter = cinza > 0.001 ? `grayscale(${cinza}) contrast(${1 + 0.15 * cinza})` : 'none';
  canvas.style.transform = zoom !== 1 || tx || ty ? `translate(${tx}px, ${ty}px) scale(${zoom})` : 'none';

  // com título na tela, a legenda desce um pouco (o título fica no alto, a legenda embaixo)
  const baseLegenda = sb.legendas?.posicaoY ?? 0.68;
  const posLegenda = String(baseLegenda + (tituloVisivel ? 0.05 : 0));
  if (legendaEl.dataset.pos !== posLegenda) { legendaEl.dataset.pos = posLegenda; legendaEl.style.setProperty('--pos-legenda', posLegenda); }
  if (legendas) legendas.atualizar(t);
  const tr = cena.def.transicao;
  const idade = t - cena.def.inicio;
  if ((tr === 'flash' || tr === 'fade') && idade < 0.3 && cena !== cenas[0]) {
    fx.style.background = tr === 'flash' ? '#fff' : '#000';
    fx.style.opacity = String(1 - idade / 0.3);
  } else {
    fx.style.opacity = '0';
  }

  if (composer) composer.render();
  else renderer.render(scene, camera);
};

window.__info = { duracao: DUR, fps: FPS, largura: W, altura: H, cenas: sb.cenas.map((c) => [c.inicio, c.fim]) };

// ---------- modo visualização (com controles e áudio) ----------
if (!modoRender) {
  const ctrl = document.getElementById('controles');
  ctrl.hidden = false;
  const linha = document.getElementById('linha');
  const tempoEl = document.getElementById('tempo');
  const btn = document.getElementById('tocar');
  const audio = sb.audio ? new Audio(`/${projeto}/${sb.audio}`) : null;
  let tocando = false;
  let t0 = 0; // instante em que o relógio foi zerado
  let relogio = 0;
  let tAtual = 0;
  const mostrar = (t) => {
    tAtual = t;
    window.renderAt(t);
    linha.value = String((t / DUR) * 1000);
    tempoEl.textContent = `${t.toFixed(1)}s / ${DUR.toFixed(1)}s`;
  };
  const ir = (t) => { t0 = t; relogio = performance.now(); mostrar(t); if (audio) audio.currentTime = t; };
  btn.onclick = () => {
    tocando = !tocando;
    btn.textContent = tocando ? 'Pausar' : 'Tocar';
    if (tocando) { t0 = tAtual; relogio = performance.now(); if (audio) { audio.currentTime = t0; audio.play(); } } else if (audio) audio.pause();
  };
  linha.oninput = () => ir((linha.value / 1000) * DUR);
  const laco = () => {
    if (tocando) {
      let t = t0 + (performance.now() - relogio) / 1000;
      if (t >= DUR) { t = 0; t0 = 0; relogio = performance.now(); if (audio) { audio.currentTime = 0; audio.play(); } }
      mostrar(t);
    }
    requestAnimationFrame(laco);
  };
  ir(Number(q.get('t')) || 0);
  laco();
} else {
  window.renderAt(0);
}
window.__pronto = true;
