// Gera o catálogo a partir do próprio código (fonte única da verdade): rode `npm run catalog` sempre
// que mudar personagens, animações ou parâmetros.
//   catalog/catalog.json  → máquina (validações, outras ferramentas)
//   catalog/CATALOG.md    → o Claude lê isto como "diretor" antes de montar uma cena

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MATERIAIS } from '../engine/fluxos.js';
import {
  PRESETS, PRESET_NAMES, CLIPS, CLIP_NAMES, EXPRESSIONS, HAIR_STYLES, HAT_TYPES, HELD_ITEMS,
  DEFAULT_CONFIG, JOINTS, GROUPS, SCENERY, SCENERY_IDS, CATEGORIES, makeScenery, sceneryBox,
} from '../assets/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'catalog');
fs.mkdirSync(outDir, { recursive: true });

const heightOf = (c) => +(1.72 * (c.height ?? 1)).toFixed(2);

const characters = PRESET_NAMES.map((name) => {
  const p = PRESETS[name];
  const c = { ...DEFAULT_CONFIG, ...p.config };
  return {
    id: name,
    role: p.role,
    approxHeightM: heightOf(c),
    hat: c.hat?.type && c.hat.type !== 'none' ? c.hat.type : null,
    hair: c.hair?.style,
    top: c.top?.color,
    sleeves: c.top?.sleeves ?? 'short',
    bottom: c.bottom?.type ?? 'pants',
    held: Object.fromEntries(Object.entries(c.held || {}).filter(([, v]) => v && v !== 'none')),
    stoop: c.stoop || 0,
  };
});

const clips = CLIP_NAMES.map((name) => {
  const c = CLIPS[name];
  return {
    id: name,
    description: c.description,
    loop: c.loop,
    durationS: c.duration,
    affects: c.affects,
    grounded: c.grounded !== false,
    metersPerSecond: c.metersPerSecond ?? null,
    params: Object.fromEntries(Object.entries(c.params || {}).map(([k, v]) => [k, { default: v.default, description: v.description }])),
  };
});

// Cenário: mede cada asset montando-o de verdade (tamanho nunca fica desatualizado).
const scenery = SCENERY_IDS.map((id) => {
  const def = SCENERY[id];
  const obj = makeScenery(id);
  const size = sceneryBox(obj).getSize(new THREE.Vector3());
  let wheels = false;
  obj.traverse((o) => { if (o.userData.wheelRadius) wheels = true; });
  const meshes = (() => { let n = 0; obj.traverse((o) => { if (o.isMesh) n++; }); return n; })();
  return {
    id,
    category: def.category,
    label: def.label,
    description: def.description,
    sizeM: { x: +size.x.toFixed(1), y: +size.y.toFixed(1), z: +size.z.toFixed(1) },
    meshes,
    params: Object.fromEntries(Object.entries(def.params || {}).map(([k, v]) => [k, { default: v[0], description: v[1] }])),
    variants: Object.keys(def.variants || {}),
    setProgress: !!obj.userData.setProgress,
    update: !!obj.userData.update,
    wheels,
    stages: obj.userData.layers || null,
  };
});

const json = {
  generatedFrom: 'assets/',
  conventions: {
    units: 'metros', facing: '+Z', leftOfCharacter: '+X', adultHeightM: 1.72, childScale: 0.64,
    angles: 'graus nas animações; radianos no Three.js',
  },
  joints: JOINTS,
  maskGroups: GROUPS,
  characters,
  clips,
  scenery,
  expressions: Object.keys(EXPRESSIONS),
  options: { hairStyles: HAIR_STYLES, hatTypes: HAT_TYPES, heldItems: HELD_ITEMS, defaultConfig: DEFAULT_CONFIG },
};
fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(json, null, 2) + '\n');

// ---------- Markdown ----------
const paramText = (params) => {
  const entries = Object.entries(params);
  if (!entries.length) return '—';
  return entries.map(([k, v]) => `\`${k}\` (padrão ${JSON.stringify(v.default)}): ${v.description}`).join('<br>');
};

