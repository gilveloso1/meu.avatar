/**
 * Os comandos da API dos projetos (docs/api.md): quem edita diz o que quer ("cole este
 * vídeo depois daquele"), não a geometria do canvas. Tudo passa pelo mesmo modelo da tela
 * (src/canvas/modelo.js), com as mesmas regras. Um lote vale inteiro ou não vale nada.
 */
import { arrange, dropBlock, FORMATS, groupIndex, groups, height, IMAGE_MAX, linkFirst, linkProblem, newId, nextTone, PX, removeItems, RESOLUTIONS, snap, trim, upgrade, VIS_H, width } from "./canvas/modelo.js";
import type { Block, CanvasProject } from "./canvas/modelo.js";

/** Comando recusado: o código e a posição dele no lote. */
export class ComandoError extends Error {
  constructor(
    readonly codigo: string,
    readonly indice: number,
  ) {
    super(codigo);
  }
}

/** O arquivo de um bloco novo, depois de conferido quem pode usar. */
export interface Fonte {
  src: string;
  kind: Block["kind"];
  dur: number | null;
  name: string;
}

type Comando = Record<string, unknown>;

export const MAX_COMANDOS = 100;
/** Entre um bloco solto e o que está acima: longe das trilhas, para não virarem um grupo só. */
const LINHA = 96;
const IMAGEM_PADRAO = 3;

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

/** Aplica o lote e devolve o projeto novo, sem tocar no original. */
export async function aplicar(original: CanvasProject, comandos: Comando[], fonte: (c: Comando) => Promise<Fonte | null>): Promise<{ project: CanvasProject; criados: string[] }> {
  let project = upgrade(original);
  const criados: string[] = [];
  for (const [i, c] of comandos.entries()) {
    const falha = (codigo: string) => new ComandoError(codigo, i);
    switch (c.tipo) {
      case "adicionar": {
        const f = await fonte(c);
        if (!f) throw falha("arquivo_indisponivel");
        project = adicionar(project, c, f, falha);
        criados.push(project.blocks.at(-1)!.id);
        break;
      }
      case "cortar":
        project = cortar(project, c, falha);
        break;
      case "ligar": {
        const de = texto(c.de);
        const para = texto(c.para);
        const problema = de && para ? linkProblem(project, de, para) : "missing";
        if (problema) throw falha({ missing: "bloco_inexistente", same: "ligacao_mesmo_grupo", repeated: "ligacao_repetida", cycle: "ligacao_ciclo", limit: "limite_variacoes" }[problema] ?? problema);
        project = { ...project, edges: [...project.edges, { id: newId("e"), from: de!, to: para! }] };
        break;
      }
      case "remover": {
        const ids = Array.isArray(c.ids) ? c.ids.filter((v): v is string => typeof v === "string") : [];
        const existe = (id: string) => [...project.blocks, ...project.finals, ...project.edges].some((o) => o.id === id);
        if (!ids.length || !ids.every(existe)) throw falha("bloco_inexistente");
        project = removeItems(project, ids);
        break;
      }
      case "som": {
        const volume = c.volume === undefined ? undefined : numero(c.volume);
        if (volume === null || (volume !== undefined && (volume < 0 || volume > 4))) throw falha("volume_invalido");
        if (c.mudo !== undefined && typeof c.mudo !== "boolean") throw falha("mudo_invalido");
        const alvo = project.blocks.find((b) => b.id === c.bloco);
        if (!alvo) throw falha("bloco_inexistente");
        project = { ...project, blocks: project.blocks.map((b) => (b === alvo ? { ...b, vol: volume ?? b.vol, mute: typeof c.mudo === "boolean" ? c.mudo : b.mute } : b)) };
        break;
      }
      case "final": {
        const { project: novo, id } = final(project, c, falha);
        project = novo;
        if (id) criados.push(id);
        break;
      }
      case "organizar":
        project = arrange(project);
        break;
      default:
        throw falha("comando_desconhecido");
    }
  }
  return { project, criados };
}

