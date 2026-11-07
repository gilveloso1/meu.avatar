// Catálogo de objetos da maquete: móveis, casa e produtos, feitos de formas simples em código
// (nenhum arquivo 3D). Cada um nasce com a base em y = 0, a frente para +Z e o centro em x = z = 0.
// Medidas em metros; largura (x), altura (y), profundidade (z) e cores mudam por parâmetro.
// assento diz onde uma pessoa senta (altura, recuo da borda da frente e a espessura do encosto).
import * as THREE from "three";
import { GRAU, bloco, caixa, cilindro, elipsoide, malha, material } from "./geo.js";

const MADEIRA = "#a07a55";
const CLARO = "#e9e6e1";
const TECIDO = "#9aa0a6";
const METAL = "#8d9298";

function pernas(g, largura, profundidade, altura, mat, raio = 0.02, recuo = 0.04) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = cilindro(raio, raio, altura, mat, 12);
    p.position.set(sx * (largura / 2 - recuo), altura / 2, sz * (profundidade / 2 - recuo));
    g.add(p);
  }
}

function folhagem(g, altura, raio, cor, semente = 1) {
  const mat = material(cor);
  for (let i = 0; i < 7; i++) {
    const a = (i * 137.5 + semente * 40) * GRAU;
    const r = raio * (0.45 + ((i * 7919 + semente) % 10) / 22);
    const f = elipsoide(r, r * 0.9, r, mat, 14);
    f.position.set(Math.cos(a) * raio * 0.45, altura - raio * 0.6 + ((i % 3) - 1) * raio * 0.35, Math.sin(a) * raio * 0.45);
    g.add(f);
  }
}

