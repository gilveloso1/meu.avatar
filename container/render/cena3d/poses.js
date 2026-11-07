// Poses prontas, em camadas que se somam: uma do corpo (pernas e tronco) e outra dos braços,
// mais o formato das mãos. Uma pose pode ter "porPorte" no lugar de "juntas": os ângulos ajustados
// à mão para alguns portes (no visualizador, npm run maquete), interpolados para os outros.
// pose: ["sentada", "celular"] usa as duas; a última manda no que repetir.
// Os ângulos seguem corpo.js. "alvos" leva a mão a um ponto preso a uma junta (em frações da
// altura da pessoa; o x vale para a mão esquerda e é espelhado na direita), resolvido pela
// cinemática inversa depois que o corpo está no lugar. "pes" faz o mesmo com os tornozelos (o
// terceiro número é para onde o joelho aponta, no espaço da pelve).

const pernas = (v) => ({ coxaE: v.coxa, coxaD: v.coxa, joelhoE: v.joelho, joelhoD: v.joelho, ...(v.tornozelo ? { tornozeloE: v.tornozelo, tornozeloD: v.tornozelo } : {}) });

export const POSES = {
  // Corpo
  em_pe: { tipo: "corpo", descricao: "Em pé, reta, peso nas duas pernas", juntas: { coxaE: { abre: 2 }, coxaD: { abre: 2 } } },
  em_pe_apoio: {
    tipo: "corpo",
    descricao: "Em pé, natural, peso na perna direita e o joelho esquerdo solto",
    juntas: { pelve: { inclina: 4, gira: 6 }, cintura: { inclina: -3 }, peito: { inclina: -2 }, coxaD: { abre: 2 }, coxaE: { dobra: 8, abre: 7 }, joelhoE: { dobra: 14 }, tornozeloE: { aponta: 6 } },
  },
  andando: {
    tipo: "corpo",
    descricao: "No meio de um passo, perna esquerda à frente",
    juntas: { coxaE: { dobra: 24 }, joelhoE: { dobra: 8 }, tornozeloE: { aponta: -8 }, coxaD: { dobra: -12 }, joelhoD: { dobra: 10 }, tornozeloD: { aponta: 4 }, pontaD: { dobra: 10 }, bracoD: { dobra: 18, abre: 6 }, bracoE: { dobra: -16, abre: 6 }, cotoveloD: { dobra: 20 }, cotoveloE: { dobra: 10 } },
  },
  correndo: {
    tipo: "corpo",
    descricao: "Correndo, perna esquerda à frente e cotovelos dobrados",
    juntas: { cintura: { dobra: 12 }, coxaE: { dobra: 48 }, joelhoE: { dobra: 60 }, coxaD: { dobra: -22 }, joelhoD: { dobra: 65 }, tornozeloD: { aponta: 30 }, bracoE: { dobra: -35, abre: 8 }, bracoD: { dobra: 45, abre: 8 }, cotoveloE: { dobra: 90 }, cotoveloD: { dobra: 95 } },
  },
  sentada: { tipo: "corpo", descricao: "Sentada na cadeira, costas retas, pés no chão", juntas: { ...pernas({ coxa: { dobra: 90, abre: 4 }, joelho: { dobra: 90 } }) } },
  sentada_relaxada: { tipo: "corpo", descricao: "Sentada no sofá, encostada para trás", juntas: { pelve: { dobra: -14 }, cintura: { dobra: 4 }, peito: { dobra: 4 }, ...pernas({ coxa: { dobra: 78, abre: 6 }, joelho: { dobra: 92 } }) } },
  sentada_perna_cruzada: {
    tipo: "corpo",
    descricao: "Sentada na cadeira com a perna esquerda cruzada sobre a direita",
    colo: "E",
    juntas: { coxaD: { dobra: 88, abre: -4 }, joelhoD: { dobra: 90 }, coxaE: { dobra: 102, abre: -24, gira: 10 }, joelhoE: { dobra: 92 }, tornozeloE: { aponta: 20 } },
  },
  // Um pé à frente do outro, os dois no chão embaixo do joelho oposto, e os joelhos para fora.
  sentada_chao: { tipo: "corpo", descricao: "Sentada no chão de pernas cruzadas", colo: { E: ["pelve", [0.11, 0.1, 0.22], 80] }, juntas: { cintura: { dobra: 6 }, tornozeloE: { aponta: 60 }, tornozeloD: { aponta: 60 } }, pes: { E: ["pelve", [-0.03, -0.015, 0.21], [1, 0.3, 0.5]], D: ["pelve", [-0.02, -0.015, 0.1], [1, 0.3, 0.5]] } },
  // Quadril no chão, pés apoiados à frente e os joelhos para cima; as mãos sobre os joelhos.
  sentada_chao_joelhos: { tipo: "corpo", descricao: "Sentada no chão com os joelhos para cima", colo: { E: ["joelhoE", [0.012, 0.0, 0.05], 0] }, juntas: { cintura: { dobra: 14 } }, pes: { E: ["pelve", [0.07, -0.025, 0.3], [0.15, 1, 0.3]], D: ["pelve", [0.07, -0.025, 0.3], [0.15, 1, 0.3]] } },
  ajoelhada: { tipo: "corpo", descricao: "Ajoelhada, tronco reto", juntas: { ...pernas({ coxa: { dobra: 0, abre: 3 }, joelho: { dobra: 83 }, tornozelo: { aponta: 81 } }), pontaE: { dobra: 0 }, pontaD: { dobra: 0 } } },
  agachada: { tipo: "corpo", descricao: "Agachada, apoiada nos pés, com as mãos nos joelhos", pesRetos: true, colo: { E: ["joelhoE", [0.012, 0.04, 0.035], 0] }, juntas: { pelve: { dobra: 16 }, cintura: { dobra: 10 }, peito: { dobra: 4 }, ...pernas({ coxa: { dobra: 118, abre: 18 }, joelho: { dobra: 140 }, tornozelo: { aponta: -28 } }) } },
  // Deitar é o corpo inteiro girar (a pelve tem limite): de costas, a cabeça vai para −Z.
  deitada: { tipo: "corpo", descricao: "Deitada de costas, cabeça para trás (-Z)", deitada: true, juntas: { coxaE: { abre: 4 }, coxaD: { abre: 4 }, tornozeloE: { aponta: 8 }, tornozeloD: { aponta: 8 }, bracoE: { abre: 14 }, bracoD: { abre: 14 }, cotoveloE: { dobra: 10 }, cotoveloD: { dobra: 10 } } },
  inclinada: { tipo: "corpo", descricao: "Em pé, debruçada para a frente (como numa bancada)", juntas: { pelve: { dobra: 8 }, cintura: { dobra: 16 }, peito: { dobra: 8 }, coxaE: { abre: 3 }, coxaD: { abre: 3 } } },

  // Braços
  bracos_no_colo: { tipo: "bracos", descricao: "Sentada: braços dobrados, levantados um pouco, com as mãos sobre as coxas", alvos: { E: ["coxaE", [0.005, -0.15, 0.088]], D: ["coxaD", [0.005, -0.15, 0.088]] }, maos: { E: "relaxada", D: "relaxada" } },
  bracos_soltos: { tipo: "bracos", descricao: "Braços soltos ao lado do corpo", juntas: { bracoE: { abre: 7 }, bracoD: { abre: 7 }, cotoveloE: { dobra: 8 }, cotoveloD: { dobra: 8 } } },
  maos_na_cintura: { tipo: "bracos", descricao: "Mãos na cintura, cotovelos para fora", alvos: { E: ["cintura", [0.088, 0.02, 0.0]], D: ["cintura", [0.088, 0.02, 0.0]] }, maos: { E: "fechada", D: "fechada" } },
  // Braços cruzados ajustados à mão no visualizador (06/11/2026), um conjunto por porte; os portes
  // do meio são interpolados. O braço encosta no corpo de propósito: sem correção de colisão.
  bracos_cruzados: {
    tipo: "bracos",
    descricao: "Braços cruzados no peito",
    corrigirColisao: false,
    porPorte: {
      "0.75": {bracoE: {dobra: 13, abre: 5, gira: -60}, cotoveloE: {dobra: 106, gira: 11}, punhoE: {dobra: 16, desvia: 0}, bracoD: {dobra: 9, abre: -2, gira: -73}, cotoveloD: {dobra: 108, gira: 9}, punhoD: {dobra: 16, desvia: 0}},
      "1": {bracoE: {dobra: 11, abre: 1, gira: -60}, cotoveloE: {dobra: 104, gira: 28}, punhoE: {dobra: 16, desvia: 0}, bracoD: {dobra: 4, abre: -5, gira: -68}, cotoveloD: {dobra: 104, gira: 0}, punhoD: {dobra: 16, desvia: 0}},
      "1.35": {bracoE: {dobra: 46, abre: -11, gira: -59}, cotoveloE: {dobra: 90, gira: 24}, punhoE: {dobra: 16, desvia: 0}, bracoD: {dobra: 48, abre: -18, gira: -64}, cotoveloD: {dobra: 90, gira: 24}, punhoD: {dobra: 6, desvia: -13}},
    },
    maos: { E: "relaxada", D: "relaxada" },
  },
  // Pensando: a mão direita vai ao queixo (ponto preso à cabeça); o braço esquerdo, cruzado embaixo,
  // foi ajustado à mão no visualizador (06/11/2026), um conjunto por porte.
  pensando: {
    tipo: "bracos",
    descricao: "Mão direita no queixo, braço esquerdo cruzado embaixo",
    corrigirColisao: false,
    alvos: { D: ["cabeca", [0, 0.01, 0.1]] },
    porPorte: {
      "0.75": {bracoE: {dobra: 10, abre: -11, gira: -38}, cotoveloE: {dobra: 98, gira: 26}},
      "1": {bracoE: {dobra: 16, abre: 1, gira: -50}, cotoveloE: {dobra: 102, gira: 37}},
      "1.35": {cotoveloE: {dobra: 95, gira: 37}, bracoE: {dobra: 21, abre: -3, gira: -58}},
    },
    maos: { D: "fechada", E: "relaxada" },
  },
  acenando: { tipo: "bracos", descricao: "Acenando com a mão direita levantada", juntas: { bracoE: { abre: 7 }, cotoveloE: { dobra: 8 }, bracoD: { abre: 70, dobra: 15, gira: 75 }, cotoveloD: { dobra: 105 } }, maos: { D: "aberta" } },
  apontando: { tipo: "bracos", descricao: "Apontando para a frente com a mão direita", juntas: { bracoE: { abre: 7 }, cotoveloE: { dobra: 8 }, bracoD: { dobra: 82, abre: 8 }, cotoveloD: { dobra: 6 } }, maos: { D: "apontar" } },
  apontando_lado: { tipo: "bracos", descricao: "Apontando para o lado direito dela (mostrando algo)", juntas: { bracoE: { abre: 7 }, cotoveloE: { dobra: 8 }, bracoD: { abre: 68, dobra: 22 }, cotoveloD: { dobra: 12 } }, maos: { D: "apontar" } },
  // olhar: "maoD" faz a pessoa olhar para a mão direita (ou para o que ela segura), se a cena não disser outro.
  selfie: { tipo: "bracos", descricao: "Braço direito esticado à frente e acima, segurando o celular e olhando para ele", olhar: "maoD", alvos: { D: ["peito", [0.15, 0.22, 0.27]] }, juntas: { bracoE: { abre: 7 }, cotoveloE: { dobra: 10 } }, maos: { D: "segurando" } },
  segurando_na_frente: { tipo: "bracos", descricao: "As duas mãos à frente do peito, segurando algo", alvos: { E: ["peito", [0.035, 0.0, 0.17]], D: ["peito", [0.035, 0.0, 0.17]] }, maos: { E: "segurando", D: "segurando" } },
  mostrando_produto: { tipo: "bracos", descricao: "Mão direita perto do rosto, mostrando um produto", alvos: { D: ["peito", [0.17, 0.1, 0.15]] }, juntas: { bracoE: { abre: 7 }, cotoveloE: { dobra: 8 } }, maos: { D: "segurando" } },
  falando: { tipo: "bracos", descricao: "Gesticulando ao falar, mãos abertas à frente", juntas: { bracoE: { dobra: 18, abre: 16, gira: -12 }, bracoD: { dobra: 22, abre: 14, gira: -12 }, cotoveloE: { dobra: 78, gira: 40 }, cotoveloD: { dobra: 85, gira: 40 } }, maos: { E: "aberta", D: "aberta" } },
  celular: { tipo: "bracos", descricao: "Olhando o celular nas duas mãos, cabeça baixa", alvos: { E: ["peito", [0.025, -0.01, 0.19]], D: ["peito", [0.025, -0.01, 0.19]] }, juntas: { pescoco: { dobra: 18 }, cabeca: { dobra: 22 } }, maos: { E: "segurando", D: "segurando" } },
  bracos_para_cima: { tipo: "bracos", descricao: "Comemorando, braços para cima", juntas: { bracoE: { dobra: 165, abre: 18 }, bracoD: { dobra: 165, abre: 18 }, cotoveloE: { dobra: 15 }, cotoveloD: { dobra: 15 } }, maos: { E: "aberta", D: "aberta" } },
  segurando_caixa: { tipo: "bracos", descricao: "Segurando uma caixa na altura da cintura", alvos: { E: ["pelve", [0.12, 0.1, 0.2]], D: ["pelve", [0.12, 0.1, 0.2]] }, maos: { E: "aberta", D: "aberta" } },
  maos_no_bolso: { tipo: "bracos", descricao: "Mãos nos bolsos da frente", alvos: { E: ["pelve", [0.09, 0.0, 0.06]], D: ["pelve", [0.09, 0.0, 0.06]] }, maos: { E: "fechada", D: "fechada" } },
};