/** Bloco novo: depois de outro, sobre um grupo (imagem por cima ou som embaixo) ou numa linha nova. */
function adicionar(project: CanvasProject, c: Comando, f: Fonte, falha: (c: string) => ComandoError): CanvasProject {
  const dur = f.kind === "image" ? IMAGE_MAX : (numero(c.dur) ?? f.dur);
  if (dur === null || dur <= 0) throw falha("duracao_obrigatoria");
  const inicio = numero(c.inicio) ?? 0;
  const fim = numero(c.fim) ?? (f.kind === "image" ? IMAGEM_PADRAO : dur);
  if (inicio < 0 || fim <= inicio || fim > dur) throw falha("corte_invalido");
  const block: Block = {
    id: newId("b"),
    kind: f.kind,
    name: texto(c.nome) ?? f.name,
    src: f.src,
    dur,
    tin: inicio,
    tout: fim,
    x: 0,
    y: 0,
    mute: false,
    vol: 1,
    tone: nextTone(project, f.kind, f.src),
    ...(f.kind === "video" ? { audio: c.semSom === true ? "none" : "linked" } : {}),
  };
  const antes = texto(c.depois);
  const sobre = texto(c.sobre);
  if (antes && sobre) throw falha("posicao_invalida");
  let p: CanvasProject = { ...project, blocks: [...project.blocks, block] };
  if (antes) {
    const alvo = project.blocks.find((b) => b.id === antes);
    if (!alvo) throw falha("bloco_inexistente");
    if (f.kind === "audio" || alvo.kind === "audio") throw falha("posicao_invalida");
    const x = alvo.x + width(alvo);
    const ocupado = project.blocks.some((b) => b.kind !== "audio" && Math.abs(b.y - alvo.y) < 1 && b.x < x + width(block) - 1 && b.x + width(b) > x + 1);
    if (ocupado) throw falha("posicao_ocupada");
    block.x = x;
    block.y = alvo.y;
  } else if (sobre) {
    const grupo = groupIndex(groups(project)).get(sobre);
    if (!grupo) throw falha("bloco_inexistente");
    const em = numero(c.em) ?? 0;
    if (em < 0 || em >= grupo.dur) throw falha("momento_invalido");
    const x = grupo.x + em * PX;
    const y = f.kind === "audio" ? grupo.y + VIS_H : grupo.y - height(block);
    const s = snap(p, block.id, x, y, 1, { group: grupo.id });
    if (!s.mode) throw falha("posicao_invalida");
    p = dropBlock(p, block.id, s);
  } else {
    const fundo = Math.max(0, ...groups(project).map((g) => g.bottom + LINHA));
    block.y = project.blocks.length ? fundo : 0;
  }
  // O primeiro elemento traz o Final, já ligado a ele, como na tela.
  linkFirst(p, p.blocks[0]!);
  return p;
}

/** O novo início e fim do trecho do arquivo, nas regras do corte da tela. */
function cortar(project: CanvasProject, c: Comando, falha: (c: string) => ComandoError): CanvasProject {
  const b = project.blocks.find((o) => o.id === c.bloco);
  if (!b) throw falha("bloco_inexistente");
  const inicio = c.inicio === undefined ? b.tin : numero(c.inicio);
  const fim = c.fim === undefined ? b.tout : numero(c.fim);
  const maximo = b.kind === "image" ? IMAGE_MAX : b.dur;
  if (inicio === null || fim === null || inicio < 0 || fim <= inicio || fim > maximo || (b.kind === "image" && inicio !== 0)) throw falha("corte_invalido");
  let p = project;
  if (inicio !== b.tin) p = trim(p, b.id, "l", inicio - b.tin);
  const depois = p.blocks.find((o) => o.id === b.id)!;
  return fim !== depois.tout ? trim(p, b.id, "r", fim - depois.tout) : p;
}

/** Cria um Final ou muda a resolução e o formato do que já existe. */
function final(project: CanvasProject, c: Comando, falha: (c: string) => ComandoError): { project: CanvasProject; id: string | null } {
  if (c.resolucao !== undefined && !RESOLUTIONS.includes(c.resolucao as string)) throw falha("resolucao_invalida");
  if (c.formato !== undefined && !FORMATS.some((f) => f.value === c.formato)) throw falha("formato_invalido");
  const ajustes = { ...(c.resolucao ? { resolution: c.resolucao as string } : {}), ...(c.formato ? { format: c.formato as string } : {}) };
  if (c.id !== undefined) {
    if (!project.finals.some((f) => f.id === c.id)) throw falha("bloco_inexistente");
    return { project: { ...project, finals: project.finals.map((f) => (f.id === c.id ? { ...f, ...ajustes } : f)) }, id: null };
  }
  const id = newId("f");
  const x = Math.max(0, ...project.blocks.map((b) => b.x + width(b))) + 160;
  return { project: { ...project, finals: [...project.finals, { id, x, y: 0, ...ajustes }] }, id };
}
