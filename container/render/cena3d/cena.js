// A cena da maquete descrita em JSON: ambiente, objetos, pessoas e câmera. validarCena aponta o
// que está errado; montarCena devolve a cena do Three.js, a câmera e o relatório do enquadramento
// (onde cada pessoa e objeto caiu no quadro). Nada aqui desenha: quem desenha é a página
// (maquete.mjs), e os testes rodam no Node.
import * as THREE from "three";
import { CABELOS, CORPOS, JUNTAS, MAX_PUNHO, apontarPalma, assentarDedos, avisoDeColisao, criarCorpo, segurarObjeto, palmaParaBaixo, peEm, peReto, pesNoChao, separarPernas, soltarBracos, definirJunta, direcaoDoRosto, maoEm, olharPara, pontoDoRosto, valoresDaJunta } from "./corpo.js";
import { GRAU, caixa, material } from "./geo.js";
import { OBJETOS } from "./objetos.js";
import { MAOS, POSES, comporPoses } from "./poses.js";

export const AMBIENTES = ["sala", "estudio", "externo", "nenhum"];
/**
 * neutro: tudo em cinza e bege (o modelo de imagem copia cor que a descrição não cita).
 * contraste: uma cor por categoria (pessoa, móveis, paredes, chão), para o modelo separar o que é
 * cada coisa; produtos e plantas ficam com a cor deles. Cor dada na cena vale nos dois.
 */
export const ESTILOS = ["neutro", "contraste"];
const CONTRASTE = {
  pessoa: { pele: "#d9a37c", roupa: "#c4553d", calca: "#2f3d63", cabelo: "#2a1d17", sapato: "#1f1f1f" },
  movel: "#6f8fae",
  movel2: "#5c4a3d",
  parede: "#efe9df",
  chao: "#a88b6a",
};
const MOVEIS = new Set(["bancada", "ilha", "armario_suspenso", "geladeira", "sofa", "poltrona", "cadeira", "banqueta", "mesa", "mesa_centro", "mesa_lateral", "cama", "estante", "armario", "rack_tv", "bloco", "cilindro", "porta"]);
const PAREDES = ["fundo", "esquerda", "direita", "frente"];
const MAX_PESSOAS = 12;
const MAX_OBJETOS = 120;

// ---------- validação ----------

const ehNumero = (v) => typeof v === "number" && Number.isFinite(v);
const ehPonto = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(ehNumero);
const ehPosicao = (v) => ehPonto(v, 2) || ehPonto(v, 3);

function chavesSobrando(obj, aceitas, caminho, erros) {
  for (const k of Object.keys(obj)) if (!aceitas.includes(k)) erros.push(`${caminho}.${k}: campo desconhecido (aceitos: ${aceitas.join(", ")})`);
}

