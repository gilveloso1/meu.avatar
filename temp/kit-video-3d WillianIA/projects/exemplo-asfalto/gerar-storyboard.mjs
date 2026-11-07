// Storyboard de referência (30 cenas alinhadas à narração) — mostra TODOS os processos em animação.
// Rode: node projects/exemplo-asfalto/gerar-storyboard.mjs
import fs from 'node:fs';
const S = [];
const add = (inicio, fim, c) => S.push({ inicio, fim, ...c });

const casas = () => [
  { id: 'casaL', asset: 'casa_simples', pos: [-13, 0, -4], giro: 90 },
  { id: 'casaL2', asset: 'casa_colonial', pos: [-13.5, 0, 13], giro: 90 },
  { id: 'casaR', asset: 'sobrado', pos: [13, 0, 6], giro: -90 },
  { id: 'casaR2', asset: 'casa_simples', variante: 'azul', pos: [13, 0, -10], giro: -90 },
  { id: 'arv1', asset: 'arvore_redonda', pos: [8.2, 0.2, -2], params: { seed: 2 } },
  { id: 'arv2', asset: 'arvore_redonda', pos: [-8, 0.2, 7], params: { seed: 5 } },
  { id: 'poste', asset: 'poste_luz', pos: [6.1, 0.2, -7] },
];
const rua = (len = 70, p = {}) => ({ id: 'rua', asset: 'rua_reta', pos: [0, 0, 0], params: { length: len, ...p } });
const talk = (de, ate, extra = {}) => ({ clip: 'talk', de, ate, fala: true, camada: 1, mascara: ['head', 'face', 'armL'], ...extra });
const olhaCam = (em) => [{ em, alvo: 'camera' }];
const fl = (material, origem, destino, extra = {}) => ({ material, origem, ...(destino ? { destino } : {}), ...extra });
const NA_RUA = { fundo: 'cidade' };