const md = `# Catálogo de assets — Kit de vídeo 3D simples

> Gerado automaticamente por \`npm run catalog\` a partir do código em \`assets/\`. Não edite à mão.
> Você (Claude) é o **diretor**: escolhe personagens e animações deste catálogo e escreve só o roteiro de cenas.
> **Não reescreva os personagens nem as animações.** Se faltar algo, crie um asset novo em \`assets/\` e rode \`npm run catalog\`.

## 1. Como usar

\`\`\`js
import * as THREE from 'three';
import { makePreset, animate, moveSpeed } from './assets/index.js';

const guia = makePreset('construtor');            // personagem pronto
scene.add(guia.root);                             // guia.root é um THREE.Group
guia.root.position.set(0, 0, 0);
guia.root.rotation.y = Math.PI / 2;               // vira para +X (padrão: olha para +Z)

// A CADA FRAME, com t em segundos (nunca use relógio/requestAnimationFrame para animar):
animate(guia, [
  [ { clip: 'walk', start: 0, end: 3 },
    { clip: 'point', start: 3, end: 6, params: { dir: 'up' } } ],           // camada 0: corpo
  [ { clip: 'talk', start: 1, end: 6, mask: ['head', 'face'] } ],           // camada 1: sobrepõe só cabeça/rosto
], t);

// Enquanto ele anda, mova o personagem na velocidade certa (pés não patinam):
guia.root.position.x = moveSpeed(guia, 'walk') * Math.min(t, 3);
\`\`\`

- **Variações**: \`makePreset('construtor', { name: 'construtor2', top: { color: '#c0392b' }, hat: { color: '#ffffff' } })\`. Dê um \`name\` único para cada cópia (muda o ritmo do piscar).
- **Personagem novo do zero**: \`makeCharacter({ ... })\` (ver opções na seção 4).
- **Um clip só**: \`playClip(personagem, 'wave', t)\`.
- **Resultado é função pura de \`t\`**: pode renderizar qualquer frame em qualquer ordem (obrigatório para gerar vídeo frame a frame no HyperFrames/Remotion).
- Prévia visual: \`npm run preview\` e abra http://localhost:5173 (escolha personagem, animação e expressão).

## 2. Convenções

| Item | Valor |
|---|---|
| Unidades | metros; pés em y = 0 |
| Direção | o personagem olha para **+Z**; \`root.rotation.y\` gira o personagem |
| Lado | esquerdo do personagem = **+X** |
| Altura | adulto ≈ ${json.conventions.adultHeightM} m; criança usa escala ≈ ${json.conventions.childScale} |
| Esqueleto | o MESMO para todos: ${JOINTS.join(', ')} |
| Grupos de máscara | ${Object.keys(GROUPS).map((g) => `\`${g}\``).join(', ')} |
| Escala dos clips | \`seatHeight\` e afins estão em metros do personagem **antes** da escala \`height\` |

## 3. Personagens prontos

| id | papel sugerido | altura aprox. | chapéu | cabelo | camisa | veste | na mão |
|---|---|---|---|---|---|---|---|
${characters.map((c) => `| \`${c.id}\` | ${c.role} | ${c.approxHeightM} m | ${c.hat ?? '—'} | ${c.hair} | ${c.top} (${c.sleeves === 'long' ? 'manga longa' : 'manga curta'}) | ${c.bottom} | ${Object.entries(c.held).map(([h, i]) => `${i} (${h === 'R' ? 'direita' : 'esquerda'})`).join(', ') || '—'} |`).join('\n')}