/** Os erros da cena, um por linha, com o caminho do campo. Lista vazia: a cena está certa. */
export function validarCena(cena) {
  const erros = [];
  if (!cena || typeof cena !== "object" || Array.isArray(cena)) return ["a cena deve ser um objeto com ambiente, objetos, pessoas e camera"];
  chavesSobrando(cena, ["estilo", "ambiente", "luz", "objetos", "pessoas", "camera"], "cena", erros);
  if (cena.estilo !== undefined && !ESTILOS.includes(cena.estilo)) erros.push(`estilo: use ${ESTILOS.join(" ou ")}`);
  const ids = new Set();
  const amb = cena.ambiente ?? {};
  if (typeof amb !== "object" || Array.isArray(amb)) erros.push("ambiente: deve ser um objeto");
  else {
    chavesSobrando(amb, ["tipo", "largura", "profundidade", "altura", "paredes", "cor_parede", "cor_chao", "cor_ceu", "teto"], "ambiente", erros);
    if (amb.tipo !== undefined && !AMBIENTES.includes(amb.tipo)) erros.push(`ambiente.tipo: "${amb.tipo}" não existe (use ${AMBIENTES.join(", ")})`);
    for (const k of ["largura", "profundidade", "altura"]) if (amb[k] !== undefined && !(ehNumero(amb[k]) && amb[k] > 0.5 && amb[k] < 200)) erros.push(`ambiente.${k}: metros, entre 0,5 e 200`);
    if (amb.paredes !== undefined && !(Array.isArray(amb.paredes) && amb.paredes.every((p) => PAREDES.includes(p)))) erros.push(`ambiente.paredes: lista com ${PAREDES.join(", ")}`);
  }
  if (cena.luz !== undefined) {
    if (typeof cena.luz !== "object") erros.push("luz: deve ser um objeto");
    else {
      chavesSobrando(cena.luz, ["sol", "intensidade", "ambiente"], "luz", erros);
      if (cena.luz.sol !== undefined && !ehPonto(cena.luz.sol)) erros.push("luz.sol: direção de onde vem o sol, [x, y, z]");
    }
  }
  const objetos = cena.objetos ?? [];
  if (!Array.isArray(objetos)) erros.push("objetos: deve ser uma lista");
  else {
    if (objetos.length > MAX_OBJETOS) erros.push(`objetos: no máximo ${MAX_OBJETOS}`);
    objetos.forEach((o, i) => {
      const c = `objetos[${i}]`;
      if (!o || typeof o !== "object") return erros.push(`${c}: deve ser um objeto`);
      if (o.id !== undefined) {
        if (typeof o.id !== "string" || !o.id) erros.push(`${c}.id: texto`);
        else if (ids.has(o.id)) erros.push(`${c}.id: "${o.id}" repetido`);
        else ids.add(o.id);
      }
      const tipo = OBJETOS[o.tipo];
      if (!tipo) return erros.push(`${c}.tipo: "${o.tipo}" não existe (use ${Object.keys(OBJETOS).join(", ")})`);
      chavesSobrando(o, ["id", "tipo", "posicao", "giro", "inclina", "sobre", "na_mao", "giro_na_mao", ...Object.keys(tipo.padrao)], c, erros);
      if (o.inclina !== undefined && !(ehNumero(o.inclina) && Math.abs(o.inclina) <= 180)) erros.push(`${c}.inclina: graus (+ tomba o topo para a frente do objeto)`);
      if (o.posicao !== undefined && !ehPosicao(o.posicao)) erros.push(`${c}.posicao: [x, z] no chão ou [x, y, z]`);
      if (o.giro !== undefined && !ehNumero(o.giro)) erros.push(`${c}.giro: graus`);
      if (o.giro_na_mao !== undefined && !ehPonto(o.giro_na_mao)) erros.push(`${c}.giro_na_mao: [x, y, z] em graus`);
      for (const k of ["largura", "altura", "profundidade", "elevacao"]) if (o[k] !== undefined && !(ehNumero(o[k]) && o[k] >= 0 && o[k] <= 200)) erros.push(`${c}.${k}: metros`);
      if (o.na_mao !== undefined && !(o.na_mao && typeof o.na_mao.pessoa === "string" && ["E", "D"].includes(o.na_mao.lado))) erros.push(`${c}.na_mao: {pessoa: id, lado: "E" ou "D"}`);
    });
  }
  const pessoas = cena.pessoas ?? [];
  if (!Array.isArray(pessoas)) erros.push("pessoas: deve ser uma lista");
  else {
    if (pessoas.length > MAX_PESSOAS) erros.push(`pessoas: no máximo ${MAX_PESSOAS}`);
    pessoas.forEach((p, i) => {
      const c = `pessoas[${i}]`;
      if (!p || typeof p !== "object") return erros.push(`${c}: deve ser um objeto`);
      chavesSobrando(p, ["id", "corpo", "altura", "porte", "cabelo", "cores", "posicao", "giro", "pose", "maos", "juntas", "alcancar", "olhar", "sentar_em"], c, erros);
      if (p.id !== undefined) {
        if (typeof p.id !== "string" || !p.id) erros.push(`${c}.id: texto`);
        else if (ids.has(p.id)) erros.push(`${c}.id: "${p.id}" repetido`);
        else ids.add(p.id);
      }
      if (p.corpo !== undefined && !CORPOS[p.corpo]) erros.push(`${c}.corpo: "${p.corpo}" não existe (use ${Object.keys(CORPOS).join(", ")})`);
      if (p.altura !== undefined && !(ehNumero(p.altura) && p.altura >= 0.8 && p.altura <= 2.2)) erros.push(`${c}.altura: metros, entre 0,8 e 2,2`);
      if (p.porte !== undefined && !(ehNumero(p.porte) && p.porte >= 0.7 && p.porte <= 1.5)) erros.push(`${c}.porte: de 0,7 (magro) a 1,5 (gordo); 1 é o comum`);
      if (p.cabelo !== undefined && !CABELOS.includes(p.cabelo)) erros.push(`${c}.cabelo: use ${CABELOS.join(", ")}`);
      if (p.posicao !== undefined && !ehPosicao(p.posicao)) erros.push(`${c}.posicao: [x, z] no chão ou [x, y, z]`);
      if (p.giro !== undefined && !ehNumero(p.giro)) erros.push(`${c}.giro: graus (0 olha para +Z)`);
      const poses = p.pose === undefined ? [] : Array.isArray(p.pose) ? p.pose : [p.pose];
      for (const n of poses) if (!POSES[n]) erros.push(`${c}.pose: "${n}" não existe (use ${Object.keys(POSES).join(", ")})`);
      if (p.maos !== undefined) {
        if (typeof p.maos !== "object") erros.push(`${c}.maos: {E, D} com o formato da mão`);
        else for (const [lado, f] of Object.entries(p.maos)) if (!["E", "D"].includes(lado) || (typeof f === "string" ? !MAOS[f] : typeof f !== "object")) erros.push(`${c}.maos.${lado}: use E ou D com ${Object.keys(MAOS).join(", ")}`);
      }
      if (p.juntas !== undefined) {
        if (typeof p.juntas !== "object") erros.push(`${c}.juntas: {nome: {dobra, abre, ...}}`);
        else for (const [j, v] of Object.entries(p.juntas)) {
          if (!JUNTAS.includes(j)) erros.push(`${c}.juntas.${j}: não existe (use ${JUNTAS.join(", ")})`);
          else if (!v || typeof v !== "object") erros.push(`${c}.juntas.${j}: {${valoresDaJunta(j).join(", ")}}`);
          else for (const [k, n] of Object.entries(v)) {
            if (!valoresDaJunta(j).includes(k)) erros.push(`${c}.juntas.${j}.${k}: não existe (use ${valoresDaJunta(j).join(", ")})`);
            else if (!ehNumero(n)) erros.push(`${c}.juntas.${j}.${k}: número`);
          }
        }
      }
      if (p.alcancar !== undefined) {
        if (typeof p.alcancar !== "object") erros.push(`${c}.alcancar: {E, D} com [x, y, z] ou o id de um objeto`);
        else for (const [lado, a] of Object.entries(p.alcancar)) if (!["E", "D"].includes(lado) || !(ehPonto(a) || typeof a === "string")) erros.push(`${c}.alcancar.${lado}: [x, y, z] ou o id de um objeto`);
      }
      if (p.olhar !== undefined && !(ehPonto(p.olhar) || typeof p.olhar === "string")) erros.push(`${c}.olhar: [x, y, z], "camera", "maoE"/"maoD" ou o id de alguém ou de um objeto`);
      if (p.sentar_em !== undefined && typeof p.sentar_em !== "string") erros.push(`${c}.sentar_em: o id de um objeto com assento (${Object.keys(OBJETOS).filter((k) => OBJETOS[k].assento).join(", ")})`);
    });
  }
  // Referências a ids.
  const objPorId = new Map((Array.isArray(objetos) ? objetos : []).filter((o) => o?.id).map((o) => [o.id, o]));
  const pesPorId = new Set((Array.isArray(pessoas) ? pessoas : []).filter((p) => p?.id).map((p) => p.id));
  if (Array.isArray(objetos)) objetos.forEach((o, i) => {
    if (o?.sobre !== undefined && !objPorId.has(o.sobre)) erros.push(`objetos[${i}].sobre: não há objeto com id "${o.sobre}"`);
    if (o?.na_mao && !pesPorId.has(o.na_mao.pessoa)) erros.push(`objetos[${i}].na_mao.pessoa: não há pessoa com id "${o.na_mao.pessoa}"`);
  });
  if (Array.isArray(pessoas)) pessoas.forEach((p, i) => {
    if (typeof p?.sentar_em === "string") {
      const o = objPorId.get(p.sentar_em);
      if (!o) erros.push(`pessoas[${i}].sentar_em: não há objeto com id "${p.sentar_em}"`);
      else if (!OBJETOS[o.tipo]?.assento) erros.push(`pessoas[${i}].sentar_em: ${o.tipo} não tem assento`);
    }
    for (const [lado, a] of Object.entries(p?.alcancar ?? {})) if (typeof a === "string" && !objPorId.has(a)) erros.push(`pessoas[${i}].alcancar.${lado}: não há objeto com id "${a}"`);
    if (typeof p?.olhar === "string" && p.olhar !== "camera" && !/^mao[ED]$/.test(p.olhar) && !objPorId.has(p.olhar) && !pesPorId.has(p.olhar)) erros.push(`pessoas[${i}].olhar: não há "${p.olhar}"`);
  });
  const cam = cena.camera;
  if (cam === undefined) erros.push("camera: obrigatória, {posicao: [x, y, z], alvo: [x, y, z] ou id, lente: mm}");
  else if (typeof cam !== "object") erros.push("camera: deve ser um objeto");
  else {
    chavesSobrando(cam, ["posicao", "alvo", "lente", "rolar"], "camera", erros);
    if (!ehPonto(cam.posicao)) erros.push("camera.posicao: [x, y, z] em metros");
    if (!(ehPonto(cam.alvo) || typeof cam.alvo === "string")) erros.push("camera.alvo: [x, y, z] ou o id de uma pessoa (mira o rosto) ou de um objeto");
    else if (typeof cam.alvo === "string" && !objPorId.has(cam.alvo) && !pesPorId.has(cam.alvo)) erros.push(`camera.alvo: não há "${cam.alvo}"`);
    if (cam.lente !== undefined && !(ehNumero(cam.lente) && cam.lente >= 8 && cam.lente <= 400)) erros.push("camera.lente: milímetros (equivalente de 35 mm), entre 8 e 400; celular: 26");
    if (cam.rolar !== undefined && !ehNumero(cam.rolar)) erros.push("camera.rolar: graus");
  }
  return erros;
}