/** Formatos de mão (valores de corpo.js: 0 = esticado, 1 = fechado). */
export const MAOS = {
  relaxada: { curvar: 0.3, polegar: 0.2 },
  aberta: { curvar: 0, polegar: 0, abrir: 0.45 },
  fechada: { curvar: 1, polegar: 1 },
  segurando: { curvar: 0.62, polegar: 0.55 },
  apontar: { indicador: 0, medio: 1, anelar: 1, minimo: 1, polegar: 0.8 },
  joinha: { curvar: 1, polegar: 0 },
  paz: { indicador: 0, medio: 0, anelar: 1, minimo: 1, polegar: 0.9, abrir: 0.5 },
};

/**
 * Junta as camadas de uma lista de poses: { juntas, alvos, maos }. Sem pose do corpo, em_pe; sem
 * pose dos braços, bracos_soltos. Os alvos do lado direito chegam com o x espelhado.
 */
/** Os ângulos de uma pose com porPorte, no porte pedido (linear entre os portes ajustados). */
function noPorte(porPorte, porte) {
  const chaves = Object.keys(porPorte).map(Number).sort((a, b) => a - b);
  const p = Math.min(chaves[chaves.length - 1], Math.max(chaves[0], porte));
  let i = 0;
  while (i < chaves.length - 2 && p > chaves[i + 1]) i++;
  const [a, b] = [chaves[i], chaves[Math.min(i + 1, chaves.length - 1)]];
  const t = b === a ? 0 : (p - a) / (b - a);
  const ja = porPorte[String(a)];
  const jb = porPorte[String(b)];
  const juntas = {};
  for (const j of new Set([...Object.keys(ja), ...Object.keys(jb)])) {
    juntas[j] = {};
    for (const k of new Set([...Object.keys(ja[j] ?? {}), ...Object.keys(jb[j] ?? {})])) {
      juntas[j][k] = Math.round(((ja[j]?.[k] ?? 0) * (1 - t) + (jb[j]?.[k] ?? 0) * t) * 10) / 10;
    }
  }
  return juntas;
}