Dicas de elenco: \`construtor\` é o protagonista/narrador; \`engenheiro\`/\`engenheira\` explicam o técnico; \`servente\` faz o braçal; \`homem\`, \`mulher\`, \`velhinho\`, \`velhinha\`, \`crianca\`, \`menina\` são moradores/curiosos que fazem as perguntas; \`motorista\` dirige. Mantenha o MESMO personagem para o MESMO papel durante o vídeo inteiro (consistência).

## 4. Opções para criar/ajustar personagens (\`makeCharacter\` / overrides de \`makePreset\`)

| Campo | Valores |
|---|---|
| \`skin\` | cor hex (ex.: ${['#f3cfae', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'].join(', ')}) |
| \`height\` | escala uniforme (adulto 1, criança ≈ 0.64) |
| \`build\` | largura do corpo (0.85 magro … 1.3 largo) |
| \`headScale\` | cabeça maior/menor (crianças ≈ 1.18) |
| \`top\` | \`{ color, stripe (cor das faixas ou null), sleeves: 'short' \\| 'long' }\` |
| \`bottom\` | \`{ color, type: 'pants' \\| 'shorts' \\| 'skirt' }\` |
| \`shoes\` | cor hex |
| \`hair\` | \`{ style: ${HAIR_STYLES.map((s) => `'${s}'`).join(' | ')}, color }\` (com chapéu, o topo do cabelo some) |
| \`hat\` | \`{ type: ${HAT_TYPES.map((s) => `'${s}'`).join(' | ')}, color }\` |
| \`face\` | \`{ brow, glasses, mustache, beard, facialHairColor }\` |
| \`held\` | \`{ R, L }\` com ${HELD_ITEMS.map((s) => `'${s}'`).join(' | ')} |
| \`stoop\` | costas curvadas em graus (idosos ≈ 10) |

## 5. Animações

Todas funcionam em QUALQUER personagem. "Loop" repete; os demais tocam uma vez e **seguram a pose final**.

| clip | o que faz | loop | duração | afeta | parâmetros |
|---|---|---|---|---|---|
${clips.map((c) => `| \`${c.id}\` | ${c.description}${c.metersPerSecond ? ` Desloca-se a ${c.metersPerSecond} m/s (adulto, speed=1).` : ''} | ${c.loop ? 'sim' : 'não'} | ${c.durationS}s | ${c.affects.join(', ')} | ${paramText(c.params)} |`).join('\n')}

Regras da linha do tempo (\`animate\`):
- Cada **camada** é uma lista de segmentos \`{ clip, start, end?, speed?, params?, fade?, mask?, expression? }\` em ordem de início.
- Camada 0 = corpo base (sem segmento ativo → \`idle\`). Camadas seguintes **sobrepõem só** as juntas do clip; use \`mask\` (ex.: \`['head','face']\`, \`['armR']\`) para limitar.
- Entre segmentos seguidos da mesma camada há transição suave de \`fade\` segundos (padrão 0.3).
- \`speed\` acelera/desacelera o clip. Clips de um lado só aceitam \`params: { side: 'L' }\`.
- Para andar/correr/empurrar/carregar, mova \`root.position\` com \`moveSpeed(personagem, clip, params)\`.
- Lip-sync: no clip \`talk\`, passe \`params: { mouthOpen }\` (0..1, vindo do volume do áudio) a cada frame; sem isso a boca usa fala simulada.

## 6. Expressões

${Object.keys(EXPRESSIONS).map((e) => `\`${e}\``).join(', ')} — use \`expression: 'happy'\` no segmento (ou em \`playClip\`). O clip pode ter rosto próprio (ex.: \`talk\`); a expressão informada prevalece. Os personagens piscam sozinhos.

## 7. Cenário

Mesmas convenções dos personagens (metros, frente para **+Z**, origem no centro da base, \`y = 0\` é o chão). Todos os assets têm **variantes** prontas (\`makeScenery('casa_simples', { variant: 'verde' })\`) e parâmetros (\`makeScenery('arvore_redonda', { height: 8, seed: 4 })\`); o \`seed\` varia o formato de árvores, mantendo o mesmo resultado para o mesmo número.

\`\`\`js
import { makeScenery, setProgress, updateScenery, rollWheels, setupEnvironment, makePreset } from './assets/index.js';

setupEnvironment(scene, { time: 'dia', area: 20 });          // céu, luz e sombra padrão ('dia' | 'tarde' | 'nublado')
const chao = makeScenery('chao', { type: 'grama', size: 60 }); scene.add(chao);
const casa = makeScenery('casa_simples', { variant: 'verde' });
casa.position.set(-8, 0, -6); casa.rotation.y = Math.PI / 2;  // gira a fachada (padrão: olha para +Z)
scene.add(casa);

const obra = makeScenery('casa_obra'); scene.add(obra);
setProgress(obra, t / 20);                                    // etapa 0..1 em função do tempo (frame a frame)

const taxi = makeScenery('carro_sedan', { variant: 'taxi' }); scene.add(taxi);
taxi.position.z = 4 * t; rollWheels(taxi, 4 * t);             // anda e as rodas giram juntas
updateScenery(betoneira, t);                                  // tambor da betoneira gira
\`\`\`

**Alturas do piso** (onde pôr \`personagem.root.position.y\`): chão/grama 0; asfalto 0.06; calçada 0.20 (meio-fio); tabuleiro da ponte = parâmetro \`height\`.
**Escala de referência:** adulto 1.72 m; porta ≈ 2.1 m; pé-direito 2.8 m; carro 4.4 m.
**Peso:** cada malha é um objeto; prédios com muitas janelas têm 100–200. Evite muitas cópias dos maiores (\`predio_apartamentos\`, \`predio_estrutura\`) na mesma cena.
**Como animar:** \`setProgress(obj, 0..1)\` nos assets marcados "etapas"; \`updateScenery(obj, t)\` nos marcados "tempo"; \`rollWheels(obj, metros)\` em veículos, carrinho de mão e rolo compressor.

${Object.entries(CATEGORIES).map(([cat, title]) => {
  const rows = scenery.filter((s) => s.category === cat);
  if (!rows.length) return '';
  return `### ${title}

