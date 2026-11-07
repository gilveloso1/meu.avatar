// O corpo da maquete: um manequim de proporção humana real, com esqueleto articulado.
//
// Convenções (valem para toda a cena3d): metros; pés no chão em y = 0; a pessoa olha para +Z
// (para a câmera padrão); o lado esquerdo dela (E) fica em +X e o direito (D) em -X.
// Cada junta recebe ângulos em graus com nomes do corpo, não de eixo:
//   tronco (pelve, cintura, peito, pescoco, cabeca): dobra (+ para a frente), gira (+ para a
//     esquerda dela), inclina (+ para o lado esquerdo dela);
//   ombro: eleva, avanca; braco e coxa: dobra (+ para a frente), abre (+ para fora), gira (+ para fora);
//   cotovelo e joelho: dobra (0 = esticado); punho: dobra (+ para a palma), desvia;
//   tornozelo: aponta (+ ponta do pé para baixo); ponta: dobra (dedos do pé para cima);
//   mao: curvar (0 a 1, os quatro dedos), polegar (0 a 1), abrir (0 a 1), ou dedos um a um.
import * as THREE from "three";
import { GRAU, bloco, capsula, elipsoide, malha, material, membro, tronco } from "./geo.js";

/** Os tipos de corpo, com a altura padrão em metros. */
export const CORPOS = { mulher: 1.65, homem: 1.78, crianca: 1.25 };
export const CABELOS = ["curto", "longo", "preso", "careca"];

export const LIMITES = {
  pelve: { dobra: [-40, 100], gira: [-180, 180], inclina: [-40, 40] },
  cintura: { dobra: [-30, 60], gira: [-45, 45], inclina: [-35, 35] },
  peito: { dobra: [-25, 45], gira: [-40, 40], inclina: [-30, 30] },
  pescoco: { dobra: [-40, 45], gira: [-50, 50], inclina: [-35, 35] },
  cabeca: { dobra: [-35, 40], gira: [-40, 40], inclina: [-25, 25] },
  ombro: { eleva: [-10, 35], avanca: [-20, 30] },
  braco: { dobra: [-60, 180], abre: [-30, 180], gira: [-90, 90] },
  cotovelo: { dobra: [0, 150], gira: [-90, 90] },
  punho: { dobra: [-70, 80], desvia: [-25, 35] },
  coxa: { dobra: [-30, 130], abre: [-30, 80], gira: [-45, 45] },
  joelho: { dobra: [0, 155] },
  tornozelo: { aponta: [-30, 90] },
  ponta: { dobra: [-20, 60] },
};
export const JUNTAS = [
  "pelve", "cintura", "peito", "pescoco", "cabeca",
  "ombroE", "bracoE", "cotoveloE", "punhoE", "maoE",
  "ombroD", "bracoD", "cotoveloD", "punhoD", "maoD",
  "coxaE", "joelhoE", "tornozeloE", "pontaE",
  "coxaD", "joelhoD", "tornozeloD", "pontaD",
];
export const DEDOS = ["polegar", "indicador", "medio", "anelar", "minimo"];

/** O tipo da junta (sem o lado) e os nomes que ela aceita. */
export function tipoDaJunta(nome) {
  if (nome.startsWith("mao")) return "mao";
  return nome.replace(/[ED]$/, "");
}
export function valoresDaJunta(nome) {
  const tipo = tipoDaJunta(nome);
  return tipo === "mao" ? ["curvar", "polegar", "abrir", ...DEDOS] : Object.keys(LIMITES[tipo] ?? {});
}

/** Medidas em metros a partir das frações de altura de cada tipo de corpo. */
function medidas(tipo, H, porte) {
  const f = tipo === "mulher";
  const c = tipo === "crianca";
  const largo = porte;
  // A cabeça quase não muda com a altura (no corpo real, quem é alto tem a perna mais comprida,
  // não a cabeça maior): ela cresce na raiz cúbica da altura, e as pernas ficam com a diferença.
  const padrao = CORPOS[tipo] ?? H;
  const fracCabeca = c ? 0.085 : 0.066;
  const cabeca = fracCabeca * padrao * (H / padrao) ** 0.35;
  const sobra = 2.02 * (fracCabeca * H - cabeca);
  return {
    H,
    tornozelo: 0.045 * H,
    coxa: (c ? 0.225 : 0.235) * H + sobra / 2,
    canela: (c ? 0.22 : 0.24) * H + sobra / 2,
    quadril: (f ? 0.052 : 0.05) * H * largo ** 0.6,
    cintura: 0.08 * H,
    peito: 0.1 * H,
    pescoco: (c ? 0.105 : 0.115) * H,
    cabecaBase: (c ? 0.03 : 0.042) * H,
    cabeca,
    ombroX: (f ? 0.105 : c ? 0.1 : 0.118) * H * largo ** 0.45,
    ombroY: (c ? 0.09 : 0.105) * H,
    braco: (c ? 0.165 : 0.172) * H,
    antebraco: (c ? 0.135 : 0.148) * H,
    palma: 0.058 * H,
    dedo: 0.045 * H,
    feminino: f,
    crianca: c,
    largo,
  };
}

function grupo(pai, nome, x = 0, y = 0, z = 0, ordem = "YXZ") {
  const g = new THREE.Group();
  g.name = nome;
  g.position.set(x, y, z);
  g.rotation.order = ordem;
  pai.add(g);
  return g;
}

/**
 * Monta o corpo. Devolve { raiz, juntas, medidas, pele, roupa }: raiz é o grupo a posicionar na
 * cena; juntas, os grupos de cada articulação pelo nome.
 */