// ---------- montagem ----------

const caixaDe = (obj) => new THREE.Box3().setFromObject(obj, true);

function montarAmbiente(scene, amb, contraste) {
  const tipo = amb.tipo ?? "sala";
  if (tipo === "nenhum") {
    scene.background = new THREE.Color(amb.cor_ceu ?? "#d9d9d9");
    return;
  }
  const corChao = amb.cor_chao ?? (contraste && tipo !== "externo" ? CONTRASTE.chao : null) ?? (tipo === "externo" ? "#c9c7c2" : tipo === "estudio" ? "#dcdcdc" : "#cfc9c0");
  if (tipo === "externo") {
    scene.background = new THREE.Color(amb.cor_ceu ?? "#dfe7ee");
    scene.fog = new THREE.Fog(scene.background, 80, 400);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), material(corChao));
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    scene.add(chao);
    return;
  }
  const L = amb.largura ?? (tipo === "estudio" ? 8 : 5);
  const P = amb.profundidade ?? (tipo === "estudio" ? 8 : 5);
  const A = amb.altura ?? (tipo === "estudio" ? 4 : 2.7);
  scene.background = new THREE.Color(amb.cor_ceu ?? (tipo === "estudio" ? amb.cor_parede ?? "#dcdcdc" : "#d6d6d6"));
  const chao = caixa(L + 0.2, 0.05, P + 0.2, material(corChao), 0.002);
  chao.position.y = -0.025;
  chao.castShadow = false;
  scene.add(chao);
  const corParede = material(amb.cor_parede ?? (contraste ? CONTRASTE.parede : null) ?? (tipo === "estudio" ? "#dcdcdc" : "#e8e5e0"));
  const paredes = amb.paredes ?? (tipo === "estudio" ? ["fundo"] : ["fundo", "esquerda", "direita"]);
  for (const p of paredes) {
    const frenteFundo = p === "fundo" || p === "frente";
    const w = frenteFundo ? L + 0.2 : 0.1;
    const d = frenteFundo ? 0.1 : P + 0.2;
    const parede = caixa(w, A, d, corParede, 0.002);
    parede.castShadow = false;
    parede.position.x = p === "esquerda" ? L / 2 + 0.05 : p === "direita" ? -L / 2 - 0.05 : 0;
    parede.position.z = p === "fundo" ? -P / 2 - 0.05 : p === "frente" ? P / 2 + 0.05 : 0;
    scene.add(parede);
  }
  if (amb.teto) {
    const teto = caixa(L + 0.2, 0.05, P + 0.2, corParede, 0.002);
    teto.position.y = A;
    scene.add(teto);
  }
}