| id | o que é | tamanho (x × z × altura) | parâmetros | variantes | animação |
|---|---|---|---|---|---|
${rows.map((s) => `| \`${s.id}\` | ${s.description} | ${s.sizeM.x} × ${s.sizeM.z} × ${s.sizeM.y} m | ${Object.keys(s.params).length ? Object.entries(s.params).map(([k, v]) => `\`${k}\` (${JSON.stringify(v.default)}): ${v.description}`).join('<br>') : '—'} | ${s.variants.length ? s.variants.map((v) => `\`${v}\``).join(', ') : '—'} | ${[s.setProgress ? 'etapas (`setProgress`)' : '', s.update ? 'tempo (`updateScenery`)' : '', s.wheels ? 'rodas (`rollWheels`)' : ''].filter(Boolean).join(', ') || '—'} |`).join('\n')}
`;
}).join('\n')}
${scenery.filter((s) => s.stages).map((s) => `- \`${s.id}\` empilha, de baixo para cima: ${s.stages.join(' → ')}.`).join('\n')}
- \`casa_obra\`: fundação (0–0.1) → pilares (–0.25) → paredes de tijolo (–0.55) → laje (–0.65) → madeiramento (–0.82) → telhas (–1).
- \`predio_estrutura\`: cada andar sobe (pilares, depois laje) em sequência até o último.

## 8. Limites conhecidos (seja honesto no roteiro)

- Corpo de peças rígidas (sem pele/skinning): braços e pernas não deformam; mãos sem dedos.
- Na caminhada o pé pode afundar até ~3 cm no chão no fim do passo e o pé de apoio desliza ~0.15 m/s: invisível em plano aberto, evite close nos pés.
- \`sit\` não cria a cadeira: posicione o assento em \`seatHeight\`; mãos em \`arms: 'wheel'\` não seguram um volante real.
- \`think\` levanta a mão esquerda até o queixo: com a prancheta do \`engenheiro\` fica estranho; use \`read_clipboard\`.
- Itens nas mãos são rígidos e não mudam a pose automaticamente (use \`hammer\` com martelo, \`dig\` com pá).
- Cenário: fachadas só têm janelas/portas "coladas" (sem buracos nas paredes) e não há interior das casas. O telhado não tem calhas nem beiral detalhado.
- \`predio_apartamentos\` e \`predio_estrutura\` têm muitas peças; não há estádio, metrô, elevador nem interior de prédio ainda.
- Veículos: sem interior detalhado e sem motorista. Para pôr o \`motorista\`, posicione-o dentro e use \`sit\` com \`arms: 'wheel'\`.
`;
fs.writeFileSync(path.join(outDir, 'CATALOG.md'), md);