export function criarCorpo({ tipo = "mulher", altura, porte = 1, cabelo, cores = {} } = {}) {
  const H = altura ?? CORPOS[tipo] ?? 1.65;
  const m = medidas(tipo, H, porte);
  const pele = material(cores.pele ?? "#c9b6a4");
  const roupa = material(cores.roupa ?? "#8c9097");
  const calca = material(cores.calca ?? cores.roupa ?? "#6f747c");
  const fio = material(cores.cabelo ?? "#3a2e28");
  const sapato = material(cores.sapato ?? "#55504b");
  const raiz = new THREE.Group();
  raiz.name = "pessoa";
  const j = {};

  // Tronco: pelve na altura do quadril, de onde sobem a cintura, o peito, o pescoço e a cabeça.
  const alturaQuadril = m.tornozelo + m.canela + m.coxa;
  j.pelve = grupo(raiz, "pelve", 0, alturaQuadril, 0);
  // O tronco em três segmentos torneados que se encaixam nas juntas (sem fresta em pé).
  const L = (pts) => pts.map(([y, r]) => [y * H, r * H * m.largo]);
  const perfis = m.feminino
    ? { pelve: [[-0.072, 0.015], [-0.062, 0.058], [-0.035, 0.088], [0, 0.099], [0.04, 0.093], [0.08, 0.079]], cintura: [[0, 0.079], [0.035, 0.072], [0.07, 0.077], [0.1, 0.085]], peito: [[0, 0.085], [0.04, 0.09], [0.075, 0.088], [0.1, 0.072], [0.112, 0.045], [0.118, 0.02]] }
    : { pelve: [[-0.07, 0.015], [-0.06, 0.056], [-0.035, 0.083], [0, 0.091], [0.04, 0.088], [0.08, 0.085]], cintura: [[0, 0.085], [0.05, 0.083], [0.1, 0.093]], peito: [[0, 0.093], [0.04, 0.105], [0.08, 0.108], [0.1, 0.088], [0.112, 0.05], [0.118, 0.022]] };
  if (m.crianca) for (const k of Object.keys(perfis)) perfis[k] = perfis[k].map(([y, r]) => [y, r * 0.92]);
  // O porte muda mais a frente e as costas do que a largura (a gordura vai para a barriga).
  const fundo = m.largo ** 0.7;
  j.pelve.add(tronco(L(perfis.pelve), calca, 0.66 * fundo));
  j.cintura = grupo(j.pelve, "cintura", 0, m.cintura, 0);
  j.cintura.add(tronco(L(perfis.cintura), roupa, 0.62 * fundo));
  const juntaCintura = elipsoide(perfis.cintura[0][1] * H * m.largo, 0.02 * H, perfis.cintura[0][1] * H * m.largo * 0.62 * fundo, roupa);
  j.cintura.add(juntaCintura);
  if (m.largo > 1.04) {
    // Barriga: volume na frente da cintura e do baixo ventre, que cresce com o porte.
    const extra = m.largo - 1;
    const rb0 = perfis.cintura[1][1] * H * m.largo;
    const barriga = elipsoide(rb0 * 0.85, 0.075 * H, 0.055 * H * (0.6 + extra * 1.6), roupa);
    barriga.position.set(0, 0.015 * H, rb0 * 0.62 * fundo - 0.03 * H);
    j.cintura.add(barriga);
    const ventre = elipsoide(rb0 * 0.8, 0.05 * H, 0.05 * H * (0.6 + extra * 1.4), calca);
    ventre.position.set(0, -0.035 * H, rb0 * 0.6 * fundo - 0.03 * H);
    j.cintura.add(ventre);
  }
  j.peito = grupo(j.cintura, "peito", 0, m.peito, 0);
  j.peito.add(tronco(L(perfis.peito), roupa, 0.62 * m.largo ** 0.5));
  const juntaPeito = elipsoide(perfis.peito[0][1] * H * m.largo, 0.02 * H, perfis.peito[0][1] * H * m.largo * 0.64 * m.largo ** 0.5, roupa);
  j.peito.add(juntaPeito);
  if (m.feminino && !m.crianca) {
    const frente = 0.09 * H * m.largo * 0.62 * m.largo ** 0.5;
    for (const s of [1, -1]) {
      const busto = elipsoide(0.033 * H * m.largo, 0.029 * H * m.largo ** 0.8, 0.022 * H * m.largo, roupa);
      busto.position.set(s * 0.04 * H * m.largo ** 0.8, 0.046 * H, frente - 0.012 * H);
      j.peito.add(busto);
    }
  }
  j.pescoco = grupo(j.peito, "pescoco", 0, m.pescoco, -0.006 * H);
  const colo = capsula((m.feminino ? 0.026 : 0.031) * H * m.largo ** 0.8, 0.07 * H, pele);
  colo.position.y = 0.025 * H;
  j.pescoco.add(colo);
  j.cabeca = grupo(j.pescoco, "cabeca", 0, m.cabecaBase, 0.004 * H);
  const r = m.cabeca;
  const cranio = elipsoide(r * 0.69, r, r * 0.86, pele, 32);
  cranio.position.set(0, r * 1.02, r * 0.06);
  j.cabeca.add(cranio);
  const queixo = elipsoide(r * 0.5 * m.largo ** 0.9, r * 0.45, r * 0.5 * m.largo ** 0.5, pele);
  queixo.position.set(0, r * 0.5, r * 0.26);
  j.cabeca.add(queixo);
  const nariz = malha(new THREE.ConeGeometry(r * 0.12, r * 0.3, 10), pele);
  nariz.rotation.x = Math.PI / 2;
  nariz.position.set(0, r * 0.95, r * 0.9);
  j.cabeca.add(nariz);
  for (const s of [1, -1]) {
    const orelha = elipsoide(r * 0.07, r * 0.2, r * 0.14, pele, 12);
    orelha.position.set(s * r * 0.69, r * 0.98, 0);
    j.cabeca.add(orelha);
  }
  const estilo = cabelo ?? (tipo === "homem" ? "curto" : tipo === "mulher" ? "longo" : "curto");
  if (estilo !== "careca") {
    // Calota que desce mais atrás (nuca) do que na frente (testa).
    const topo = malha(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), fio);
    topo.scale.set(r * 0.74, r * 1.05, r * 0.92);
    topo.position.set(0, r * 1.08, r * 0.02);
    topo.rotation.x = -0.5;
    j.cabeca.add(topo);
    if (estilo === "longo") {
      const costas = elipsoide(r * 0.72, r * 1.25, r * 0.42, fio);
      costas.position.set(0, r * 0.35, -r * 0.5);
      j.cabeca.add(costas);
    } else if (estilo === "preso") {
      const coque = elipsoide(r * 0.32, r * 0.3, r * 0.3, fio);
      coque.position.set(0, r * 1.75, -r * 0.62);
      j.cabeca.add(coque);
    }
  }

  // Braços: ombro (clavícula) no peito, braço, cotovelo, punho e mão com dedos.
  for (const [lado, s] of [["E", 1], ["D", -1]]) {
    const ombro = grupo(j.peito, `ombro${lado}`, s * 0.025 * H, m.ombroY, -0.006 * H);
    j[`ombro${lado}`] = ombro;
    const braco = grupo(ombro, `braco${lado}`, s * (m.ombroX - 0.025 * H), 0, 0, "XZY");
    j[`braco${lado}`] = braco;
    const rb = (m.feminino ? 0.027 : 0.031) * H * m.largo ** 1.3;
    m.raioBraco = rb;
    // Clavícula e trapézio: liga a base do pescoço ao ombro, para a linha do ombro ser contínua.
    const clavicula = capsula(rb * 0.95, m.ombroX - 0.02 * H, roupa);
    clavicula.position.set(s * (m.ombroX - 0.025 * H) / 2, -0.004 * H, 0);
    clavicula.rotation.z = s * Math.PI / 2;
    clavicula.position.y = -0.004 * H;
    ombro.add(clavicula);
    braco.add(elipsoide(rb * 1.05, rb * 1.05, rb * 1.0, roupa));
    braco.add(membro([[0, rb], [0.35, rb * 0.98], [0.8, rb * 0.78], [1, rb * 0.7]], m.braco, roupa));
    const cotovelo = grupo(braco, `cotovelo${lado}`, 0, -m.braco, 0, "XYZ");
    j[`cotovelo${lado}`] = cotovelo;
    const ra = (m.feminino ? 0.027 : 0.031) * H * 0.72 * m.largo ** 0.9;
    m.raioAntebraco = ra;
    cotovelo.add(membro([[0, ra], [0.25, ra * 1.08], [1, ra * 0.68]], m.antebraco, pele, 0.85));
    const punho = grupo(cotovelo, `punho${lado}`, 0, -m.antebraco, 0, "XZY");
    j[`punho${lado}`] = punho;
    j[`mao${lado}`] = criarMao(punho, s, m, pele);
  }

  // Pernas: coxa, joelho, tornozelo e a ponta do pé.
  for (const [lado, s] of [["E", 1], ["D", -1]]) {
    // No corpo magro, a perna sai um pouco mais baixo da pelve (a virilha não fica alta).
    const coxa = grupo(j.pelve, `coxa${lado}`, s * m.quadril, -0.04 * H * Math.max(0, 1 - m.largo), 0, "XZY");
    j[`coxa${lado}`] = coxa;
    const rc = (m.feminino ? 0.058 : 0.055) * H * m.largo ** 1.25;
    m.raioCoxa = rc;
    coxa.add(membro([[0, rc], [0.3, rc * 0.94], [0.75, rc * 0.72], [1, rc * 0.6]], m.coxa, calca));
    const joelho = grupo(coxa, `joelho${lado}`, 0, -m.coxa, 0, "XYZ");
    j[`joelho${lado}`] = joelho;
    const rj = (m.feminino ? 0.058 : 0.055) * H * 0.6 * m.largo ** 0.95;
    joelho.add(membro([[0, rj], [0.25, rj * 1.12], [0.85, rj * 0.62], [1, rj * 0.58]], m.canela, calca, 0.92));
    const tornozelo = grupo(joelho, `tornozelo${lado}`, 0, -m.canela, 0, "XYZ");
    j[`tornozelo${lado}`] = tornozelo;
    const pe = bloco(0.055 * H, 0.036 * H, 0.122 * H, sapato, 0.012 * H);
    pe.position.set(0, -0.027 * H, 0.03 * H);
    tornozelo.add(pe);
    const ponta = grupo(tornozelo, `ponta${lado}`, 0, -0.033 * H, 0.091 * H, "XYZ");
    j[`ponta${lado}`] = ponta;
    const dedos = bloco(0.054 * H, 0.022 * H, 0.04 * H, sapato, 0.009 * H);
    dedos.position.set(0, -0.001 * H, 0.016 * H);
    ponta.add(dedos);
  }

  return { raiz, juntas: j, medidas: m, tipo };
}