function luzes(scene, luz, foco) {
  const intensidade = luz.intensidade ?? 1;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8580, 1.5 * (luz.ambiente ?? 1)));
  const sol = new THREE.DirectionalLight(0xffffff, 2.4 * intensidade);
  const dir = new THREE.Vector3(...(luz.sol ?? [-0.6, 1.1, 0.8])).normalize();
  sol.position.copy(foco.center).add(dir.multiplyScalar(30));
  sol.target.position.copy(foco.center);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  const r = Math.min(40, Math.max(3, foco.radius * 1.2));
  Object.assign(sol.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 80 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.02;
  scene.add(sol, sol.target);
}

/** Ângulo vertical da câmera para uma lente (mm, equivalente de 35 mm pela diagonal). */
export function campoVertical(lente, largura, altura) {
  const diag = 2 * Math.atan(43.27 / (2 * lente));
  return (2 * Math.atan(Math.tan(diag / 2) * (altura / Math.hypot(largura, altura)))) / GRAU;
}

/**
 * Monta a cena validada. Devolve { scene, camera, relatorio }. relatorio diz, de cada pessoa e
 * objeto com id, onde caiu no quadro (em %, de cima para baixo e da esquerda para a direita).
 */
export function montarCena(cena, { largura = 720, altura = 1280 } = {}) {
  const scene = new THREE.Scene();
  const avisos = [];
  const contraste = cena.estilo === "contraste";
  montarAmbiente(scene, cena.ambiente ?? {}, contraste);
  const objetos = new Map();
  const entidades = [];

  const criarObjeto = (o, i) => {
    const tipo = OBJETOS[o.tipo];
    const cores = contraste && MOVEIS.has(o.tipo) ? { cor: o.tipo === "cama" ? "#f1eee8" : CONTRASTE.movel, cor2: o.tipo === "cama" ? CONTRASTE.movel : CONTRASTE.movel2 } : {};
    const p = { ...tipo.padrao, ...cores, ...Object.fromEntries(Object.entries(o).filter(([k]) => k in tipo.padrao)) };
    const g = tipo.criar(p);
    const raiz = new THREE.Group();
    raiz.add(g);
    raiz.name = o.id ?? `${o.tipo}${i}`;
    raiz.userData = { tipo: o.tipo, p };
    return raiz;
  };
  const colocar = (raiz, posicao = [0, 0], giro = 0, base = 0, inclina = 0) => {
    const [x, y, z] = posicao.length === 2 ? [posicao[0], base, posicao[1]] : posicao;
    raiz.position.set(x, y, z);
    // Primeiro gira para os lados, depois tomba para a frente (+) ou para trás (−).
    raiz.rotation.order = "YXZ";
    raiz.rotation.set(inclina * GRAU, giro * GRAU, 0);
  };

  // Objetos no chão primeiro, depois os que vão sobre outros (em quantas voltas precisar).
  const lista = (cena.objetos ?? []).map((o, i) => ({ o, i }));
  // Objeto na mão com posição fica no lugar (a mão vai até ele); sem posição, acompanha a mão.
  const preso = (o) => o.na_mao && !o.posicao && !o.sobre;
  let pendentes = lista.filter(({ o }) => !preso(o));
  for (let volta = 0; pendentes.length && volta < 10; volta++) {
    const resto = [];
    for (const item of pendentes) {
      const { o, i } = item;
      if (o.sobre && !objetos.has(o.sobre)) {
        resto.push(item);
        continue;
      }
      const raiz = criarObjeto(o, i);
      let base = 0;
      let pos = o.posicao;
      if (o.sobre) {
        // Pousa na superfície do apoio bem embaixo do ponto (na cama, o colchão, não a cabeceira).
        const apoio = objetos.get(o.sobre);
        scene.updateMatrixWorld(true);
        if (!pos) pos = [apoio.position.x, apoio.position.z];
        const [x, z] = pos.length === 2 ? pos : [pos[0], pos[2]];
        const raio = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const toque = raio.intersectObject(apoio, true)[0];
        base = toque ? toque.point.y : caixaDe(apoio).max.y;
        if (!toque) avisos.push(`${o.id ?? o.tipo}: o ponto [${x}, ${z}] fica fora de "${o.sobre}"; ficou na altura do topo dele`);
      }
      colocar(raiz, pos, o.giro, base, o.inclina);
      scene.add(raiz);
      objetos.set(raiz.name, raiz);
      if (o.id) entidades.push({ id: o.id, tipo: o.tipo, obj: raiz });
    }
    if (resto.length === pendentes.length) {
      avisos.push(`objetos com "sobre" em ciclo: ${resto.map(({ o }) => o.id ?? o.tipo).join(", ")}`);
      break;
    }
    pendentes = resto;
  }

  // Pessoas: corpo, pose, lugar no chão (ou no assento), mãos e olhar.
  const pessoas = new Map();
  const camPos = new THREE.Vector3(...(cena.camera?.posicao ?? [0, 1.5, 4]));
  (cena.pessoas ?? []).forEach((p, i) => {
    const corpo = criarCorpo({ tipo: p.corpo ?? "mulher", altura: p.altura, porte: p.porte, cabelo: p.cabelo, cores: contraste ? { ...CONTRASTE.pessoa, ...(p.cores ?? {}) } : p.cores });
    corpo.raiz.name = p.id ?? `pessoa${i + 1}`;
    const nomes = p.pose === undefined ? [] : Array.isArray(p.pose) ? p.pose : [p.pose];
    const composta = comporPoses(nomes.length ? nomes : p.sentar_em ? ["sentada"] : [], p.porte ?? 1);
    for (const [j, v] of Object.entries(composta.juntas)) definirJunta(corpo, j, v);
    for (const [j, v] of Object.entries(p.juntas ?? {})) definirJunta(corpo, j, v, avisos);
    // Pés levados a um ponto preso a uma junta (pernas cruzadas no chão), antes de pôr no chão.
    for (const [lado, { junta, ponto, dica }] of Object.entries(composta.pes)) {
      if (p.juntas?.[`coxa${lado}`] || p.juntas?.[`joelho${lado}`]) continue;
      corpo.raiz.updateWorldMatrix(true, true);
      // Pernas mais grossas: os pés (e com eles os joelhos) se afastam um pouco, para as coxas não se cruzarem.
      const localPe = new THREE.Vector3(...ponto.map((v) => v * corpo.medidas.H));
      localPe.x += (lado === "D" ? -1 : 1) * Math.max(0, corpo.medidas.raioCoxa - 0.058 * corpo.medidas.H) * 1.5;
      peEm(corpo, lado, corpo.juntas[junta].localToWorld(localPe).toArray(), dica);
      // O pé assenta reto no chão, salvo se a pose der o tornozelo (pés cruzados, deitados de lado).
      if (!composta.juntas[`tornozelo${lado}`] && !p.juntas?.[`tornozelo${lado}`]) {
        const pe = corpo.juntas[`tornozelo${lado}`];
        pe.rotation.set(0, 0, 0);
        corpo.raiz.updateWorldMatrix(true, true);
        const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(pe.getWorldQuaternion(new THREE.Quaternion()));
        pe.rotation.x = -Math.asin(Math.max(-1, Math.min(1, -frente.y)));
      }
    }
    // Pose com os pés inteiros no chão (agachada): a sola fica reta, de frente e de lado.
    if (composta.pesRetos) for (const l of ["E", "D"]) if (!p.juntas?.[`tornozelo${l}`]) peReto(corpo, l);
    if (!p.juntas?.pontaE && !p.juntas?.pontaD) assentarDedos(corpo);
    let posicao = p.posicao ?? [0, 0];
    let giro = p.giro ?? 0;
    const assento = p.sentar_em ? objetos.get(p.sentar_em) : null;
    let recuo = 0;
    if (assento) {
      const { assento: a } = OBJETOS[assento.userData.tipo];
      const prof = assento.userData.p.profundidade;
      // Senta o mais fundo que a coxa deixa (o joelho na borda); se o encosto ficar longe, o tronco
      // recosta até ele, como quem se ajeita num sofá fundo.
      recuo = Math.min(a.recuo, corpo.medidas.coxa - 0.01);
      if (a.encosto && !p.juntas?.pelve) {
        const folga = prof - a.encosto - recuo - 0.075 * corpo.medidas.H;
        if (folga > 0.02) {
          const recosta = Math.asin(Math.min(0.5, folga / (0.34 * corpo.medidas.H)));
          corpo.juntas.pelve.rotation.x -= recosta;
          // O olhar continua para a frente: o pescoço e a cabeça devolvem a inclinação.
          if (!p.juntas?.pescoco) corpo.juntas.pescoco.rotation.x += recosta * 0.5;
          if (!p.juntas?.cabeca) corpo.juntas.cabeca.rotation.x += recosta * 0.4;
        }
      }
      const frente = new THREE.Vector3(0, 0, prof / 2 - recuo).applyAxisAngle(new THREE.Vector3(0, 1, 0), assento.rotation.y);
      posicao = p.posicao ?? [assento.position.x + frente.x, assento.position.z + frente.z];
      giro = p.giro ?? assento.rotation.y / GRAU;
    }
    const base = posicao.length === 3 ? posicao[1] : 0;
    corpo.raiz.position.set(posicao[0], 0, posicao.length === 3 ? posicao[2] : posicao[1]);
    corpo.raiz.rotation.y = giro * GRAU;
    if (composta.deitada) {
      // Primeiro vira para o giro, depois deita de costas (rosto para cima, cabeça para −Z).
      corpo.raiz.rotation.order = "YXZ";
      corpo.raiz.rotation.x = -Math.PI / 2;
    }
    scene.add(corpo.raiz);
    scene.updateMatrixWorld(true);
    if (assento) {
      const a = OBJETOS[assento.userData.tipo].assento;
      const alturaAssento = assento.position.y + (typeof a.altura === "function" ? a.altura(assento.userData.p) : a.altura);
      const pelve = corpo.juntas.pelve.getWorldPosition(new THREE.Vector3());
      // A parte de baixo da coxa encosta no assento; os pés descem até o chão.
      corpo.raiz.position.y = alturaAssento - (pelve.y - corpo.medidas.raioCoxa);
      pesNoChao(corpo, assento.position.y, Object.keys(p.juntas ?? {}), recuo, 0.1);
    } else {
      // Os braços ainda não foram aos alvos (as mãos podem estar abaixo do quadril): pisa sem eles.
      const semBracos = new THREE.Box3();
      corpo.raiz.updateWorldMatrix(true, true);
      corpo.raiz.traverse((o) => {
        if (!o.isMesh) return;
        for (let q = o.parent; q && q !== corpo.raiz; q = q.parent) if (/^ombro[ED]$/.test(q.name)) return;
        semBracos.union(new THREE.Box3().setFromObject(o, true));
      });
      corpo.raiz.position.y = base - semBracos.min.y;
      // Deitada, as pernas descem até o calcanhar encostar no chão (os pés ficam em pé).
      if (composta.deitada) {
        for (const l of ["E", "D"]) {
          if (p.juntas?.[`coxa${l}`]) continue;
          for (let i = 0; i < 30; i++) {
            corpo.raiz.updateWorldMatrix(true, true);
            const calcanhar = new THREE.Box3().setFromObject(corpo.juntas[`tornozelo${l}`], true).min.y;
            if (calcanhar - base < 0.004) break;
            corpo.juntas[`coxa${l}`].rotation.x += GRAU;
          }
        }
        corpo.raiz.updateWorldMatrix(true, true);
      }
    }
    // Pernas que a pose já levou a um ponto (pes) não passam pelo ajuste da perna cruzada.
    separarPernas(corpo, [...Object.keys(p.juntas ?? {}), ...Object.keys(composta.pes).map((l) => `coxa${l}`)]);
    const alvos = { ...composta.alvos };
    const giros = {};
    // Segurar um objeto posicionado: a mão vai até ele, envolvendo-o pelo lado do ombro, com a palma
    // virada para ele e o polegar para o topo.
    const segura = {};
    for (const { o, i: k } of lista.filter(({ o }) => o.na_mao?.pessoa === corpo.raiz.name && !preso(o))) {
      const obj = objetos.get(o.id ?? `${o.tipo}${k}`);
      if (!obj) continue;
      const lado = o.na_mao.lado;
      scene.updateMatrixWorld(true);
      const centro = caixaDe(obj).getCenter(new THREE.Vector3());
      const ombro = corpo.juntas[`braco${lado}`].getWorldPosition(new THREE.Vector3());
      const { largura = 0.05, profundidade = largura } = obj.userData.p;
      const qObj = obj.getWorldQuaternion(new THREE.Quaternion());
      // Objeto chato: a palma deita na face larga (no celular, nas costas, com a tela para quem segura).
      let face = null;
      let r = largura / 2;
      if (profundidade < largura * 0.5) {
        const z = new THREE.Vector3(0, 0, 1).applyQuaternion(qObj);
        // "costas" (celular): a palma fica do lado oposto ao rosto de quem segura, qualquer que seja o
        // giro do objeto; nos outros, do lado do ombro.
        const de = OBJETOS[o.tipo].naMao?.palma === "costas" ? pontoDoRosto(corpo).sub(centro) : centro.clone().sub(ombro);
        face = z.multiplyScalar(Math.sign(z.dot(de)) || 1).toArray();
        r = profundidade / 2;
      }
      composta.alvos[lado] = undefined;
      segura[lado] = { centro, raio: r, face, dedosAoLongo: OBJETOS[o.tipo].naMao?.dedos === "ao_longo", topo: new THREE.Vector3(0, 1, 0).applyQuaternion(qObj).toArray() };
    }
    // Braço que a cena ajustou junta a junta não vai ao alvo da pose (a cena manda).
    for (const lado of ["E", "D"]) if (p.juntas?.[`braco${lado}`] || p.juntas?.[`cotovelo${lado}`]) delete alvos[lado];
    for (const lado of Object.keys(segura)) delete alvos[lado];
    for (const [lado, { junta, ponto, gira }] of Object.entries(alvos)) {
      if (gira) giros[lado] = gira;
      const local = new THREE.Vector3(...ponto.map((v) => v * corpo.medidas.H));
      // Mão sobre a coxa: o ponto sobe com a grossura da coxa (no porte maior, a mão não entra nela).
      // Ponto no tronco: acompanha a largura do corpo (na magra, a mão na cintura encosta nela).
      // Perto do tronco, o ponto escala com o corpo; longe dele (braço esticado, selfie), só anda o
      // tanto que o tronco cresceu (a mão não pode ir mais longe que o braço alcança).
      if (["pelve", "cintura", "peito"].includes(junta)) {
        const H = corpo.medidas.H;
        const ajusta = (v, fator, borda) => (Math.abs(v) <= borda ? v * fator : v + Math.sign(v) * borda * (fator - 1));
        local.x = ajusta(local.x, corpo.medidas.largo, 0.12 * H);
        local.z = ajusta(local.z, corpo.medidas.largo ** 1.5, 0.1 * H);
      }
      const extra = corpo.medidas.raioCoxa - 0.058 * corpo.medidas.H;
      if (junta.startsWith("coxa")) local.z += extra;
      // Mão sobre o joelho: sobe e vai para fora com a grossura da perna.
      if (junta.startsWith("joelho")) {
        local.z += extra;
        local.x += (lado === "D" ? -1 : 1) * extra * 1.6;
      }
      // Mãos à frente do colo (palma para cima): sobem com a grossura da coxa, por cima das pernas.
      if (junta === "pelve" && gira) local.y += 1.4 * (corpo.medidas.raioCoxa - 0.058 * corpo.medidas.H);
      const mundo = corpo.juntas[junta].localToWorld(local);
      alvos[lado] = mundo.toArray();
    }

    // alcancar: a mão apoia ali, de palma para baixo, por cima da superfície (não entra nela).
    const apoios = new Set();
    for (const [lado, a] of Object.entries(p.alcancar ?? {})) {
      apoios.add(lado);
      if (typeof a === "string") {
        const cx = caixaDe(objetos.get(a));
        alvos[lado] = [(cx.min.x + cx.max.x) / 2, cx.max.y + 0.02 * corpo.medidas.H, (cx.min.z + cx.max.z) / 2];
      } else alvos[lado] = [a[0], a[1] + 0.02 * corpo.medidas.H, a[2]];
    }
    for (const [lado, alvo] of Object.entries(alvos)) {
      const falta = maoEm(corpo, lado, alvo);
      // Antebraço girado depois de a mão chegar: a palma vira (para cima, com gira positivo).
      if (giros[lado]) corpo.juntas[`cotovelo${lado}`].rotation.y = (lado === "D" ? -1 : 1) * giros[lado] * GRAU;
      if (apoios.has(lado)) palmaParaBaixo(corpo, lado);

      if (falta > 0.03) avisos.push(`${corpo.raiz.name}: a mão ${lado === "E" ? "esquerda" : "direita"} não alcança o ponto (faltam ${falta.toFixed(2)} m)`);
    }
    // Braço que entra no corpo (na coxa, na barriga, na cabeça) sai sozinho; o que sobrar vira aviso.
    // Pose com corrigirColisao: false (braços cruzados, em que o braço encosta no corpo de propósito)
    // não passa pelo detector: nem corrige nem avisa.
    const restos = composta.corrigirColisao ? soltarBracos(corpo, alvos, Object.keys(p.juntas ?? {})) : [];
    for (const [lado, g] of Object.entries(giros)) corpo.juntas[`cotovelo${lado}`].rotation.y = (lado === "D" ? -1 : 1) * g * GRAU;
    for (const lado of apoios) palmaParaBaixo(corpo, lado);
    // Mão que segura um objeto: encaixa pela palma (depois da correção dos outros braços).
    for (const [lado, sg] of Object.entries(segura)) {
      const { falta, punho, fora } = segurarObjeto(corpo, lado, sg.centro.toArray(), sg.topo, sg.raio, sg.face, sg.dedosAoLongo);
      const mao = lado === "E" ? "mão esquerda" : "mão direita";
      const quem = corpo.raiz.name;
      if (falta > 0.03) avisos.push(`${quem}: a ${mao} não alcança o objeto (faltam ${falta.toFixed(2)} m)`);
      // Os limites do punho limitam onde o objeto pode ficar: além deles, a mão encosta sem ficar paralela.
      if (Math.abs(punho.dobra) > MAX_PUNHO.dobra + 1) avisos.push(`${quem}: para segurar o objeto, a ${mao} precisaria dobrar o punho ${Math.round(Math.abs(punho.dobra))}° (limite ${MAX_PUNHO.dobra}°); mude a posição, o giro ou a inclinação do objeto`);
      if (Math.abs(punho.desvia) > MAX_PUNHO.desvia + 1) avisos.push(`${quem}: para segurar o objeto, a ${mao} precisaria desviar o punho para o lado ${Math.round(Math.abs(punho.desvia))}° (limite ${MAX_PUNHO.desvia}°); mude a posição, o giro ou a inclinação do objeto`);
      if (fora.comprimento > 8) avisos.push(`${quem}: a palma da ${mao} perdeu o paralelismo com o objeto no eixo do comprimento da mão (${Math.round(fora.comprimento)}° tombada para o lado)`);
      if (fora.largura > 8) avisos.push(`${quem}: a palma da ${mao} perdeu o paralelismo com o objeto no eixo da largura da mão (${Math.round(fora.largura)}° tombada para os dedos ou o pulso)`);
    }
    // A cinemática endireita o punho: o ajuste do punho (da pose ou da cena) volta depois dela.
    for (const lado of ["E", "D"]) {
      const v = p.juntas?.[`punho${lado}`] ?? composta.juntas[`punho${lado}`];
      if (v && alvos[lado] && !apoios.has(lado)) definirJunta(corpo, `punho${lado}`, v);
    }
    for (const r of restos) avisos.push(avisoDeColisao(corpo.raiz.name, r));
    // Mão apoiada numa superfície fica espalmada (dedos curvos entrariam nela).
    const maos = { ...composta.maos, ...Object.fromEntries([...apoios].map((l) => [l, { curvar: 0.04, polegar: 0.1, abrir: 0.15 }])), ...Object.fromEntries(Object.keys(segura).map((l) => [l, "segurando"])), ...(p.maos ?? {}) };
    pessoas.set(corpo.raiz.name, { corpo, maos, olhar: p.olhar ?? composta.olhar, explicitas: p.maos ?? {} });
    entidades.push({ id: corpo.raiz.name, tipo: "pessoa", obj: corpo.raiz, corpo });
  });

  // Objetos na mão: presos à palma, com o eixo do objeto saindo do lado do polegar.
  for (const { o, i } of lista.filter(({ o }) => preso(o))) {
    const dono = pessoas.get(o.na_mao.pessoa);
    const raiz = criarObjeto(o, i);
    const { corpo } = dono;
    const s = o.na_mao.lado === "D" ? -1 : 1;
    const H = corpo.medidas.H;
    const ancora = new THREE.Group();
    ancora.position.set(-s * (0.0105 * H + raiz.userData.p.largura / 2), -corpo.medidas.palma * 0.62, 0.004 * H);
    ancora.rotation.set(Math.PI / 2, 0, 0);
    if (o.giro_na_mao) ancora.rotation.set(Math.PI / 2 + o.giro_na_mao[0] * GRAU, o.giro_na_mao[1] * GRAU, o.giro_na_mao[2] * GRAU);
    raiz.position.set(0, -raiz.userData.p.altura * 0.45, 0);
    // Objeto que tem lado certo na mão (a tela do celular para quem segura) gira no próprio eixo.
    if (OBJETOS[o.tipo].naMao?.giro) raiz.rotation.y = OBJETOS[o.tipo].naMao.giro * GRAU;
    ancora.add(raiz);
    corpo.juntas[`mao${o.na_mao.lado}`].add(ancora);
    objetos.set(raiz.name, raiz);
    if (!dono.explicitas[o.na_mao.lado]) dono.maos[o.na_mao.lado] = "segurando";
    if (o.id) entidades.push({ id: o.id, tipo: o.tipo, obj: raiz });
  }
  for (const { corpo, maos } of pessoas.values()) {
    for (const lado of ["E", "D"]) definirJunta(corpo, `mao${lado}`, typeof maos[lado] === "string" ? MAOS[maos[lado]] : maos[lado] ?? MAOS.relaxada);
  }
  scene.updateMatrixWorld(true);
  for (const { corpo, olhar } of pessoas.values()) {
    if (olhar === undefined) continue;
    let alvo;
    if (olhar === "camera") alvo = camPos;
    else if (/^mao[ED]$/.test(olhar)) {
      // Olha para o que a mão segura, ou para a própria mão.
      const lado = olhar.slice(-1);
      const segurado = lista.find(({ o }) => o.na_mao?.pessoa === corpo.raiz.name && o.na_mao.lado === lado);
      const obj = segurado ? objetos.get(segurado.o.id ?? `${segurado.o.tipo}${segurado.i}`) : null;
      alvo = obj ? caixaDe(obj).getCenter(new THREE.Vector3()) : corpo.juntas[`mao${lado}`].getWorldPosition(new THREE.Vector3());
    }
    else if (Array.isArray(olhar)) alvo = new THREE.Vector3(...olhar);
    else if (pessoas.has(olhar)) alvo = pontoDoRosto(pessoas.get(olhar).corpo);
    else alvo = caixaDe(objetos.get(olhar)).getCenter(new THREE.Vector3());
    olharPara(corpo, alvo.toArray());
  }
  scene.updateMatrixWorld(true);

  // Câmera.
  const c = cena.camera;
  const camera = new THREE.PerspectiveCamera(campoVertical(c.lente ?? 26, largura, altura), largura / altura, 0.02, 1500);
  camera.position.copy(camPos);
  let alvo;
  if (Array.isArray(c.alvo)) alvo = new THREE.Vector3(...c.alvo);
  else if (pessoas.has(c.alvo)) alvo = pontoDoRosto(pessoas.get(c.alvo).corpo);
  else alvo = caixaDe(objetos.get(c.alvo)).getCenter(new THREE.Vector3());
  camera.lookAt(alvo);
  if (c.rolar) camera.rotateZ(-c.rolar * GRAU);
  camera.updateMatrixWorld(true);

  // Luz com a sombra cobrindo o que está perto do alvo.
  const foco = new THREE.Sphere(alvo.clone(), Math.max(3, camPos.distanceTo(alvo) * 1.2));
  luzes(scene, cena.luz ?? {}, foco);

  const corpos = Object.fromEntries([...pessoas].map(([id, { corpo }]) => [id, corpo]));
  return { scene, camera, avisos, corpos, relatorio: relatorio(entidades, camera, avisos, c.lente ?? 26) };
}