export function comporPoses(nomes, porte = 1) {
  const lista = [...nomes];
  if (!lista.some((n) => POSES[n]?.tipo === "corpo")) lista.unshift("em_pe");
  const temBracos = lista.some((n) => POSES[n]?.tipo === "bracos") || lista.some((n) => n === "andando" || n === "correndo");
  // Sentada ou agachada, os braços soltos entrariam no assento ou iriam ao chão: o padrão é
  // dobrá-los, com as mãos nas coxas ou nos joelhos.
  const sentada = lista.some((n) => n.startsWith("sentada") || n === "agachada");
  if (!temBracos) lista.splice(1, 0, sentada ? "bracos_no_colo" : "bracos_soltos");
  const juntas = {};
  const alvos = {};
  const pes = {};
  let pesRetos = false;
  let deitada = false;
  let corrigirColisao = true;
  let olhar;
  const maos = { E: "relaxada", D: "relaxada" };
  for (const nome of lista) {
    const p = POSES[nome];
    if (!p) continue;
    const daPose = p.porPorte ? noPorte(p.porPorte, porte) : p.juntas ?? {};
    for (const [j, v] of Object.entries(daPose)) juntas[j] = { ...v };
    for (const [lado, [junta, ponto]] of Object.entries(p.alvos ?? {})) {
      alvos[lado] = { junta, ponto: lado === "D" ? [-ponto[0], ponto[1], ponto[2]] : ponto };
      delete juntas[`braco${lado}`];
      delete juntas[`cotovelo${lado}`];
    }
    // Pose de braço com juntas para um lado tira o alvo antigo daquele lado.
    for (const lado of ["E", "D"]) if (daPose[`braco${lado}`] && !p.alvos?.[lado]) delete alvos[lado];
    Object.assign(maos, p.maos ?? {});
    if (p.pesRetos) pesRetos = true;
    if (p.deitada) deitada = true;
    // Pose que desliga o detector de colisão dos braços (o braço encosta no corpo de propósito).
    if (p.corrigirColisao === false) corrigirColisao = false;
    if (p.olhar) olhar = p.olhar;
    for (const [lado, [junta, ponto, dica]] of Object.entries(p.pes ?? {})) {
      const espelha = (v) => (lado === "D" ? [-v[0], v[1], v[2]] : v);
      pes[lado] = { junta, ponto: espelha(ponto), dica: espelha(dica ?? [0, 0, 1]) };
    }
  }
  // Perna cruzada: no colo, as duas mãos vão para o joelho de cima.
  const colo = lista.map((n) => POSES[n]?.colo).find(Boolean);
  if (typeof colo === "string" && lista.includes("bracos_no_colo")) {
    alvos.E = { junta: `coxa${colo}`, ponto: [0.02, -0.2, 0.088] };
    alvos.D = { junta: `coxa${colo}`, ponto: [-0.07, -0.19, 0.088] };
  }
  // A pose do corpo pode dizer onde ficam as mãos no colo: { E: [junta, ponto, gira], D: ... },
  // com gira (graus) virando a palma para cima, para a mão não entrar na perna.
  if (colo && typeof colo === "object" && lista.includes("bracos_no_colo")) {
    // Só a esquerda dada: a direita é o espelho dela.
    const lados = colo.D ? colo : { E: colo.E, D: colo.E };
    for (const [lado, [junta, ponto, gira]] of Object.entries(lados)) alvos[lado] = { junta: junta.replace(/(coxa|joelho|tornozelo)[ED]$/, `$1${lado}`), ponto: lado === "D" ? [-ponto[0], ponto[1], ponto[2]] : ponto, gira };
  }
  return { juntas, alvos, maos, pes, pesRetos, deitada, corrigirColisao, olhar };
}