/** A mão: palma e cinco dedos de três falanges. Devolve o grupo da mão, com os dedos em userData. */
function criarMao(punho, s, m, pele) {
  const H = m.H;
  const mao = grupo(punho, punho.name.replace("punho", "mao"), 0, 0, 0, "XYZ");
  const palma = bloco(0.021 * H, m.palma, 0.05 * H, pele, 0.008 * H);
  palma.position.set(0, -m.palma / 2, 0);
  mao.add(palma);
  const dedos = {};
  const base = { indicador: 0.017, medio: 0.0055, anelar: -0.0058, minimo: -0.0165 };
  const tamanho = { indicador: 0.93, medio: 1, anelar: 0.95, minimo: 0.76 };
  for (const nome of ["indicador", "medio", "anelar", "minimo"]) {
    const falanges = [];
    let pai = grupo(mao, `${nome}`, 0, -m.palma + 0.002 * H, base[nome] * H, "XYZ");
    const total = m.dedo * tamanho[nome];
    for (const [i, parte] of [0.45, 0.31, 0.24].entries()) {
      if (i > 0) pai = grupo(pai, `${nome}${i}`, 0, -total * [0.45, 0.31][i - 1], 0, "XYZ");
      pai.add(capsula(0.0057 * H * (1 - i * 0.12), total * parte + 0.003 * H, pele));
      falanges.push(pai);
    }
    dedos[nome] = falanges;
  }
  // O polegar sai da frente da palma, junto do punho, para baixo e para a frente.
  const falangesPolegar = [];
  // Medidas da anatomia (frações da altura): metacarpo 0,027 (quase todo dentro da palma, saindo do
  // punho), falange de cima 0,018 e ponta 0,014. Fechado, a ponta pousa sobre o indicador e o médio.
  let pai = grupo(mao, "polegar", -s * 0.002 * H, -0.006 * H, 0.015 * H, "XYZ");
  pai.rotation.set(-0.55, 0, -s * 0.25);
  for (const [i, comp] of [0.027, 0.018, 0.014].entries()) {
    if (i > 0) pai = grupo(pai, `polegar${i}`, 0, -[0.027, 0.018][i - 1] * H, 0, "XYZ");
    pai.add(capsula(0.0068 * H * (1 - i * 0.1), comp * H + 0.003 * H, pele));
    falangesPolegar.push(pai);
  }
  dedos.polegar = falangesPolegar;
  mao.userData = { dedos, lado: s, repousoPolegar: falangesPolegar[0].rotation.clone() };
  return mao;
}

const limita = (v, [a, b]) => Math.min(b, Math.max(a, v));

/**
 * Põe os ângulos numa junta. valores é {dobra, abre, ...} em graus (mão: 0 a 1). Valores fora do
 * limite do corpo são cortados; os avisos voltam na lista.
 */
export function definirJunta(corpo, nome, valores, avisos = []) {
  const g = corpo.juntas[nome];
  if (!g) return avisos;
  const tipo = tipoDaJunta(nome);
  const s = nome.endsWith("D") ? -1 : 1;
  if (tipo === "mao") return definirMao(g, valores), avisos;
  const lim = LIMITES[tipo];
  // Corpo mais largo afasta os braços do tronco (senão eles entram na cintura).
  if (tipo === "braco" && corpo.medidas.largo > 1) valores = { ...valores, abre: (valores.abre ?? 0) + (corpo.medidas.largo - 1) * 18 };
  const v = {};
  for (const [chave, bruto] of Object.entries(valores)) {
    if (!lim[chave]) continue;
    v[chave] = limita(bruto, lim[chave]);
    if (v[chave] !== bruto) avisos.push(`${nome}.${chave}: ${bruto} passou do limite do corpo (${lim[chave].join(" a ")}); ficou ${v[chave]}`);
  }
  const a = (k) => (v[k] ?? 0) * GRAU;
  switch (tipo) {
    case "pelve":
    case "cintura":
    case "peito":
    case "pescoco":
    case "cabeca":
      g.rotation.set(a("dobra"), a("gira"), a("inclina"));
      break;
    case "ombro":
      g.rotation.set(0, -s * a("avanca"), s * a("eleva"));
      break;
    case "braco":
    case "coxa":
      g.rotation.set(-a("dobra"), s * a("gira"), s * a("abre"));
      break;
    case "cotovelo":
      g.rotation.set(-a("dobra"), s * a("gira"), 0);
      break;
    case "joelho":
      g.rotation.set(a("dobra"), 0, 0);
      break;
    case "punho":
      g.rotation.set(-a("desvia"), 0, -s * a("dobra"));
      break;
    case "tornozelo":
      g.rotation.set(a("aponta"), 0, 0);
      break;
    case "ponta":
      g.rotation.set(-a("dobra"), 0, 0);
      break;
  }
  return avisos;
}