/** Onde cada coisa com id caiu no quadro, em % (0 a 100), e o que ficou cortado. */
function relatorio(entidades, camera, avisos, lente) {
  const itens = entidades.map(({ id, tipo, obj, corpo }) => {
    const cx = caixaDe(obj);
    const pts = [];
    let atras = 0;
    for (const x of [cx.min.x, cx.max.x]) for (const y of [cx.min.y, cx.max.y]) for (const z of [cx.min.z, cx.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      if (v.z > 1) atras++;
      pts.push(v);
    }
    const xs = pts.map((v) => (v.x + 1) * 50);
    const ys = pts.map((v) => (1 - v.y) * 50);
    const caixaTela = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const [x0, y0, x1, y1] = caixaTela;
    const visivel = atras < 8 && x1 > 0 && x0 < 100 && y1 > 0 && y0 < 100;
    const item = { id, tipo };
    if (!visivel) return { ...item, visivel: false };
    const r = (n) => Math.round(Math.min(100, Math.max(0, n)));
    item.quadro = { esquerda: r(x0), topo: r(y0), direita: r(x1), base: r(y1) };
    item.altura_no_quadro = r(y1) - r(y0);
    const cortado = [];
    if (y0 < 0) cortado.push("topo");
    if (y1 > 100) cortado.push("base");
    if (x0 < 0) cortado.push("esquerda");
    if (x1 > 100) cortado.push("direita");
    if (cortado.length) item.cortado = cortado;
    if (corpo) {
      const rosto = pontoDoRosto(corpo);
      const praCamera = camera.position.clone().sub(rosto).normalize();
      const angulo = Math.acos(Math.max(-1, Math.min(1, direcaoDoRosto(corpo).dot(praCamera)))) / GRAU;
      item.rosto = angulo < 35 ? "de frente" : angulo < 70 ? "três quartos" : angulo < 120 ? "de perfil" : "de costas";
      const v = rosto.clone().project(camera);
      item.rosto_no_quadro = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 ? { x: r((v.x + 1) * 50), y: r((1 - v.y) * 50) } : null;
    }
    return item;
  });
  return { lente, campo_vertical: Math.round(camera.fov), itens, ...(avisos.length ? { avisos } : {}) };
}