/** Cada tipo: as medidas padrão, a descrição e como montar. */
export const OBJETOS = {
  // Cozinha e banheiro
  bancada: {
    descricao: "Bancada de cozinha encostada na parede (armário embaixo e tampo)",
    padrao: { largura: 2.4, altura: 0.92, profundidade: 0.62, cor: CLARO, cor2: "#f4f2ee" },
    criar: (p) => {
      const g = new THREE.Group();
      const corpo = caixa(p.largura, p.altura - 0.04, p.profundidade - 0.03, material(p.cor), 0.01);
      corpo.position.z = -0.015;
      g.add(corpo);
      const tampo = caixa(p.largura + 0.02, 0.04, p.profundidade, material(p.cor2, { brilho: 0.4 }), 0.008);
      tampo.position.y += p.altura - 0.04;
      g.add(tampo);
      return g;
    },
  },
  ilha: {
    descricao: "Ilha de cozinha no meio do ambiente, livre dos dois lados",
    padrao: { largura: 2.0, altura: 0.92, profundidade: 1.0, cor: CLARO, cor2: "#f4f2ee" },
    criar: (p) => OBJETOS.bancada.criar(p),
  },
  pia: {
    descricao: "Cuba e torneira, para pôr sobre a bancada",
    padrao: { largura: 0.6, altura: 0.32, profundidade: 0.42, cor: METAL },
    criar: (p) => {
      const g = new THREE.Group();
      const cuba = bloco(p.largura, 0.02, p.profundidade, material(p.cor, { brilho: 0.6 }));
      cuba.position.y = 0.01;
      g.add(cuba);
      const haste = cilindro(0.015, 0.015, p.altura, material(p.cor, { brilho: 0.7 }), 12);
      haste.position.z = -p.profundidade / 2 + 0.05;
      g.add(haste);
      const bico = bloco(0.03, 0.03, 0.2, material(p.cor, { brilho: 0.7 }));
      bico.position.set(0, p.altura, -p.profundidade / 2 + 0.14);
      g.add(bico);
      return g;
    },
  },
  armario_suspenso: {
    descricao: "Armário de parede, preso acima da bancada (base a 1,5 m)",
    padrao: { largura: 1.2, altura: 0.7, profundidade: 0.35, cor: CLARO, elevacao: 1.5 },
    criar: (p) => {
      const g = new THREE.Group();
      const c = caixa(p.largura, p.altura, p.profundidade, material(p.cor), 0.01);
      c.position.y += p.elevacao;
      g.add(c);
      return g;
    },
  },
  geladeira: {
    descricao: "Geladeira de duas portas",
    padrao: { largura: 0.75, altura: 1.85, profundidade: 0.72, cor: "#d9dadc" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(caixa(p.largura, p.altura, p.profundidade, material(p.cor, { brilho: 0.4 }), 0.03));
      for (const y of [p.altura * 0.62, p.altura * 0.4]) {
        const puxador = bloco(0.025, 0.25, 0.03, material(METAL, { brilho: 0.6 }));
        puxador.position.set(p.largura / 2 - 0.08, y, p.profundidade / 2 + 0.02);
        g.add(puxador);
      }
      return g;
    },
  },
  espelho: {
    descricao: "Espelho de parede (plano claro e brilhante)",
    padrao: { largura: 0.6, altura: 0.9, profundidade: 0.03, cor: "#dfe7ec", elevacao: 1.1 },
    criar: (p) => {
      const g = new THREE.Group();
      const e = caixa(p.largura, p.altura, p.profundidade, material(p.cor, { brilho: 0.9 }), 0.01);
      e.position.y += p.elevacao;
      g.add(e);
      return g;
    },
  },

  // Sala e quarto
  sofa: {
    descricao: "Sofá de três lugares com braços",
    padrao: { largura: 2.3, altura: 0.98, profundidade: 0.9, cor: TECIDO },
    assento: { altura: 0.36, recuo: 0.45, encosto: 0.22 },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      const base = caixa(p.largura, 0.36, p.profundidade, m, 0.05);
      g.add(base);
      const encosto = caixa(p.largura, p.altura - 0.3, 0.22, m, 0.07);
      encosto.position.set(0, encosto.position.y + 0.26, -p.profundidade / 2 + 0.11);
      g.add(encosto);
      for (const s of [-1, 1]) {
        const braco = caixa(0.17, 0.55, p.profundidade, m, 0.07);
        braco.position.x = s * (p.largura / 2 - 0.085);
        g.add(braco);
      }
      return g;
    },
  },
  poltrona: {
    descricao: "Poltrona de um lugar com braços",
    padrao: { largura: 1.0, altura: 0.98, profundidade: 0.85, cor: TECIDO },
    assento: { altura: 0.36, recuo: 0.45, encosto: 0.22 },
    criar: (p) => OBJETOS.sofa.criar(p),
  },
  cadeira: {
    descricao: "Cadeira de madeira com encosto",
    padrao: { largura: 0.45, altura: 0.9, profundidade: 0.48, cor: MADEIRA },
    assento: { altura: 0.42, recuo: 0.3, encosto: 0.025 },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      pernas(g, p.largura, p.profundidade, 0.39, m, 0.018, 0.03);
      const assento = caixa(p.largura, 0.03, p.profundidade, m, 0.008);
      assento.position.y += 0.39;
      g.add(assento);
      const encosto = caixa(p.largura, p.altura - 0.42, 0.025, m, 0.008);
      encosto.position.set(0, encosto.position.y + 0.42, -p.profundidade / 2 + 0.0125);
      g.add(encosto);
      return g;
    },
  },
  banqueta: {
    descricao: "Banqueta alta de bancada, sem encosto",
    padrao: { largura: 0.38, altura: 0.66, profundidade: 0.38, cor: MADEIRA },
    assento: { altura: (p) => p.altura, recuo: 0.15 },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      pernas(g, p.largura * 0.9, p.profundidade * 0.9, p.altura - 0.03, m, 0.015, 0.03);
      const assento = cilindro(p.largura / 2, p.largura / 2, 0.04, m);
      assento.position.y = p.altura - 0.02;
      g.add(assento);
      return g;
    },
  },
  mesa: {
    descricao: "Mesa de jantar ou de trabalho com quatro pés",
    padrao: { largura: 1.4, altura: 0.75, profundidade: 0.8, cor: MADEIRA },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      pernas(g, p.largura, p.profundidade, p.altura - 0.03, m, 0.025, 0.06);
      const tampo = caixa(p.largura, 0.035, p.profundidade, m, 0.01);
      tampo.position.y += p.altura - 0.035;
      g.add(tampo);
      return g;
    },
  },
  mesa_centro: {
    descricao: "Mesa de centro baixa",
    padrao: { largura: 1.0, altura: 0.42, profundidade: 0.6, cor: MADEIRA },
    criar: (p) => OBJETOS.mesa.criar(p),
  },
  mesa_lateral: {
    descricao: "Mesinha lateral (ao lado do sofá ou da cama)",
    padrao: { largura: 0.45, altura: 0.55, profundidade: 0.45, cor: MADEIRA },
    criar: (p) => OBJETOS.mesa.criar(p),
  },
  cama: {
    descricao: "Cama de casal com cabeceira e travesseiros",
    padrao: { largura: 1.6, altura: 0.55, profundidade: 2.05, cor: "#eeeeea", cor2: MADEIRA },
    assento: { altura: (p) => p.altura, recuo: 0.3 },
    criar: (p) => {
      const g = new THREE.Group();
      const base = caixa(p.largura, 0.3, p.profundidade, material(p.cor2), 0.02);
      g.add(base);
      const colchao = caixa(p.largura - 0.04, p.altura - 0.3, p.profundidade - 0.04, material(p.cor), 0.06);
      colchao.position.y += 0.3;
      g.add(colchao);
      const cabeceira = caixa(p.largura, 1.0, 0.08, material(p.cor2), 0.02);
      cabeceira.position.z = -p.profundidade / 2 - 0.04;
      g.add(cabeceira);
      for (const s of [-1, 1]) {
        const t = caixa(p.largura * 0.4, 0.13, 0.4, material(p.cor), 0.06);
        t.position.set(s * p.largura * 0.23, t.position.y + p.altura, -p.profundidade / 2 + 0.3);
        g.add(t);
      }
      return g;
    },
  },
  estante: {
    descricao: "Estante aberta com prateleiras",
    padrao: { largura: 1.0, altura: 1.9, profundidade: 0.35, cor: MADEIRA },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      for (const s of [-1, 1]) {
        const lado = caixa(0.025, p.altura, p.profundidade, m, 0.005);
        lado.position.x = s * (p.largura / 2 - 0.0125);
        g.add(lado);
      }
      const fundo = caixa(p.largura, p.altura, 0.01, m, 0.003);
      fundo.position.z = -p.profundidade / 2;
      g.add(fundo);
      for (let i = 0; i <= 4; i++) {
        const prat = caixa(p.largura, 0.025, p.profundidade, m, 0.005);
        prat.position.y += (i * (p.altura - 0.025)) / 4;
        g.add(prat);
      }
      return g;
    },
  },
  armario: {
    descricao: "Guarda-roupa ou armário alto fechado",
    padrao: { largura: 1.2, altura: 2.1, profundidade: 0.6, cor: CLARO },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(caixa(p.largura, p.altura, p.profundidade, material(p.cor), 0.01));
      const fresta = bloco(0.006, p.altura - 0.1, 0.01, material("#b9b6b1"));
      fresta.position.set(0, p.altura / 2, p.profundidade / 2);
      g.add(fresta);
      return g;
    },
  },
  rack_tv: {
    descricao: "Rack baixo com uma TV em cima",
    padrao: { largura: 1.8, altura: 1.3, profundidade: 0.42, cor: MADEIRA },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(caixa(p.largura, 0.5, p.profundidade, material(p.cor), 0.01));
      const tv = caixa(1.25, 0.72, 0.05, material("#202225", { brilho: 0.5 }), 0.01);
      tv.position.set(0, tv.position.y + 0.55, -0.05);
      g.add(tv);
      return g;
    },
  },
  tapete: {
    descricao: "Tapete retangular (redondo: forma \"redondo\")",
    padrao: { largura: 2.0, altura: 0.012, profundidade: 1.4, cor: "#b8b2a7", forma: "retangular" },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      if (p.forma === "redondo") g.add(cilindro(p.largura / 2, p.largura / 2, p.altura, m, 48));
      else g.add(caixa(p.largura, p.altura, p.profundidade, m, 0.004));
      return g;
    },
  },
  planta: {
    descricao: "Planta grande em vaso",
    padrao: { largura: 0.6, altura: 1.3, profundidade: 0.6, cor: "#5f8a52", cor2: "#b9704c" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura * 0.28, p.largura * 0.36, p.altura * 0.28, material(p.cor2)));
      const caule = cilindro(0.015, 0.015, p.altura * 0.5, material("#6b5440"), 8);
      caule.position.y += p.altura * 0.25;
      g.add(caule);
      folhagem(g, p.altura, p.largura * 0.5, p.cor);
      return g;
    },
  },
  planta_pequena: {
    descricao: "Plantinha em vaso, de mesa ou prateleira",
    padrao: { largura: 0.2, altura: 0.3, profundidade: 0.2, cor: "#5f8a52", cor2: "#d8d2c8" },
    criar: (p) => OBJETOS.planta.criar(p),
  },
  abajur: {
    descricao: "Abajur de mesa com cúpula acesa",
    padrao: { largura: 0.3, altura: 0.55, profundidade: 0.3, cor: "#efe6d4", cor2: "#c9c2b6" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(0.08, 0.08, 0.03, material(p.cor2)));
      const haste = cilindro(0.012, 0.012, p.altura * 0.6, material(p.cor2), 8);
      g.add(haste);
      const cupula = cilindro(p.largura / 2, p.largura * 0.36, p.altura * 0.4, material(p.cor, { emissivo: 0.35 }));
      cupula.position.y += p.altura * 0.58;
      g.add(cupula);
      return g;
    },
  },
  luminaria_piso: {
    descricao: "Luminária de chão alta",
    padrao: { largura: 0.4, altura: 1.6, profundidade: 0.4, cor: "#efe6d4", cor2: "#55504b" },
    criar: (p) => OBJETOS.abajur.criar(p),
  },
  quadro: {
    descricao: "Quadro de parede com moldura",
    padrao: { largura: 0.6, altura: 0.8, profundidade: 0.03, cor: "#c7b9a3", cor2: "#3a3634", elevacao: 1.3 },
    criar: (p) => {
      const g = new THREE.Group();
      const moldura = caixa(p.largura, p.altura, p.profundidade, material(p.cor2), 0.004);
      moldura.position.y += p.elevacao;
      g.add(moldura);
      const tela = bloco(p.largura - 0.06, p.altura - 0.06, 0.005, material(p.cor));
      tela.position.set(0, p.elevacao + p.altura / 2, p.profundidade / 2);
      g.add(tela);
      return g;
    },
  },
  janela: {
    descricao: "Janela com luz do dia (encoste na parede)",
    padrao: { largura: 1.2, altura: 1.2, profundidade: 0.06, cor: "#ffffff", cor2: "#5d5a56", elevacao: 0.9 },
    criar: (p) => {
      const g = new THREE.Group();
      const vidro = bloco(p.largura, p.altura, 0.01, material(p.cor, { emissivo: 1 }));
      vidro.castShadow = false;
      vidro.position.y = p.elevacao + p.altura / 2;
      g.add(vidro);
      const m = material(p.cor2);
      for (const [w, h, x, y] of [[p.largura + 0.08, 0.05, 0, p.elevacao], [p.largura + 0.08, 0.05, 0, p.elevacao + p.altura], [0.05, p.altura, -p.largura / 2, p.elevacao + p.altura / 2], [0.05, p.altura, p.largura / 2, p.elevacao + p.altura / 2], [0.035, p.altura, 0, p.elevacao + p.altura / 2]]) {
        const b = bloco(w, h, p.profundidade, m);
        b.position.set(x, y, 0);
        g.add(b);
      }
      return g;
    },
  },
  porta: {
    descricao: "Porta fechada (encoste na parede)",
    padrao: { largura: 0.82, altura: 2.1, profundidade: 0.05, cor: "#d9d4cc" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(caixa(p.largura, p.altura, p.profundidade, material(p.cor), 0.005));
      const macaneta = bloco(0.12, 0.02, 0.04, material(METAL, { brilho: 0.6 }));
      macaneta.position.set(p.largura / 2 - 0.12, 1.0, p.profundidade / 2 + 0.02);
      g.add(macaneta);
      return g;
    },
  },

  // Objetos pequenos e produtos (vão sobre um móvel com "sobre" ou na mão com "na_mao")
  frasco_conta_gotas: {
    descricao: "Frasco de sérum com conta-gotas",
    padrao: { largura: 0.036, altura: 0.12, profundidade: 0.036, cor: "#7b3fb5", cor2: "#2b2b2b" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura / 2, p.largura / 2, p.altura * 0.62, material(p.cor, { brilho: 0.6 })));
      const ombro = cilindro(p.largura / 2, p.largura * 0.22, p.altura * 0.08, material(p.cor, { brilho: 0.6 }));
      ombro.position.y += p.altura * 0.62;
      g.add(ombro);
      const tampa = cilindro(p.largura * 0.3, p.largura * 0.3, p.altura * 0.14, material(p.cor2));
      tampa.position.y += p.altura * 0.7;
      g.add(tampa);
      const bulbo = elipsoide(p.largura * 0.22, p.altura * 0.09, p.largura * 0.22, material(p.cor2), 12);
      bulbo.position.y = p.altura * 0.92;
      g.add(bulbo);
      return g;
    },
  },
  frasco: {
    descricao: "Frasco com válvula pump (hidratante, sabonete)",
    padrao: { largura: 0.06, altura: 0.18, profundidade: 0.06, cor: "#e8e2d8", cor2: "#2b2b2b" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura / 2, p.largura / 2, p.altura * 0.72, material(p.cor, { brilho: 0.3 })));
      const valvula = cilindro(p.largura * 0.18, p.largura * 0.18, p.altura * 0.16, material(p.cor2));
      valvula.position.y += p.altura * 0.72;
      g.add(valvula);
      const bico = bloco(p.largura * 0.18, p.altura * 0.05, p.largura * 0.55, material(p.cor2));
      bico.position.set(0, p.altura * 0.92, p.largura * 0.2);
      g.add(bico);
      return g;
    },
  },
  pote: {
    descricao: "Pote baixo com tampa (creme, máscara)",
    padrao: { largura: 0.075, altura: 0.055, profundidade: 0.075, cor: "#f1ece4", cor2: "#c9a46a" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura / 2, p.largura / 2, p.altura * 0.65, material(p.cor, { brilho: 0.3 })));
      const tampa = cilindro(p.largura * 0.52, p.largura * 0.52, p.altura * 0.35, material(p.cor2, { brilho: 0.4 }));
      tampa.position.y += p.altura * 0.65;
      g.add(tampa);
      return g;
    },
  },
  tubo: {
    descricao: "Bisnaga (protetor, creme), de pé sobre a tampa",
    padrao: { largura: 0.05, altura: 0.17, profundidade: 0.03, cor: "#f3f1ec", cor2: "#2b2b2b" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura * 0.32, p.largura * 0.32, p.altura * 0.15, material(p.cor2)));
      const corpo = malha(new THREE.CylinderGeometry(p.largura / 2, p.largura * 0.32, p.altura * 0.85, 24), material(p.cor, { brilho: 0.3 }));
      corpo.scale.z = p.profundidade / p.largura;
      corpo.position.y = p.altura * 0.15 + p.altura * 0.425;
      g.add(corpo);
      return g;
    },
  },
  garrafa: {
    descricao: "Garrafa (água, suco, vinho)",
    padrao: { largura: 0.075, altura: 0.28, profundidade: 0.075, cor: "#5c7f6b", cor2: "#2b2b2b" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura / 2, p.largura / 2, p.altura * 0.62, material(p.cor, { brilho: 0.5 })));
      const gargalo = cilindro(p.largura / 2, p.largura * 0.18, p.altura * 0.28, material(p.cor, { brilho: 0.5 }));
      gargalo.position.y += p.altura * 0.62;
      g.add(gargalo);
      const tampa = cilindro(p.largura * 0.2, p.largura * 0.2, p.altura * 0.1, material(p.cor2));
      tampa.position.y += p.altura * 0.9;
      g.add(tampa);
      return g;
    },
  },
  lata: {
    descricao: "Lata de bebida",
    padrao: { largura: 0.066, altura: 0.122, profundidade: 0.066, cor: "#c8463b" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura / 2, p.largura / 2, p.altura, material(p.cor, { brilho: 0.5 })));
      return g;
    },
  },
  caixa_produto: {
    descricao: "Caixinha de produto (embalagem)",
    padrao: { largura: 0.07, altura: 0.14, profundidade: 0.04, cor: "#efe9df" },
    criar: (p) => caixa(p.largura, p.altura, p.profundidade, material(p.cor), 0.002),
  },
  caixa_papelao: {
    descricao: "Caixa de papelão de entrega, com as abas abertas",
    padrao: { largura: 0.42, altura: 0.26, profundidade: 0.32, cor: "#c49a6c", aberta: true },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      g.add(caixa(p.largura, p.altura, p.profundidade, m, 0.004));
      if (p.aberta) for (const s of [-1, 1]) {
        const aba = bloco(p.largura, 0.004, p.profundidade / 2, m);
        aba.position.set(0, p.altura + p.profundidade * 0.17, s * (p.profundidade / 2 + p.profundidade * 0.17));
        aba.rotation.x = s * 55 * GRAU;
        g.add(aba);
      }
      return g;
    },
  },
  celular: {
    // Na mão: a palma nas costas (do lado oposto ao rosto), o polegar subindo pela lateral e os dedos
    // atravessando a largura até a outra borda, com o celular em pé.
    descricao: "Celular (tela para +Z); na mão, a tela fica de frente para quem segura",
    naMao: { giro: 180, palma: "costas" },
    padrao: { largura: 0.072, altura: 0.15, profundidade: 0.008, cor: "#1d1e20" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(caixa(p.largura, p.altura, p.profundidade, material(p.cor, { brilho: 0.6 }), 0.004));
      return g;
    },
  },
  notebook: {
    descricao: "Notebook aberto; quem usa fica do lado +Z (do teclado)",
    padrao: { largura: 0.33, altura: 0.22, profundidade: 0.23, cor: "#b9bcc0" },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor, { brilho: 0.4 });
      g.add(caixa(p.largura, 0.015, p.profundidade, m, 0.004));
      const tela = bloco(p.largura, p.altura, 0.008, m);
      tela.rotation.x = 15 * GRAU;
      tela.position.set(0, p.altura / 2 * Math.cos(15 * GRAU) + 0.012, -p.profundidade / 2 - (p.altura / 2) * Math.sin(15 * GRAU));
      g.add(tela);
      return g;
    },
  },
  xicara: {
    descricao: "Xícara ou caneca",
    padrao: { largura: 0.08, altura: 0.09, profundidade: 0.08, cor: "#f2f0ec" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura * 0.45, p.largura / 2, p.altura, material(p.cor, { brilho: 0.4 })));
      const alca = malha(new THREE.TorusGeometry(p.altura * 0.25, p.largura * 0.07, 8, 16), material(p.cor, { brilho: 0.4 }));
      alca.rotation.y = Math.PI / 2;
      alca.position.set(p.largura / 2 + p.altura * 0.15, p.altura * 0.5, 0);
      g.add(alca);
      return g;
    },
  },
  livros: {
    descricao: "Pilha de livros deitados",
    padrao: { largura: 0.24, altura: 0.12, profundidade: 0.17, cor: "#7d8fa3" },
    criar: (p) => {
      const g = new THREE.Group();
      const cores = [p.cor, "#b5634b", "#d8cdb6", "#4f6b5a"];
      for (let i = 0; i < 4; i++) {
        const l = caixa(p.largura * (1 - i * 0.06), p.altura / 4, p.profundidade * (1 - i * 0.05), material(cores[i]), 0.003);
        l.position.y += (i * p.altura) / 4;
        l.rotation.y = (i % 2 ? 6 : -4) * GRAU;
        g.add(l);
      }
      return g;
    },
  },
  sacola: {
    descricao: "Sacola de compras com alças",
    padrao: { largura: 0.32, altura: 0.38, profundidade: 0.12, cor: "#e7dcc9" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(caixa(p.largura, p.altura, p.profundidade, material(p.cor), 0.004));
      const alca = malha(new THREE.TorusGeometry(p.largura * 0.18, 0.006, 6, 20, Math.PI), material("#5a5148"));
      alca.position.y = p.altura;
      g.add(alca);
      return g;
    },
  },
  bloco: {
    descricao: "Caixa genérica (qualquer coisa sem tipo próprio: degrau, palco, balcão de loja)",
    padrao: { largura: 1, altura: 1, profundidade: 1, cor: "#b8b8b8" },
    criar: (p) => caixa(p.largura, p.altura, p.profundidade, material(p.cor), 0.01),
  },
  cilindro: {
    descricao: "Cilindro genérico (coluna, poste, vaso alto, tronco)",
    padrao: { largura: 0.3, altura: 1, profundidade: 0.3, cor: "#b8b8b8" },
    criar: (p) => cilindro(p.largura / 2, p.largura / 2, p.altura, material(p.cor)),
  },
  predios: {
    descricao: "Fileira de prédios ao fundo (horizonte de cidade)",
    padrao: { largura: 60, altura: 18, profundidade: 6, cor: "#c4c8cc" },
    criar: (p) => {
      const g = new THREE.Group();
      const n = Math.max(3, Math.round(p.largura / 6));
      for (let i = 0; i < n; i++) {
        const h = p.altura * (0.35 + ((i * 37) % 11) / 16);
        const b = caixa(p.largura / n - 0.6, h, p.profundidade, material(p.cor), 0.05);
        b.position.x = -p.largura / 2 + (i + 0.5) * (p.largura / n);
        g.add(b);
      }
      return g;
    },
  },
  arvore: {
    descricao: "Árvore de copa redonda",
    padrao: { largura: 3, altura: 5, profundidade: 3, cor: "#5f8a52", cor2: "#6b5440" },
    criar: (p) => {
      const g = new THREE.Group();
      g.add(cilindro(p.largura * 0.06, p.largura * 0.08, p.altura * 0.55, material(p.cor2), 10));
      folhagem(g, p.altura, p.largura / 2, p.cor, 3);
      return g;
    },
  },
  guarda_corpo: {
    descricao: "Guarda-corpo de metal (varanda, terraço)",
    padrao: { largura: 6, altura: 1.05, profundidade: 0.05, cor: "#5d5a56" },
    criar: (p) => {
      const g = new THREE.Group();
      const m = material(p.cor);
      const n = Math.max(2, Math.round(p.largura / 1.2));
      for (let i = 0; i <= n; i++) {
        const poste = cilindro(0.02, 0.02, p.altura, m, 8);
        poste.position.x = -p.largura / 2 + (i * p.largura) / n;
        g.add(poste);
      }
      const corrimao = bloco(p.largura, 0.04, 0.05, m);
      corrimao.position.y = p.altura;
      g.add(corrimao);
      return g;
    },
  },
};