const CURVA = [72, 92, 62];
function definirMao(mao, v) {
  const { dedos, lado: s, repousoPolegar } = mao.userData;
  const curvar = limita(v.curvar ?? 0.15, [0, 1]);
  const abrir = limita(v.abrir ?? 0, [0, 1]);
  for (const [i, nome] of ["indicador", "medio", "anelar", "minimo"].entries()) {
    const c = limita(v[nome] ?? curvar, [0, 1]);
    const espalha = (1.5 - i) * 7 * abrir * GRAU;
    dedos[nome].forEach((f, k) => f.rotation.set(k === 0 ? espalha : 0, 0, -s * CURVA[k] * c * GRAU));
  }
  const p = limita(v.polegar ?? curvar * 0.6, [0, 1]);
  // Fechar o polegar é cruzá-lo pela palma, na direção do dedo mínimo, e dobrar as pontas por
  // cima dos dedos: a base varre para trás (X) e entra na palma (Z); as falanges dobram para dentro.
  dedos.polegar[0].rotation.set(repousoPolegar.x + p * 0.8, 0, repousoPolegar.z - s * p * 0.2);
  dedos.polegar[1].rotation.set(p * 0.6, 0, -s * p * 0.15);
  dedos.polegar[2].rotation.set(p * 0.5, 0, -s * p * 0.15);
}

const v3 = () => new THREE.Vector3();

/**
 * Leva a mão (o centro da palma) até um ponto do mundo, dobrando o braço e o cotovelo
 * (cinemática inversa de dois ossos). O cotovelo aponta para fora e para baixo, como no corpo.
 * Devolve a distância que faltou (0 quando alcançou).
 */
export function maoEm(corpo, lado, alvo, { punho = false, polo = null } = {}) {
  const j = corpo.juntas;
  const s = lado === "D" ? -1 : 1;
  const braco = j[`braco${lado}`];
  const cotovelo = j[`cotovelo${lado}`];
  j[`punho${lado}`].rotation.set(0, 0, 0);
  corpo.raiz.updateWorldMatrix(true, true);
  const a = corpo.medidas.braco;
  // punho: o alvo é o próprio punho (a mão vai ser girada depois); sem ele, o centro da palma.
  const b = corpo.medidas.antebraco + (punho ? 0 : corpo.medidas.palma * 0.55);
  const ombro = braco.getWorldPosition(v3());
  const alvoV = new THREE.Vector3(...alvo);
  const d = alvoV.clone().sub(ombro);
  const dist = d.length();
  const c = Math.min(Math.max(dist, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const dir = d.clone().normalize();
  // A dica do cotovelo, no espaço do peito: para fora, para baixo e um pouco para trás.
  const peito = new THREE.Quaternion();
  j.peito.getWorldQuaternion(peito);
  // polo: para onde o cotovelo aponta, no mundo (a cinemática do encaixe escolhe); sem ele, para fora,
  // para baixo e um pouco para trás, no espaço do peito.
  const dica = polo ? new THREE.Vector3(...polo).normalize() : new THREE.Vector3(s * 0.7, -1, -0.35).normalize().applyQuaternion(peito);
  let w = dica.clone().sub(dir.clone().multiplyScalar(dica.dot(dir)));
  if (w.lengthSq() < 1e-8) w = new THREE.Vector3(0, -1, 0).sub(dir.clone().multiplyScalar(-dir.y));
  w.normalize();
  const alfa = Math.acos(Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c))));
  const u = dir.clone().multiplyScalar(Math.cos(alfa)).add(w.clone().multiplyScalar(Math.sin(alfa)));
  const cotoveloPos = ombro.clone().add(u.clone().multiplyScalar(a));
  const pontaPos = ombro.clone().add(dir.clone().multiplyScalar(c));
  const ante = pontaPos.clone().sub(cotoveloPos).normalize();
  // Base do osso do braço: Y local = -u (o osso desce); Z local = para onde o antebraço dobra.
  const yb = u.clone().negate();
  let zb = ante.clone().sub(u.clone().multiplyScalar(ante.dot(u)));
  if (zb.lengthSq() < 1e-8) zb = w.clone().negate();
  zb.normalize();
  const xb = new THREE.Vector3().crossVectors(yb, zb).normalize();
  zb = new THREE.Vector3().crossVectors(xb, yb).normalize();
  const mundo = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xb, yb, zb));
  const pai = new THREE.Quaternion();
  braco.parent.getWorldQuaternion(pai);
  braco.quaternion.copy(pai.invert().multiply(mundo));
  const gama = Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - c * c) / (2 * a * b))));
  cotovelo.rotation.set(-(Math.PI - gama), 0, 0);
  corpo.raiz.updateWorldMatrix(true, true);
  return Math.max(0, dist - (a + b));
}

/**
 * Leva o tornozelo a um ponto do mundo, dobrando a coxa e o joelho (cinemática inversa de dois
 * ossos). `dica` é para onde o joelho aponta, no espaço da pelve (padrão: para a frente). Devolve
 * a distância que faltou.
 */
export function peEm(corpo, lado, alvo, dica = [0, 0, 1]) {
  const j = corpo.juntas;
  const coxa = j[`coxa${lado}`];
  const joelho = j[`joelho${lado}`];
  corpo.raiz.updateWorldMatrix(true, true);
  const a = corpo.medidas.coxa;
  const b = corpo.medidas.canela;
  const quadril = coxa.getWorldPosition(new THREE.Vector3());
  const alvoV = new THREE.Vector3(...alvo);
  const d = alvoV.clone().sub(quadril);
  const dist = d.length();
  const c = Math.min(Math.max(dist, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const dir = d.clone().normalize();
  const qp = new THREE.Quaternion();
  j.pelve.getWorldQuaternion(qp);
  const polo = new THREE.Vector3(...dica).normalize().applyQuaternion(qp);
  let w = polo.clone().sub(dir.clone().multiplyScalar(polo.dot(dir)));
  if (w.lengthSq() < 1e-8) w = new THREE.Vector3(0, 0, 1);
  w.normalize();
  const alfa = Math.acos(Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c))));
  const u = dir.clone().multiplyScalar(Math.cos(alfa)).add(w.clone().multiplyScalar(Math.sin(alfa)));
  const joelhoPos = quadril.clone().add(u.clone().multiplyScalar(a));
  const canela = quadril.clone().add(dir.clone().multiplyScalar(c)).sub(joelhoPos).normalize();
  // Base do osso da coxa: Y local = −u (o osso desce); o joelho dobra a canela para −Z local.
  const yb = u.clone().negate();
  let zb = canela.clone().sub(u.clone().multiplyScalar(canela.dot(u))).negate();
  if (zb.lengthSq() < 1e-8) zb = w.clone();
  zb.normalize();
  const xb = new THREE.Vector3().crossVectors(yb, zb).normalize();
  zb = new THREE.Vector3().crossVectors(xb, yb).normalize();
  const mundo = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xb, yb, zb));
  const pai = new THREE.Quaternion();
  coxa.parent.getWorldQuaternion(pai);
  coxa.quaternion.copy(pai.invert().multiply(mundo));
  const gama = Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - c * c) / (2 * a * b))));
  joelho.rotation.set(Math.PI - gama, 0, 0);
  corpo.raiz.updateWorldMatrix(true, true);
  return Math.max(0, dist - (a + b));
}