// 1  gancho
add(0, 7.4, {
  ambiente: NA_RUA,
  objetos: [rua(), ...casas(), { id: 'cam', asset: 'caminhao_cacamba', variante: 'amarelo', pos: [1.7, 0.06, -28], giro: 0, movimentos: [{ de: 0, ate: 7.4, para: [1.7, 26] }] }],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [4.9, 0.2, 9], giro: 0, viraPara: olhaCam(0), acoes: [{ clip: 'talk', de: 0, ate: 7.4, fala: true }] }],
  fluxos: [fl('poeira', { ancora: 'cam', desloca: [0, 0.3, -3.5] }, null, { taxa: 12 })],
  camera: { tipo: 'travelling', de: { pos: [9.5, 1.8, 22], olha: [-1, 1.6, -8] }, para: { pos: [6.8, 1.5, 17], olha: [-1, 1.4, -8] }, fov: 40 },
  textos: [{ texto: 'COMO A RUA AGUENTA CAMINHÃO?', de: 0.2, ate: 7.2, estilo: 'titulo' }],
});
// 2  você vai construir uma rua
add(7.4, 11.6, {
  transicao: 'flash', ambiente: NA_RUA,
  objetos: [rua(), ...casas(), { id: 'carro', asset: 'carro_sedan', variante: 'taxi', pos: [-1.7, 0.06, 30], giro: 180, movimentos: [{ de: 7.4, ate: 11.6, para: [-1.7, -20] }] }],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [4.9, 0.2, 9], giro: 0, viraPara: olhaCam(7.4),
    acoes: [{ clip: 'surprised', de: 7.4, ate: 9.3 }, { clip: 'point', de: 9.5, ate: 11.6, params: { dir: 'forwardUp' } }, talk(7.4, 11.6)] }],
  camera: { tipo: 'enquadrar', alvo: 'guia', plano: 'medio', angulo: 25, elevacao: 8, aproxima: 0.85 },
  elementos: [{ tipo: 'icone', icone: 'interrogacao', ancora: 'guia', alturaRel: 1.3, dx: 0.2, de: 7.6, ate: 9.2, tamanho: 0.18, pulsa: true }],
});
// 3  primeiro, um chão firme: escavadeira nivelando a terra
add(11.6, 14.3, {
  transicao: 'flash', ambiente: { fundo: 'campo', chao: 'terra' },
  objetos: [{ id: 'esc', asset: 'escavadeira', pos: [2, 0, 0], giro: 0, params: { ciclo: 2.6, fase: -11.6 } },
    { id: 'monte', asset: 'monte', variante: 'terra', pos: [-3.2, 0, 0.6], etapa: [[11.6, 0.1], [14.3, 1]] },
    { id: 'barr', asset: 'barreira', pos: [0, 0, 7], params: { length: 3.5 } }],
  personagens: [
    { id: 'eng', preset: 'engenheira', pos: [-6, 0, 5], giro: 0, viraPara: olhaCam(11.6), acoes: [{ clip: 'point', de: 12, ate: 14.3, params: { dir: 'forward' } }] },
    { id: 'serv', preset: 'servente', pos: [5.5, 0, 5], giro: 0, viraPara: [{ em: 11.6, alvo: 'esc' }], acoes: [{ clip: 'dig', de: 11.6, ate: 14.3 }] },
  ],
  fluxos: [fl('poeira', [-3.2, 1.3, 0.6], null, { taxa: 10 })],
  camera: { tipo: 'enquadrar', alvo: 'esc', plano: 'geral', angulo: 40, elevacao: 14, deriva: -20 },
});
// 4  rolo pesado
add(14.3, 18.6, {
  transicao: 'flash', ambiente: { fundo: 'campo', chao: 'terra' },
  objetos: [{ id: 'rolo', asset: 'rolo_compressor', pos: [0, 0, 11], giro: 180, movimentos: [{ de: 14.3, ate: 18.6, para: [0, -9] }] },
    { id: 'cone1', asset: 'cone', pos: [4.5, 0, 3] }, { id: 'cone2', asset: 'cone', pos: [-4.5, 0, -3] }],
  personagens: [{ id: 'serv', preset: 'servente', pos: [-4.5, 0, 1], giro: 0, viraPara: [{ em: 14.3, alvo: 'rolo' }], acoes: [{ clip: 'point', de: 14.6, ate: 18.6, params: { dir: 'forward' } }] }],
  fluxos: [fl('poeira', { ancora: 'rolo', desloca: [0, 0.3, 1.6] }, null, { taxa: 14, vento: [0.8, 0] })],
  camera: { tipo: 'fixa', pos: [8.5, 3.2, 4], olha: 'rolo', fov: 40 },
});
// 5  se a terra ficar fofa a rua afunda; subleito
add(18.6, 24.3, {
  transicao: 'flash', ambiente: { fundo: 'campo' },
  objetos: [{ id: 'corte', asset: 'rua_camadas', pos: [0, 0, 0], etapa: [[18.6, 0], [22, 0.2]] }],
  personagens: [{ id: 'eng', preset: 'engenheira', pos: [-5.5, 0, 4], giro: 0, viraPara: olhaCam(18.6), acoes: [{ clip: 'point', de: 19, ate: 24.3, params: { dir: 'forward' } }] }],
  fluxos: [fl('terra', [0, 6, 0], [0, 0.6, 0], { taxa: 50, de: 18.8, ate: 21.6, espalha: 3 })],
  camera: { tipo: 'enquadrar', alvo: 'corte', plano: 'medio', angulo: 35, elevacao: 16, deriva: -12 },
  elementos: [
    { tipo: 'icone', icone: 'x', ancora: 'corte', alturaRel: 0.9, de: 18.9, ate: 22, tamanho: 0.24 },
    { tipo: 'etiqueta', texto: 'subleito', pos: [0.5, 0.3], de: 22.4, ate: 24.2 },
  ],
  efeitos: [{ tipo: 'pretoebranco', de: 18.8, ate: 22.2, zoom: 1.1 }],
});
// 6  terra sozinha vira lama quando chove
add(24.3, 27, {
  transicao: 'flash', ambiente: { fundo: 'campo', chao: 'terra', clima: 'chuva' },
  objetos: [{ id: 'cone1', asset: 'cone', pos: [3, 0, 3], aparece: 24.6 }],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [0, 0, 5], giro: 0, viraPara: olhaCam(24.3), acoes: [{ clip: 'surprised', de: 24.5, ate: 27 }] }],
  fluxos: [fl('agua', [0, 7, 5], [0, 0, 5], { taxa: 90, espalha: 6, dispersao: 5, vida: 0.7, tamanho: 0.09 })],
  camera: { tipo: 'enquadrar', alvo: 'guia', plano: 'medio', angulo: 15, elevacao: 6, aproxima: 0.85 },
});
// 7  pedra britada
add(27, 31, {
  transicao: 'flash', ambiente: { fundo: 'campo', chao: 'terra' },
  objetos: [{ id: 'cacamba', asset: 'caminhao_cacamba', pos: [0, 0, 0], giro: 90, etapa: [[27, 0], [29.6, 1]] },
    { id: 'monte', asset: 'monte', params: { material: 'brita', raio: 2.2 }, pos: [-5.8, 0, 0], etapa: [[27.5, 0.05], [31, 1]] }],
  personagens: [{ id: 'serv', preset: 'servente', pos: [-5.8, 0, 3.5], giro: 0, viraPara: [{ em: 27, alvo: 'monte' }], acoes: [{ clip: 'dig', de: 27, ate: 31 }] }],
  fluxos: [fl('pedra', { ancora: 'cacamba', desloca: [0, 1.8, -4.8] }, [-5.8, 0.8, 0], { taxa: 45, de: 28, ate: 30.6, espalha: 1.2 })],
  camera: { tipo: 'enquadrar', alvo: 'cacamba', plano: 'medio', angulo: 50, elevacao: 12, deriva: -15 },
});
// 8  sub-base
add(31, 35, {
  transicao: 'flash', ambiente: { fundo: 'campo' },
  objetos: [{ id: 'corte', asset: 'rua_camadas', pos: [0, 0, 0], etapa: [[31, 0.2], [35, 0.4]] }],
  personagens: [{ id: 'serv', preset: 'servente', pos: [-5.5, 0, 4], giro: 0, viraPara: [{ em: 31, alvo: 'corte' }], acoes: [{ clip: 'dig', de: 31, ate: 35 }] }],
  fluxos: [fl('brita', [0, 6, 0], [0, 1.1, 0], { taxa: 60, de: 31.2, ate: 34.2, espalha: 3.2 })],
  camera: { tipo: 'enquadrar', alvo: 'corte', plano: 'medio', angulo: -30, elevacao: 14, aproxima: 0.9 },
  elementos: [{ tipo: 'etiqueta', texto: 'sub-base', pos: [0.5, 0.3], de: 31.4, ate: 34.8 }],
});
// 9  base
add(35, 38.4, {
  transicao: 'flash', ambiente: { fundo: 'campo' },
  objetos: [{ id: 'corte', asset: 'rua_camadas', pos: [0, 0, 0], etapa: [[35, 0.4], [38.4, 0.6]] },
    { id: 'rolo', asset: 'rolo_compressor', pos: [-9, 0, 0], giro: 90, movimentos: [{ de: 35.5, ate: 38.4, para: [-5.5, 0] }] }],
  fluxos: [fl('pedra', [0, 6, 0], [0, 1.5, 0], { taxa: 50, de: 35.2, ate: 37.4, espalha: 3.2 })],
  camera: { tipo: 'enquadrar', alvo: 'corte', plano: 'medio', angulo: 28, elevacao: 18, deriva: 20 },
  elementos: [{ tipo: 'etiqueta', texto: 'base', pos: [0.5, 0.3], de: 35.3, ate: 38.2 }],
});
// 10  espalha o peso das rodas
add(38.4, 42.5, {
  transicao: 'flash', ambiente: { fundo: 'campo' },
  objetos: [{ id: 'corte', asset: 'rua_camadas', pos: [0, 0, 0], etapa: [[38.4, 0.6], [42.5, 0.6]] },
    { id: 'carro', asset: 'carro_sedan', variante: 'branco', pos: [0, 1.15, -2.5], giro: 0, movimentos: [{ de: 38.4, ate: 42.5, para: [0, 2.5] }], anim: { oscila: { eixo: 'y', amp: 0.02, freq: 3 } } }],
  camera: { tipo: 'fixa', pos: [6, 3.6, 12], olha: [0, 1.1, 0], fov: 38 },
  elementos: [
    { tipo: 'seta', direcao: 'baixo', pos: [0.4, 0.58], tamanho: 0.14, pulsa: true, de: 39.2, ate: 42.3 },
    { tipo: 'seta', direcao: 'baixo', pos: [0.6, 0.58], tamanho: 0.14, pulsa: true, de: 39.4, ate: 42.3 },
  ],
});
// 11  problema: o asfalto não gruda na pedra seca
add(42.5, 47.3, {
  transicao: 'flash', ambiente: { fundo: 'campo' },
  objetos: [{ id: 'corte', asset: 'rua_camadas', pos: [0, 0, 0], etapa: [[42.5, 0.6], [47.3, 0.6]] }],
  personagens: [{ id: 'eng', preset: 'engenheira', pos: [-5.5, 0, 4], giro: 0, viraPara: olhaCam(42.5), acoes: [{ clip: 'shrug', de: 43, ate: 47.3 }] }],
  fluxos: [fl('asfalto', [0, 6, 0], [0, 1.2, 0], { taxa: 40, de: 43.2, ate: 46.6, espalha: 3.4, vida: 0.9 })],
  camera: { tipo: 'enquadrar', alvo: 'corte', plano: 'medio', angulo: -25, elevacao: 20, aproxima: 0.85 },
  elementos: [{ tipo: 'icone', icone: 'x', ancora: 'corte', alturaRel: 0.9, de: 44.9, ate: 47.1, tamanho: 0.22 }],
  efeitos: [{ tipo: 'pretoebranco', de: 42.7, ate: 47.1, zoom: 1.1 }],
});
// 12  caminhão espirra o líquido preto
add(47.3, 50.5, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'esp', asset: 'espargidor', pos: [0, 0, -14], giro: 0, movimentos: [{ de: 47.3, ate: 50.5, para: [0, 10] }] },
    { id: 'cone1', asset: 'cone', pos: [4.5, 0, 2] }, { id: 'cone2', asset: 'cone', pos: [-4.5, 0, -6] }],
  fluxos: [fl('asfalto', { ancora: 'esp', desloca: [0, 0.6, -5.1] }, { ancora: 'esp', desloca: [0, 0.02, -6.8] }, { taxa: 70, dispersao: 1.3, espalha: 1.3 })],
  rastros: [{ seguir: 'esp', largura: 2.9, altura: 0.03, cor: '#15161a', recuo: 6.5, brilho: true }],
  camera: { tipo: 'enquadrar', alvo: 'esp', plano: 'medio', angulo: 150, elevacao: 12, aproxima: 0.9 },
});
// 13  imprimação
add(50.5, 55, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'esp', asset: 'espargidor', pos: [0, 0, -3], giro: 0, movimentos: [{ de: 50.5, ate: 55, para: [0, 8] }] }],
  personagens: [{ id: 'serv', preset: 'servente', pos: [4.5, 0, 2], giro: 0, viraPara: [{ em: 50.5, alvo: 'esp' }], acoes: [{ clip: 'point', de: 50.8, ate: 55, params: { dir: 'forward' } }] }],
  fluxos: [fl('asfalto', { ancora: 'esp', desloca: [0, 0.6, -5.1] }, { ancora: 'esp', desloca: [0, 0.02, -6.8] }, { taxa: 70, dispersao: 1.3, espalha: 1.3 })],
  rastros: [{ seguir: 'esp', largura: 2.9, altura: 0.03, cor: '#15161a', recuo: 6.5, brilho: true }],
  camera: { tipo: 'enquadrar', alvo: 'esp', plano: 'close', angulo: 165, elevacao: 8 },
  elementos: [{ tipo: 'etiqueta', texto: 'imprimação', pos: [0.5, 0.3], de: 53.6, ate: 54.9 }],
});
// 14  o asfalto de verdade ainda nem existe
add(55, 57.7, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'cone1', asset: 'cone', pos: [-3, 0, 4], aparece: 55.4 }, { id: 'cone2', asset: 'cone', pos: [3, 0, 4], aparece: 55.8 }, { id: 'barr', asset: 'barreira', pos: [0, 0, 5.5], aparece: 56.2 }],
  personagens: [{ id: 'eng', preset: 'engenheira', pos: [0, 0, 3], giro: 0, viraPara: olhaCam(55), acoes: [{ clip: 'shrug', de: 55.3, ate: 57.7 }] }],
  camera: { tipo: 'enquadrar', alvo: 'eng', plano: 'medio', angulo: 10, elevacao: 6, aproxima: 0.9 },
  elementos: [{ tipo: 'icone', icone: 'interrogacao', ancora: 'eng', alturaRel: 1.35, dx: 0.2, de: 55.3, ate: 57.5, tamanho: 0.16, pulsa: true }],
});
// 15  a usina
add(57.7, 62.5, {
  transicao: 'flash', ambiente: { fundo: 'industrial' },
  objetos: [{ id: 'usina', asset: 'fabrica_processo', pos: [0, 0, 0] },
    { id: 'cam', asset: 'caminhao_cacamba', pos: [9.5, 0, 14], giro: 0, movimentos: [{ de: 57.7, ate: 60.5, para: [9.5, 3.6] }] }],
  personagens: [{ id: 'eng', preset: 'engenheira', pos: [3, 0, 9], giro: 0, viraPara: olhaCam(57.7), acoes: [{ clip: 'point', de: 58, ate: 62.5, params: { dir: 'forwardUp' } }] }],
  camera: { tipo: 'enquadrar', alvo: 'usina', plano: 'geral', angulo: 25, elevacao: 12, deriva: -22 },
});
// 16  aquecido acima de cem graus
add(62.5, 67.2, {
  transicao: 'flash', ambiente: { fundo: 'industrial' },
  objetos: [{ id: 'usina', asset: 'fabrica_processo', pos: [0, 0, 0] }],
  fluxos: [fl('vapor', [9.6, 8.8, -3.2], null, { taxa: 12 })],
  camera: { tipo: 'travelling', de: { pos: [17, 10, 12], olha: [8, 11, -3] }, para: { pos: [14, 11, 5], olha: [8, 13, -3] }, fov: 42 },
  elementos: [
    { tipo: 'icone', icone: 'fogo', pos: [0.5, 0.45], tamanho: 0.2, pulsa: true, de: 62.9, ate: 67 },
    { tipo: 'etiqueta', texto: 'mais de 100 °C', pos: [0.5, 0.3], de: 63.4, ate: 67 },
  ],
  efeitos: [{ tipo: 'zoom', de: 62.5, ate: 67.2, para: 1.12 }],
});
// 17  a massa esfria rápido
add(67.2, 69.3, {
  transicao: 'flash', ambiente: { fundo: 'industrial' },
  objetos: [{ id: 'cam', asset: 'caminhao_cacamba', pos: [3, 0, 3], giro: 90 }, { id: 'cone1', asset: 'cone', pos: [8, 0, 6] }],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [-1, 0, 6], giro: 0, viraPara: olhaCam(67.2), acoes: [{ clip: 'surprised', de: 67.3, ate: 69.3 }] }],
  fluxos: [fl('vapor', { ancora: 'cam', desloca: [0, 2.2, -2] }, null, { taxa: 14 })],
  camera: { tipo: 'enquadrar', alvo: 'guia', plano: 'close', angulo: 15, elevacao: 5 },
});
// 18  viaja no caminhão
add(69.3, 74.8, {
  transicao: 'flash', ambiente: NA_RUA,
  objetos: [rua(), ...casas(), { id: 'cam', asset: 'caminhao_cacamba', variante: 'azul', pos: [1.7, 0.06, -24], giro: 0, movimentos: [{ de: 69.3, ate: 74.8, para: [1.7, 22] }] }],
  fluxos: [fl('vapor', { ancora: 'cam', desloca: [0, 2.3, -2.5] }, null, { taxa: 16 })],
  camera: { tipo: 'fixa', pos: [8, 1.8, 6], olha: 'cam', fov: 42 },
});
// 19  entra a vibroacabadora
add(74.8, 78, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'pav', asset: 'vibroacabadora', pos: [0, 0, -16], giro: 0, movimentos: [{ de: 74.8, ate: 78, para: [0, -8] }] },
    { id: 'cam', asset: 'caminhao_cacamba', pos: [0, 0, -7.8], giro: 0, movimentos: [{ de: 74.8, ate: 78, para: [0, 0.2] }] }],
  personagens: [{ id: 'serv', preset: 'servente', pos: [5, 0, -4], giro: 0, viraPara: [{ em: 74.8, alvo: 'pav' }], acoes: [{ clip: 'point', de: 75, ate: 78, params: { dir: 'forward' } }] }],
  fluxos: [fl('poeira', { ancora: 'pav', desloca: [0, 0.2, -3] }, null, { taxa: 10 })],
  camera: { tipo: 'enquadrar', alvo: 'pav', plano: 'medio', angulo: 60, elevacao: 14 },
});
// 20  recebe a massa e deixa uma camada lisa atrás (rastro de asfalto novo)
add(78, 83.8, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'pav', asset: 'vibroacabadora', pos: [0, 0, -8], giro: 0, movimentos: [{ de: 78, ate: 83.8, para: [0, 6] }] },
    { id: 'cam', asset: 'caminhao_cacamba', pos: [0, 0, 0.2], giro: 0, movimentos: [{ de: 78, ate: 83.8, para: [0, 14.2] }] }],
  rastros: [{ seguir: 'pav', largura: 3.3, altura: 0.07, cor: '#1f1f23', recuo: 2.6 }],
  fluxos: [
    fl('asfalto', { ancora: 'cam', desloca: [0, 1.8, -5.2] }, { ancora: 'pav', desloca: [0, 1.4, 2.4] }, { taxa: 40, espalha: 0.8 }),
    fl('vapor', { ancora: 'pav', desloca: [0, 0.2, -3.6] }, null, { taxa: 16, dispersao: 1.2 }),
  ],
  camera: { tipo: 'enquadrar', alvo: 'pav', plano: 'medio', angulo: 150, elevacao: 18, deriva: -20 },
});
// 21  mas ainda está fofo
add(83.8, 85.9, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'asf', asset: 'rua_reta', pos: [0, 0, -3], params: { length: 16, sidewalk: 0 } },
    { id: 'pav', asset: 'vibroacabadora', pos: [0, 0, 7], giro: 0, movimentos: [{ de: 83.8, ate: 85.9, para: [0, 9] }] }],
  fluxos: [fl('vapor', { ancora: 'pav', desloca: [0, 0.2, -3.6] }, null, { taxa: 16, dispersao: 1.2 })],
  camera: { tipo: 'fixa', pos: [3.4, 0.9, 3], olha: [0, 0.1, -4], fov: 42 },
});
// 22  rolos compactadores
add(85.9, 90.6, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'asf', asset: 'rua_reta', pos: [0, 0, 0], params: { length: 26, sidewalk: 0 } },
    { id: 'rolo1', asset: 'rolo_compressor', pos: [1.6, 0.06, -9], giro: 0, movimentos: [{ de: 85.9, ate: 88.3, para: [1.6, 9] }, { de: 88.3, ate: 90.6, para: [1.6, -9] }] },
    { id: 'rolo2', asset: 'rolo_compressor', variante: 'laranja', pos: [-1.6, 0.06, 9], giro: 180, movimentos: [{ de: 85.9, ate: 88.3, para: [-1.6, -9] }, { de: 88.3, ate: 90.6, para: [-1.6, 9] }] }],
  fluxos: [fl('vapor', { ancora: 'rolo1', desloca: [0, 0.3, 0] }, null, { taxa: 14, dispersao: 1.0 }), fl('vapor', { ancora: 'rolo2', desloca: [0, 0.3, 0] }, null, { taxa: 14, dispersao: 1.0 })],
  camera: { tipo: 'fixa', pos: [9, 3.5, 0], olha: [0, 0.5, 0], fov: 42 },
});
// 23  é aqui que ele ganha dureza
add(90.6, 93.5, {
  transicao: 'flash', ambiente: { fundo: 'cidade', chao: 'concreto' },
  objetos: [{ id: 'asf', asset: 'rua_reta', pos: [0, 0, 0], params: { length: 26, sidewalk: 0 } },
    { id: 'rolo1', asset: 'rolo_compressor', pos: [0, 0.06, 7], giro: 180, movimentos: [{ de: 90.6, ate: 93.5, para: [0, -3] }] }],
  personagens: [{ id: 'eng', preset: 'engenheira', pos: [5, 0.06, 0], giro: 0, viraPara: [{ em: 90.6, alvo: 'rolo1' }], acoes: [{ clip: 'point', de: 90.8, ate: 93.5, params: { dir: 'forward' } }] }],
  fluxos: [fl('vapor', { ancora: 'rolo1', desloca: [0, 0.3, 0] }, null, { taxa: 14, dispersao: 1.0 })],
  camera: { tipo: 'enquadrar', alvo: 'rolo1', plano: 'medio', angulo: 40, elevacao: 10 },
  elementos: [{ tipo: 'icone', icone: 'v', ancora: 'rolo1', alturaRel: 1.1, dx: 0.2, de: 91, ate: 93.3, tamanho: 0.2 }],
});
// 24  esfria e a rua abre
add(93.5, 97, {
  transicao: 'flash', ambiente: NA_RUA,
  objetos: [rua(), ...casas(), { id: 'carro', asset: 'carro_sedan', variante: 'taxi', pos: [1.7, 0.06, -26], giro: 0, movimentos: [{ de: 93.5, ate: 97, para: [1.7, 26] }] }],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [4.9, 0.2, -6], giro: 0, movimentos: [{ de: 93.5, ate: 97, para: [4.9, 12], clip: 'walk' }], acoes: [{ clip: 'wave', de: 94.5, ate: 96.5, camada: 1, mascara: ['armR', 'head'] }] }],
  camera: { tipo: 'fixa', pos: [9, 1.5, 6], olha: 'carro', fov: 42 },
});
// 25  um detalhe que ninguém repara
add(97, 99.7, {
  transicao: 'flash', ambiente: NA_RUA,
  objetos: [rua(), ...casas(), { id: 'carro', asset: 'carro_sedan', variante: 'azul', pos: [-1.7, 0.06, -26], giro: 0, movimentos: [{ de: 97, ate: 99.7, para: [-1.7, 5] }] }],
  personagens: [{ id: 'eng', preset: 'engenheira', pos: [4.9, 0.2, 6], giro: 0, viraPara: olhaCam(97), acoes: [{ clip: 'point', de: 97.2, ate: 99.7, params: { dir: 'forwardUp' } }] }],
  camera: { tipo: 'travelling', de: { pos: [0.4, 0.9, 27], olha: [0, 0.7, -20] }, para: { pos: [0.4, 0.6, 15], olha: [0, 0.5, -20] }, fov: 44 },
});
// 26  mais alta no meio
add(99.7, 101.9, {
  transicao: 'flash', ambiente: NA_RUA,
  objetos: [rua(), ...casas(), { id: 'carro', asset: 'carro_sedan', variante: 'branco', pos: [1.7, 0.06, -20], giro: 0, movimentos: [{ de: 99.7, ate: 101.9, para: [1.7, 8] }] }],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [4.9, 0.2, 8], giro: 0, viraPara: olhaCam(99.7), acoes: [{ clip: 'point', de: 99.9, ate: 101.9, params: { dir: 'side' } }] }],
  camera: { tipo: 'fixa', pos: [0, 1.0, 16], olha: [0, 0.3, 0], fov: 46 },
  elementos: [
    { tipo: 'seta', direcao: 'cima', pos: [0.5, 0.62], tamanho: 0.2, pulsa: true },
    { tipo: 'etiqueta', texto: 'mais alta no meio', pos: [0.5, 0.3] },
  ],
});
// 27  empurra a água da chuva para os lados
add(101.9, 106.9, {
  transicao: 'flash', ambiente: { fundo: 'cidade', clima: 'chuva' },
  objetos: [rua(), ...casas(), { id: 'bu1', asset: 'bueiro', pos: [3.0, 0.06, 5], giro: 90 }, { id: 'bu2', asset: 'bueiro', pos: [-3.0, 0.06, 5], giro: 90 },
    { id: 'carro', asset: 'carro_sedan', variante: 'taxi', pos: [1.7, 0.06, -20], giro: 0, movimentos: [{ de: 101.9, ate: 106.9, para: [1.7, 12] }] }],
  fluxos: [
    fl('agua', [0, 0.5, 3], [-3.2, 0.1, 5], { taxa: 40, arco: 0.2, tamanho: 0.1, espalha: 0.5 }),
    fl('agua', [0, 0.5, 3], [3.2, 0.1, 5], { taxa: 40, arco: 0.2, tamanho: 0.1, espalha: 0.5 }),
    fl('agua', [0, 7, 6], [0, 0, 6], { taxa: 70, espalha: 7, dispersao: 6, tamanho: 0.08 }),
  ],
  camera: { tipo: 'fixa', pos: [0, 1.1, 14], olha: [0, 0.3, 0], fov: 46 },
  elementos: [{ tipo: 'seta', direcao: 'horizontal', pos: [0.5, 0.66], tamanho: 0.58, de: 102.4, ate: 106.7 }],
});
// 28  sem isso a água ficaria parada
add(106.9, 108.9, {
  transicao: 'flash', ambiente: { fundo: 'cidade', clima: 'chuva' },
  objetos: [rua(), ...casas()],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [4.9, 0.2, 9], giro: 0, viraPara: olhaCam(106.9), acoes: [{ clip: 'shrug', de: 107, ate: 108.9 }] }],
  fluxos: [fl('agua', [0, 7, 6], [0, 0, 6], { taxa: 80, espalha: 7, dispersao: 6, tamanho: 0.08 })],
  camera: { tipo: 'fixa', pos: [4, 1.0, 12], olha: [0, 0.2, 0], fov: 46 },
  efeitos: [{ tipo: 'pretoebranco', de: 107, ate: 108.8, zoom: 1.08 }],
});
// 29  embaixo dela tem terra, pedra e muito trabalho
add(108.9, 114.7, {
  transicao: 'flash', ambiente: { fundo: 'campo' },
  objetos: [{ id: 'corte', asset: 'rua_camadas', pos: [0, 0, 0], anim: { gira: 6 } },
    { id: 'carro', asset: 'carro_sedan', variante: 'azul', pos: [0, 1.35, -2.5], giro: 0, movimentos: [{ de: 108.9, ate: 114.7, para: [0, 2.5] }] }],
  personagens: [{ id: 'eng', preset: 'engenheira', pos: [-5.8, 0, 4.5], giro: 0, viraPara: olhaCam(108.9), acoes: [{ clip: 'point', de: 109.2, ate: 114.7, params: { dir: 'forward' } }] }],
  camera: { tipo: 'enquadrar', alvo: 'corte', plano: 'medio', angulo: 30, elevacao: 18, deriva: 55 },
});
// 30  pergunta final
add(114.7, 120.9, {
  transicao: 'flash', ambiente: NA_RUA,
  objetos: [rua(), ...casas()],
  personagens: [{ id: 'guia', preset: 'construtor', pos: [0.5, 0.06, 10], giro: 0, viraPara: olhaCam(114.7), acoes: [{ clip: 'talk', de: 114.7, ate: 120.9, fala: true, expressao: 'happy' }] }],
  camera: { tipo: 'enquadrar', alvo: 'guia', plano: 'medio', angulo: 0, elevacao: 6, aproxima: 0.88 },
  textos: [{ texto: 'VOCÊ SABIA DAS CAMADAS? COMENTA!', de: 115, ate: 120.9, estilo: 'pergunta' }],
});

const sb = {
  versao: 1, titulo: 'Como é feito o asfalto da rua',
  formato: { largura: 1080, altura: 1920, fps: 30 }, duracao: 120.9,
  audio: 'narracao.wav', palavras: 'palavras.json', legendas: { ativo: true },
  ambiente: { horario: 'dia', fundo: 'cidade' }, cenas: S,
};
fs.writeFileSync(new URL('./storyboard.json', import.meta.url), JSON.stringify(sb, null, 2) + '\n');
console.log(S.length, 'cenas');