// Resumo compacto (~3 mil tokens): é o que o agente lê primeiro; o CATALOG.md fica para consulta de detalhes.
const curto = (s) => s.split(/\.\s/)[0].replace(/\.$/, '');
const resumo = `# Resumo do catálogo

> Leia este arquivo primeiro (é curto). Detalhes de parâmetros, alturas de piso e exemplos: \`CATALOG.md\`. Gerado por \`npm run catalog\`.
> Convenções: metros; \`giro: 0\` olha para +Z; adulto = 1.72 m; asfalto y=0.06, calçada y=0.20.

## Motor: o que o storyboard sabe fazer (detalhes em docs/storyboard.md e docs/processos.md)
- **Fundos reais (sempre um):** campo, cidade, floresta, deserto, litoral, industrial, interior. Chão: grama, terra, areia, concreto, asfalto, madeira, piso. Clima: limpo, chuva. Horário: dia, tarde, nublado.
- **fluxos** (partículas do processo), materiais: ${Object.keys(MATERIAIS).join(', ')}. Origem/destino por ponto ou \`ancora\`; \`caminho\` para canos/fios.
- **rastros** (faixa atrás de máquina), **anim** (pos/giro/gira/escala/oscila/pulsa), **opacidade**, **etapa**, **aparece/some**, **movimentos**, **viraPara**.
- **elementos** (seta, icone, etiqueta), **efeitos** (pretoebranco, zoom, tremor) e **textos** (titulo, destaque, pergunta).

## Personagens (\`preset\`)
${characters.map((c) => `- \`${c.id}\` (${c.approxHeightM} m): ${curto(c.role)}`).join('\n')}
Opções em \`overrides\`: skin, height, build, headScale, top{color,stripe,sleeves}, bottom{color,type}, shoes, hair{style,color}, hat{type,color}, face{glasses,mustache,beard}, held{R,L}, stoop.
Cabelos: ${HAIR_STYLES.join(', ')}. Chapéus: ${HAT_TYPES.join(', ')}. Itens: ${HELD_ITEMS.join(', ')}.

## Animações (\`clip\` e \`params\`)
${clips.map((c) => `- \`${c.id}\` (${c.loop ? 'loop' : 'segura a pose'}, ${c.affects.join('/')})${Object.keys(c.params).length ? ` params: ${Object.entries(c.params).map(([k, v]) => `${k}=${JSON.stringify(v.default)}`).join(', ')}` : ''}: ${curto(c.description)}${c.metersPerSecond ? ` [desloca ${c.metersPerSecond} m/s]` : ''}`).join('\n')}
Expressões: ${Object.keys(EXPRESSIONS).join(', ')}. Máscaras: ${Object.keys(GROUPS).join(', ')}.

## Cenário (\`asset\`, \`variante\`, \`params\`)
${Object.entries(CATEGORIES).map(([cat, title]) => {
  const rows = scenery.filter((s) => s.category === cat);
  return `### ${title}\n${rows.map((s) => `- \`${s.id}\` ${s.sizeM.x}×${s.sizeM.z}×${s.sizeM.y} m${s.variants.length ? ` variantes: ${s.variants.join(', ')}` : ''}${Object.keys(s.params).length ? ` | params: ${Object.entries(s.params).map(([k, v]) => `${k}=${JSON.stringify(v.default)}`).join(', ')}` : ''}${s.setProgress ? ' | ETAPAS (etapa)' : ''}${s.update ? ' | gira sozinho' : ''}${s.wheels ? ' | rodas giram ao mover' : ''}: ${curto(s.description)}`).join('\n')}`;
}).join('\n\n')}
`;
fs.writeFileSync(path.join(outDir, 'RESUMO.md'), resumo);
console.log(`Catálogo gerado: ${characters.length} personagens, ${clips.length} animações, ${Object.keys(EXPRESSIONS).length} expressões, ${scenery.length} assets de cenário.`);