/** Vira o pescoço e a cabeça para um ponto do mundo (40% no pescoço, 60% na cabeça). */
export function olharPara(corpo, alvo) {
  const j = corpo.juntas;
  j.pescoco.rotation.set(0, 0, j.pescoco.rotation.z);
  j.cabeca.rotation.set(0, 0, j.cabeca.rotation.z);
  corpo.raiz.updateWorldMatrix(true, true);
  const olho = new THREE.Vector3(0, corpo.medidas.cabeca * 1.05, corpo.medidas.cabeca * 0.5);
  j.cabeca.localToWorld(olho);
  const d = new THREE.Vector3(...alvo).sub(olho);
  const q = new THREE.Quaternion();
  j.peito.getWorldQuaternion(q);
  d.applyQuaternion(q.invert());
  const gira = limita(Math.atan2(d.x, d.z) / GRAU, [-85, 85]);
  const dobra = limita(-Math.atan2(d.y, Math.hypot(d.x, d.z)) / GRAU, [-60, 70]);
  definirJunta(corpo, "pescoco", { gira: gira * 0.4, dobra: dobra * 0.4, inclina: j.pescoco.rotation.z / GRAU });
  definirJunta(corpo, "cabeca", { gira: gira * 0.6, dobra: dobra * 0.6, inclina: j.cabeca.rotation.z / GRAU });
  corpo.raiz.updateWorldMatrix(true, true);
}

/**
 * Os dedos do pé mais baixo assentam no chão: com o calcanhar levantado (andando, correndo,
 * ajoelhada), a ponta dobra para cima até ficar paralela ao chão, como num pé de verdade.
 */
export function assentarDedos(corpo) {
  corpo.raiz.updateWorldMatrix(true, true);
  const altura = (lado) => corpo.juntas[`ponta${lado}`].getWorldPosition(new THREE.Vector3()).y;
  const lado = altura("E") <= altura("D") ? "E" : "D";
  const pe = corpo.juntas[`tornozelo${lado}`];
  const q = new THREE.Quaternion();
  pe.getWorldQuaternion(q);
  const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const inclinacao = Math.asin(Math.max(-1, Math.min(1, -frente.y))) / GRAU;
  if (inclinacao > 8) definirJunta(corpo, `ponta${lado}`, { dobra: Math.min(60, inclinacao) });
}

/**
 * Sentada, os pés vão ao chão por cinemática inversa: cada pé vai a um ponto do chão à frente do
 * quadril (no mínimo onde a canela fica em pé, e pelo menos `alemDaBorda` metros à frente da borda
 * do assento, que fica `borda` metros à frente do quadril); a coxa e o joelho se ajustam, com o
 * joelho para a frente, e o pé assenta reto. A perna cruzada e as juntas dadas na cena ficam.
 */
export function pesNoChao(corpo, chao = 0, fixas = [], borda = 0, alemDaBorda = 0.14) {
  corpo.raiz.updateWorldMatrix(true, true);
  // Inclinação da pelve no mundo: + para a frente, − para trás.
  const q = new THREE.Quaternion();
  corpo.juntas.pelve.getWorldQuaternion(q);
  const frentePelve = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const p = Math.asin(Math.max(-1, Math.min(1, -frentePelve.y))) / GRAU;
  const { coxa: a, canela: c, tornozelo } = corpo.medidas;
  for (const lado of ["E", "D"]) {
    if (fixas.includes(`coxa${lado}`) || fixas.includes(`joelho${lado}`)) continue;
    const coxa = corpo.juntas[`coxa${lado}`];
    const joelho = corpo.juntas[`joelho${lado}`];
    const dobraCoxa = -coxa.rotation.x / GRAU;
    const dobraJoelho = joelho.rotation.x / GRAU;
    // Só a perna de quem está sentado com a canela para baixo; a que cruza por cima da outra
    // (a coxa fechada para dentro) fica como está.
    const s = lado === "D" ? -1 : 1;
    const abre = (s * coxa.rotation.z) / GRAU;
    if (dobraCoxa < 40 || abre < -5 || Math.abs(dobraCoxa - p - dobraJoelho) > 40) continue;
    const quadril = coxa.getWorldPosition(new THREE.Vector3());
    const altura = quadril.y - (chao + tornozelo);
    // Onde a canela ficaria em pé; os pés nunca ficam atrás disso nem embaixo do assento.
    const emPe = altura < a + c ? Math.sqrt(Math.max(0, a * a - Math.max(0, altura - c) ** 2)) : 0;
    const dz = Math.min(a + c - 0.02, Math.max(emPe, borda + alemDaBorda));
    const dist = Math.min(Math.hypot(dz, altura), a + c - 1e-3);
    const phi = Math.atan2(dz, altura) / GRAU; // para onde o pé está, a partir da vertical
    const alfa = Math.acos(Math.max(-1, Math.min(1, (a * a + dist * dist - c * c) / (2 * a * dist)))) / GRAU;
    const beta = Math.acos(Math.max(-1, Math.min(1, (c * c + dist * dist - a * a) / (2 * c * dist)))) / GRAU;
    coxa.rotation.x = -(phi + alfa + p) * GRAU;
    joelho.rotation.x = (alfa + beta) * GRAU;
    // O pé assenta reto no chão.
    corpo.raiz.updateWorldMatrix(true, true);
    const pe = corpo.juntas[`tornozelo${lado}`];
    pe.rotation.x = 0;
    corpo.raiz.updateWorldMatrix(true, true);
    const fq = new THREE.Quaternion();
    pe.getWorldQuaternion(fq);
    const fp = new THREE.Vector3(0, 0, 1).applyQuaternion(fq);
    pe.rotation.x = -Math.asin(Math.max(-1, Math.min(1, -fp.y)));
    corpo.raiz.updateWorldMatrix(true, true);
  }
}

/**
 * Perna cruzada sem entrar na outra: enquanto a coxa de cima (a que fecha para dentro) encosta no
 * joelho de baixo, ela sobe um grau; a canela de cima, se encostar no joelho de baixo, passa para o
 * lado de fora dele.
 */
