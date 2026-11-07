// Personagens prontos. Todos usam o MESMO esqueleto; só mudam cores, roupa, cabelo, chapéu e proporções.
// Cada preset tem "role" (papel narrativo sugerido) para o Claude escolher quem usar em cada cena.

import { makeCharacter } from './makeCharacter.js';

const SKIN = {
  clara: '#f3cfae',
  media: '#e0ac69',
  parda: '#c68642',
  escura: '#8d5524',
  muitoEscura: '#5c3a21',
};

export const PRESETS = {
  construtor: {
    role: 'Protagonista / narrador. Mestre de obras: explica o passo a passo da construção.',
    config: {
      skin: SKIN.media, height: 1, build: 1.05,
      top: { color: '#f28c28', stripe: '#f2f2f2', sleeves: 'short' },
      bottom: { color: '#3d5a80', type: 'pants' },
      shoes: '#5a3e2b',
      hair: { style: 'short', color: '#2f2118' },
      hat: { type: 'hardhat', color: '#ffc61a' },
      face: { mustache: true, facialHairColor: '#2f2118' },
    },
  },
  engenheiro: {
    role: 'Especialista técnico. Entra para explicar cálculo, projeto e normas. Já vem com prancheta na mão esquerda.',
    config: {
      skin: SKIN.clara, height: 1.02, build: 0.95,
      top: { color: '#7fb3d5', sleeves: 'long' },
      bottom: { color: '#4a4f57', type: 'pants' },
      shoes: '#2d2d2d',
      hair: { style: 'short', color: '#6b4a2b' },
      hat: { type: 'hardhat', color: '#f5f5f5' },
      face: { glasses: true },
      held: { L: 'clipboard' },
    },
  },
  engenheira: {
    role: 'Especialista técnica / supervisora de obra. Voz de autoridade amigável.',
    config: {
      skin: SKIN.escura, height: 0.96, build: 0.92,
      top: { color: '#ff8a3d', stripe: '#e8e8e8', sleeves: 'long' },
      bottom: { color: '#4a4f57', type: 'pants' },
      shoes: '#3a2a20',
      hair: { style: 'ponytail', color: '#1c1410' },
      hat: { type: 'hardhat', color: '#f5f5f5' },
    },
  },
  servente: {
    role: 'Ajudante de obra. Faz o trabalho braçal (cava, carrega, empurra). Já vem com pá na mão direita.',
    config: {
      skin: SKIN.muitoEscura, height: 1, build: 1.1,
      top: { color: '#9aa0a6', sleeves: 'short' },
      bottom: { color: '#b59a6a', type: 'shorts' },
      shoes: '#3b3b3b',
      hair: { style: 'short', color: '#16110d' },
      hat: { type: 'hardhat', color: '#2f6fd6' },
      held: { R: 'shovel' },
    },
  },
  homem: {
    role: 'Morador / pessoa comum (dono da casa, passante, curioso fazendo a pergunta do vídeo).',
    config: {
      skin: SKIN.clara, height: 1, build: 1,
      top: { color: '#5fae6b', sleeves: 'short' },
      bottom: { color: '#3d5a80', type: 'pants' },
      shoes: '#f2f2f2',
      hair: { style: 'fringe', color: '#6b4a2b' },
    },
  },
  mulher: {
    role: 'Moradora / pessoa comum (vizinha, mãe, passageira).',
    config: {
      skin: SKIN.media, height: 0.95, build: 0.92,
      top: { color: '#d96c8c', sleeves: 'short' },
      bottom: { color: '#7a5aa6', type: 'skirt' },
      shoes: '#5b2a3a',
      hair: { style: 'long', color: '#2a1a12' },
    },
  },
  velhinho: {
    role: 'Idoso curioso ou sábio. Bom para perguntas ("como isso se sustenta?") e humor.',
    config: {
      skin: SKIN.clara, height: 0.94, build: 1.08, stoop: 12,
      top: { color: '#8a6d4b', sleeves: 'long' },
      bottom: { color: '#c9b88f', type: 'pants' },
      shoes: '#4a3728',
      hair: { style: 'sides', color: '#e8e8e8' },
      face: { glasses: true, mustache: true, facialHairColor: '#e8e8e8', brow: '#cfcfcf' },
    },
  },
  velhinha: {
    role: 'Idosa curiosa ou sábia. Boa para reações e comentários simpáticos.',
    config: {
      skin: SKIN.parda, height: 0.9, build: 1, stoop: 10,
      top: { color: '#b08fd0', sleeves: 'long' },
      bottom: { color: '#8e6fb0', type: 'skirt' },
      shoes: '#3a3a3a',
      hair: { style: 'bun', color: '#efefef' },
      face: { glasses: true, brow: '#cfcfcf' },
    },
  },
  crianca: {
    role: 'Criança curiosa (menino). Faz as perguntas ingênuas que puxam a explicação.',
    config: {
      skin: SKIN.parda, height: 0.64, headScale: 1.18, build: 0.95,
      top: { color: '#f2d13a', sleeves: 'short' },
      bottom: { color: '#3d5a80', type: 'shorts' },
      shoes: '#d94f4f',
      hair: { style: 'short', color: '#2a1a12' },
      hat: { type: 'cap', color: '#d94f4f' },
    },
  },
  menina: {
    role: 'Criança curiosa (menina). Faz perguntas e reage com surpresa.',
    config: {
      skin: SKIN.escura, height: 0.62, headScale: 1.18, build: 0.92,
      top: { color: '#e8586a', sleeves: 'short' },
      bottom: { color: '#e8586a', type: 'skirt' },
      shoes: '#f2f2f2',
      hair: { style: 'ponytail', color: '#1c1410' },
    },
  },
  motorista: {
    role: 'Motorista (carro, ônibus, caminhão, metrô). Use com a animação sit (params: { arms: "wheel" }).',
    config: {
      skin: SKIN.media, height: 1, build: 1.15,
      top: { color: '#34495e', sleeves: 'short' },
      bottom: { color: '#2c3e50', type: 'pants' },
      shoes: '#222222',
      hair: { style: 'short', color: '#4a3020' },
      hat: { type: 'cap', color: '#1f2d3d' },
      face: { beard: true, facialHairColor: '#4a3020' },
    },
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

// makePreset('construtor', { top: { color: '#ff0000' } }) → personagem com ajustes por cima do preset.
export function makePreset(name, overrides = {}) {
  const p = PRESETS[name];
  if (!p) throw new Error(`Preset de personagem desconhecido: "${name}". Opções: ${PRESET_NAMES.join(', ')}`);
  return makeCharacter({ ...p.config, ...overrides, name: overrides.name || name,
    top: { ...(p.config.top || {}), ...(overrides.top || {}) },
    bottom: { ...(p.config.bottom || {}), ...(overrides.bottom || {}) },
    hair: { ...(p.config.hair || {}), ...(overrides.hair || {}) },
    hat: { ...(p.config.hat || {}), ...(overrides.hat || {}) },
    face: { ...(p.config.face || {}), ...(overrides.face || {}) },
    held: { ...(p.config.held || {}), ...(overrides.held || {}) },
    role: p.role,
  });
}