export function separarPernas(corpo, fixas = []) {
  const ponto = (n) => corpo.juntas[n].getWorldPosition(new THREE.Vector3());
  const perto = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
  const rc = corpo.medidas.raioCoxa;
  for (const [cima, baixo, s] of [["E", "D", 1], ["D", "E", -1]]) {
    const coxa = corpo.juntas[`coxa${cima}`];
    if ((s * coxa.rotation.z) / GRAU >= -5 || fixas.includes(`coxa${cima}`)) continue;
    const folga = rc * 0.8 + rc * 0.68 + 0.012;
    for (let i = 0; i < 40; i++) {
      corpo.raiz.updateWorldMatrix(true, true);
      const joelhoBaixo = ponto(`joelho${baixo}`);
      const encosta = perto(joelhoBaixo, ponto(`coxa${cima}`), ponto(`joelho${cima}`)) < folga;
      // A canela de cima sai do joelho de cima, que fica junto do de baixo: mede da metade para baixo.
      const meio = ponto(`joelho${cima}`).lerp(ponto(`tornozelo${cima}`), 0.4);
      const canela = perto(ponto(`joelho${baixo}`).lerp(ponto(`tornozelo${baixo}`), 0.15), meio, ponto(`tornozelo${cima}`)) < rc * 0.62 + rc * 0.68 + 0.01;
      const girou = (s * coxa.rotation.y) / GRAU;
      if (!encosta && (!canela || girou > 25)) break;
      if (encosta) coxa.rotation.x -= GRAU;
      if (canela && girou <= 25) coxa.rotation.y += s * GRAU;
    }
  }
  corpo.raiz.updateWorldMatrix(true, true);
}

/**
 * O pé inteiro no chão: o tornozelo gira até a sola ficar reta (de frente para trás e de lado a
 * lado), mantendo para onde o pé aponta.
 */
export function peReto(corpo, lado) {
  const pe = corpo.juntas[`tornozelo${lado}`];
  pe.rotation.set(0, 0, 0);
  corpo.raiz.updateWorldMatrix(true, true);
  const q = pe.getWorldQuaternion(new THREE.Quaternion());
  const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  frente.y = 0;
  if (frente.lengthSq() < 1e-6) return;
  frente.normalize();
  const cima = new THREE.Vector3(0, 1, 0);
  const lado3 = new THREE.Vector3().crossVectors(cima, frente).normalize();
  const mundo = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lado3, cima, frente));
  const pai = pe.parent.getWorldQuaternion(new THREE.Quaternion());
  pe.quaternion.copy(pai.invert().multiply(mundo));
  corpo.raiz.updateWorldMatrix(true, true);
}

/**
 * Gira o antebraço até a palma olhar para uma direção do mundo (para baixo, numa superfície; para
 * um objeto, ao segurá-lo). Com `polegar`, também tenta deixar o polegar para esse lado (o topo do
 * objeto). Procura o melhor ângulo de −90° a 90° a partir do que a cinemática deixou.
 */
export function apontarPalma(corpo, lado, direcao, polegar = null, dedos = null) {
  const s = lado === "D" ? -1 : 1;
  const cotovelo = corpo.juntas[`cotovelo${lado}`];
  const mao = corpo.juntas[`mao${lado}`];
  const dir = new THREE.Vector3(...direcao).normalize();
  const cima = polegar ? new THREE.Vector3(...polegar).normalize() : null;
  const base = cotovelo.rotation.y;
  let melhor = base;
  let nota = -Infinity;
  for (let g = -90; g <= 90; g += 5) {
    cotovelo.rotation.y = base + g * GRAU;
    corpo.raiz.updateWorldMatrix(true, true);
    const q = mao.getWorldQuaternion(new THREE.Quaternion());
    // A palma olha para dentro do corpo na mão parada: −X local na esquerda, +X na direita.
    let n = new THREE.Vector3(-s, 0, 0).applyQuaternion(q).dot(dir);
    if (cima) n += 0.6 * new THREE.Vector3(0, 0, 1).applyQuaternion(q).dot(cima);
    if (dedos) n += 0.6 * new THREE.Vector3(0, -1, 0).applyQuaternion(q).dot(new THREE.Vector3(...dedos).normalize());
    if (n > nota) {
      nota = n;
      melhor = cotovelo.rotation.y;
    }
  }
  cotovelo.rotation.y = melhor;
  corpo.raiz.updateWorldMatrix(true, true);
}

/**
 * Encaixa a mão num objeto pela palma: a palma fica paralela à superfície do objeto e encostada nela
 * (a `raio` do eixo, com o centro em `centro`), o polegar aponta para o `topo` do objeto e os dedos
 * fecham em volta. Primeiro decide onde a mão fica, depois leva o punho até lá (cinemática inversa),
 * gira o antebraço para sobrar pouco ao punho e põe o resto no punho, até MAX_PUNHO. Devolve
 * { falta: o que faltou de alcance, punho: {dobra, desvia} que o encaixe pediria ao punho (acima dos
 * limites, a mão encosta sem ficar paralela), fora: {comprimento, largura}, os graus fora do paralelo
 * em cada eixo da palma }.
 */
export function segurarObjeto(corpo, lado, centro, topo, raio, face = null, dedosAoLongo = false) {
  const s = lado === "D" ? -1 : 1;
  const j = corpo.juntas;
  corpo.raiz.updateWorldMatrix(true, true);
  const u = new THREE.Vector3(...topo).normalize();
  const c = new THREE.Vector3(...centro);
  const ombro = j[`braco${lado}`].getWorldPosition(v3());
  let n;
  let xw;
  let yw;
  let zw;
  if (face) {
    // Objeto chato (celular, caixinha): a palma deita na face dada.
    n = new THREE.Vector3(...face);
    n.sub(u.clone().multiplyScalar(n.dot(u)));
    if (n.lengthSq() < 1e-8) n = new THREE.Vector3(0, 0, -1);
    n.normalize();
    xw = n.clone().multiplyScalar(-s);
    if (dedosAoLongo) {
      // Pelas costas (celular): os dedos sobem ao longo do comprimento do objeto.
      yw = u.clone().negate();
      zw = new THREE.Vector3().crossVectors(xw, yw).normalize();
    } else {
      zw = u.clone();
      yw = new THREE.Vector3().crossVectors(zw, xw).normalize();
    }
  } else {
    // Objeto redondo: a mão chega com os dedos na direção de quem vem do ombro, o polegar para o topo;
    // o objeto fica de lado na palma e os dedos o envolvem.
    let ida = c.clone().sub(ombro);
    ida.sub(u.clone().multiplyScalar(ida.dot(u)));
    if (ida.lengthSq() < 1e-8) ida = new THREE.Vector3(0, 0, 1);
    ida.normalize();
    yw = ida.clone().negate();
    zw = u.clone();
    xw = new THREE.Vector3().crossVectors(yw, zw).normalize();
    n = xw.clone().multiplyScalar(-s);
  }
  const desejada = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xw, yw, zw));
  // O centro da palma encosta na superfície; o punho fica de onde a palma sai.
  const palma = c.clone().sub(n.clone().multiplyScalar(raio + 0.0105 * corpo.medidas.H));
  const centroPalma = new THREE.Vector3(0, -corpo.medidas.palma * 0.55, 0);
  const punho = j[`punho${lado}`];
  let punhoPos = palma.clone().sub(centroPalma.clone().applyQuaternion(desejada));
  let falta = 0;
  let pedido = { dobra: 0, desvia: 0 };
  // Até 4 voltas: com o punho no limite, a mão não fica no ângulo pedido, e o braço corrige a posição
  // para a palma continuar encostada no objeto.
  // O cotovelo pode girar em volta da linha ombro–punho sem mexer na mão: escolhe o giro em que o
  // antebraço fica na linha dos dedos (o punho quase não dobra), sem levantar o cotovelo acima do ombro.
  const melhorPolo = (alvoPunho) => {
    const a = corpo.medidas.braco;
    const b = corpo.medidas.antebraco;
    const d = alvoPunho.clone().sub(ombro);
    const c2 = Math.min(Math.max(d.length(), Math.abs(a - b) + 1e-3), a + b - 1e-4);
    const dir = d.clone().normalize();
    const alfa = Math.acos(Math.min(1, Math.max(-1, (a * a + c2 * c2 - b * b) / (2 * a * c2))));
    const e1 = new THREE.Vector3(0, -1, 0).sub(dir.clone().multiplyScalar(-dir.y));
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(dir, e1);
    const dedos = yw.clone().negate();
    let melhor = null;
    let nota = -Infinity;
    for (let g = 0; g < 360; g += 10) {
      const w = e1.clone().multiplyScalar(Math.cos(g * GRAU)).add(e2.clone().multiplyScalar(Math.sin(g * GRAU)));
      const cot = ombro.clone().add(dir.clone().multiplyScalar(Math.cos(alfa) * a)).add(w.clone().multiplyScalar(Math.sin(alfa) * a));
      const ante = alvoPunho.clone().sub(cot).normalize();
      // Antebraço na linha dos dedos; cotovelo alto ou para dentro do corpo custa.
      const acima = Math.max(0, cot.y - ombro.y);
      const dentro = Math.max(0, -s * (cot.clone().sub(ombro).dot(new THREE.Vector3(1, 0, 0).applyQuaternion(corpo.juntas.peito.getWorldQuaternion(new THREE.Quaternion())))) - 0.02);
      const n2 = ante.dot(dedos) - 4 * acima - 3 * dentro;
      if (n2 > nota) {
        nota = n2;
        melhor = w;
      }
    }
    return melhor.toArray();
  };
  for (let volta = 0; volta < 4; volta++) {
    falta = maoEm(corpo, lado, punhoPos.toArray(), { punho: true, polo: melhorPolo(punhoPos) });
    if (dedosAoLongo && volta === 0) {
      // Segurando pelas costas, os dedos seguem o antebraço (no plano da face, até 45° do comprimento
      // do objeto), como quem segura o celular na diagonal: o punho quase não dobra.
      const ante = j[`punho${lado}`].getWorldPosition(v3()).sub(j[`cotovelo${lado}`].getWorldPosition(v3()));
      ante.sub(n.clone().multiplyScalar(ante.dot(n)));
      if (ante.lengthSq() > 1e-8) {
        ante.normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, ante.dot(u))));
        const eixo = new THREE.Vector3().crossVectors(u, ante).normalize();
        const dedosDir = eixo.lengthSq() > 0.5 ? u.clone().applyAxisAngle(eixo, Math.min(ang, Math.PI / 4)) : u.clone();
        const y2 = dedosDir.negate();
        const z2 = new THREE.Vector3().crossVectors(xw, y2).normalize();
        desejada.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xw, y2, z2));
        punhoPos = palma.clone().sub(centroPalma.clone().applyQuaternion(desejada));
        falta = maoEm(corpo, lado, punhoPos.toArray(), { punho: true, polo: melhorPolo(punhoPos) });
      }
    }
    // Antebraço girado para a palma ir na direção certa; o punho faz o resto.
    apontarPalma(corpo, lado, n.toArray(), dedosAoLongo ? null : u.toArray(), dedosAoLongo ? u.toArray() : null);
    // O punho tem dois eixos, um para cada eixo da palma: dobrar (para a palma ou para as costas da
    // mão, em torno da largura) e desviar (para o polegar ou o mínimo, em torno do comprimento). A
    // torção que sobrar vai para o antebraço, que é quem gira de verdade.
    const cotovelo = j[`cotovelo${lado}`];
    let e;
    for (let k = 0; k < 2; k++) {
      const pai = punho.parent.getWorldQuaternion(new THREE.Quaternion());
      // Ordem YXZ: a torção (Y) fica por fora, no eixo do antebraço, e pode passar para ele; o que
      // sobra (X e Z) é a ordem do próprio punho.
      e = new THREE.Euler().setFromQuaternion(pai.invert().multiply(desejada), "YXZ");
      cotovelo.rotation.y += e.y;
      corpo.raiz.updateWorldMatrix(true, true);
    }
    pedido = { dobra: (-s * e.z) / GRAU, desvia: -e.x / GRAU };
    // Limites de cada eixo: além deles a mão fica torta; ela para no limite.
    const dobra = Math.max(-MAX_PUNHO.dobra, Math.min(MAX_PUNHO.dobra, pedido.dobra));
    const desvia = Math.max(-MAX_PUNHO.desvia, Math.min(MAX_PUNHO.desvia, pedido.desvia));
    punho.rotation.set(-desvia * GRAU, 0, -s * dobra * GRAU);
    corpo.raiz.updateWorldMatrix(true, true);
    const erro = palma.clone().sub(j[`mao${lado}`].localToWorld(centroPalma.clone()));
    if (erro.length() < 0.004 || (dobra === pedido.dobra && desvia === pedido.desvia)) break;
    punhoPos.add(erro.clampLength(0, 0.05));
  }
  // Quanto a palma ficou fora do paralelo, em cada eixo dela (0 = encaixada): em torno do comprimento
  // da mão (tomba para o polegar ou o mínimo) e em torno da largura (para a ponta dos dedos ou o pulso).
  const q = j[`mao${lado}`].getWorldQuaternion(new THREE.Quaternion());
  const nl = n.clone().applyQuaternion(q.invert());
  const frente = -s * nl.x;
  const fora = { comprimento: Math.abs(Math.atan2(nl.z, frente)) / GRAU, largura: Math.abs(Math.atan2(nl.y, frente)) / GRAU };
  return { falta, punho: pedido, fora };
}

/** Até onde o punho vai ao encaixar a mão num objeto, em graus, em cada eixo. */
export const MAX_PUNHO = { dobra: 35, desvia: 20 };

/** A palma para baixo (mão apoiada numa superfície). */
export function palmaParaBaixo(corpo, lado) {
  apontarPalma(corpo, lado, [0, -1, 0]);
}

/** O ponto entre os olhos, no mundo (para a câmera mirar o rosto). */
export function pontoDoRosto(corpo) {
  corpo.raiz.updateWorldMatrix(true, true);
  return corpo.juntas.cabeca.localToWorld(new THREE.Vector3(0, corpo.medidas.cabeca * 1.05, corpo.medidas.cabeca * 0.6));
}

/** Para onde o rosto aponta, no mundo. */
export function direcaoDoRosto(corpo) {
  const q = new THREE.Quaternion();
  corpo.juntas.cabeca.getWorldQuaternion(q);
  return new THREE.Vector3(0, 0, 1).applyQuaternion(q);
}

// ---------- colisão dos braços ----------

/** Menor distância entre os segmentos p1–q1 e p2–q2, e os dois pontos mais próximos. */
function entreSegmentos(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a < 1e-9 && e < 1e-9) return { dist: r.length(), c1: p1.clone(), c2: p2.clone() };
  if (a < 1e-9) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = d1.dot(r);
    if (e < 1e-9) s = Math.min(1, Math.max(0, -c / a));
    else {
      const b = d1.dot(d2);
      const den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const c1 = p1.clone().add(d1.multiplyScalar(s));
  const c2 = p2.clone().add(d2.multiplyScalar(t));
  return { dist: c1.distanceTo(c2), c1, c2 };
}

/**
 * O corpo em cápsulas (segmento e raio), no mundo: tronco, cabeça, coxas e canelas, e o braço,
 * o antebraço e a mão de cada lado. O tronco usa um raio entre a largura e a profundidade.
 */
function capsulas(corpo) {
  corpo.raiz.updateWorldMatrix(true, true);
  const m = corpo.medidas;
  const H = m.H;
  const j = corpo.juntas;
  const p = (n, local) => (local ? j[n].localToWorld(new THREE.Vector3(...local)) : j[n].getWorldPosition(new THREE.Vector3()));
  // O tronco é oval: [início, fim, raio de frente para trás, junta, largura ÷ profundidade]. A conta
  // é feita no espaço da junta, com a largura achatada para virar círculo.
  const oval = (junta, y0, y1, largura, profundidade) => [
    j[junta].localToWorld(new THREE.Vector3(0, y0, 0)),
    j[junta].localToWorld(new THREE.Vector3(0, y1, 0)),
    profundidade,
    junta,
    largura / profundidade,
  ];
  const fundo = m.largo ** 0.7;
  const c = {
    pelve: oval("pelve", -0.03 * H, m.cintura, 0.095 * H * m.largo, 0.095 * H * m.largo * 0.66 * fundo),
    barriga: oval("cintura", 0, m.peito, 0.076 * H * m.largo, 0.076 * H * m.largo * 0.62 * fundo + (m.largo > 1.04 ? 0.055 * H * (m.largo - 1) * 1.6 : 0)),
    peito: oval("peito", 0, m.pescoco, 0.09 * H * m.largo, 0.09 * H * m.largo * 0.62 * m.largo ** 0.5 + (m.feminino && !m.crianca ? 0.02 * H * m.largo : 0)),
    cabeca: [p("cabeca", [0, m.cabeca * 0.7, 0]), p("cabeca", [0, m.cabeca * 1.4, 0]), m.cabeca * 0.75],
  };
  for (const l of ["E", "D"]) {
    c[`coxa${l}`] = [p(`coxa${l}`), p(`joelho${l}`), m.raioCoxa * 0.85];
    c[`canela${l}`] = [p(`joelho${l}`), p(`tornozelo${l}`), m.raioCoxa * 0.6];
    // O braço começa no meio: a parte de cima é presa ao ombro e sempre encosta no peito.
    c[`braco${l}`] = [p(`braco${l}`, [0, -m.braco * 0.45, 0]), p(`cotovelo${l}`), m.raioBraco * 0.85];
    c[`antebraco${l}`] = [p(`cotovelo${l}`), p(`punho${l}`), m.raioAntebraco * 0.9];
    c[`mao${l}`] = [p(`punho${l}`), p(`mao${l}`, [0, -m.palma * 0.8, 0]), 0.016 * H];
  }
  return c;
}

const NOMES = { pelve: "quadril", barriga: "barriga", peito: "peito", cabeca: "cabeça", coxaE: "coxa esquerda", coxaD: "coxa direita", canelaE: "canela esquerda", canelaD: "canela direita", bracoE: "braço esquerdo", bracoD: "braço direito", antebracoE: "antebraço esquerdo", antebracoD: "antebraço direito", maoE: "mão esquerda", maoD: "mão direita" };

/**
 * Onde os braços entram no próprio corpo: [{lado, parte, outra, entra (m), normal}], o mais fundo
 * primeiro. A normal empurra a parte do braço para fora da outra. Folga de 5 mm.
 */
export function colisoesDosBracos(corpo) {
  const c = capsulas(corpo);
  const lista = [];
  for (const lado of ["E", "D"]) {
    for (const parte of [`braco${lado}`, `antebraco${lado}`, `mao${lado}`]) {
      for (const outra of ["pelve", "barriga", "peito", "cabeca", "coxaE", "coxaD", "canelaE", "canelaD"]) {
        // O braço de cima encosta no peito por natureza (preso ao ombro).
        if (parte.startsWith("braco") && outra === "peito") continue;
        const [a1, b1, r1] = c[parte];
        const [a2, b2, r2, junta, achata] = c[outra];
        let r;
        if (junta) {
          // Tronco oval: leva o braço para o espaço da junta e achata a largura.
          const g = corpo.juntas[junta];
          const local = (v) => {
            const l = g.worldToLocal(v.clone());
            l.x /= achata;
            return l;
          };
          r = entreSegmentos(local(a1), local(b1), local(a2), local(b2));
          const n = r.c1.clone().sub(r.c2);
          n.x *= achata;
          r.normal = n.transformDirection(g.matrixWorld);
        } else {
          r = entreSegmentos(a1, b1, a2, b2);
          r.normal = r.c1.clone().sub(r.c2).normalize();
        }
        const entra = r1 + r2 - r.dist;
        if (entra > 0.005) lista.push({ lado, parte, outra, entra, normal: r.normal, ponto: r.c1 });
      }
    }
  }
  return lista.sort((a, b) => b.entra - a.entra);
}

/** O aviso de uma colisão, em português. */
export function avisoDeColisao(nome, { parte, outra, entra }) {
  return `${nome}: ${NOMES[parte]} entra ${(entra * 100).toFixed(1)} cm na ${NOMES[outra]}`;
}

/**
 * Tira os braços de dentro do corpo. A mão que foi a um ponto (alvos) tem o ponto empurrado para
 * fora, e a cinemática refeita; o braço solto abre um pouco. O que a cena fixou (fixas) não mexe.
 * Devolve as colisões que sobraram.
 */
export function soltarBracos(corpo, alvos = {}, fixas = []) {
  for (let volta = 0; volta < 24; volta++) {
    const lista = colisoesDosBracos(corpo).filter(({ lado }) => !fixas.includes(`braco${lado}`) && !fixas.includes(`cotovelo${lado}`));
    if (!lista.length) break;
    const feitos = new Set();
    for (const { lado, entra, normal } of lista) {
      if (feitos.has(lado)) continue;
      feitos.add(lado);
      if (alvos[lado]) {
        const alvo = new THREE.Vector3(...alvos[lado]).add(normal.clone().multiplyScalar(Math.min(0.05, entra + 0.01)));
        alvos[lado] = alvo.toArray();
        maoEm(corpo, lado, alvos[lado]);
      } else {
        const braco = corpo.juntas[`braco${lado}`];
        braco.rotation.z += (lado === "D" ? -1 : 1) * 2 * GRAU;
        corpo.raiz.updateWorldMatrix(true, true);
      }
    }
  }
  return colisoesDosBracos(corpo);
}
