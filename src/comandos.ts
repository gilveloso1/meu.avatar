/**
 * Os comandos da API dos projetos (docs/api.md): quem edita diz o que quer ("cole este
 * vídeo depois daquele"), não a geometria do canvas. Tudo passa pelo mesmo modelo da tela
 * (src/canvas/modelo.js), com as mesmas regras. Um lote vale inteiro ou não vale nada.
 */
import { arrange, dropBlock, FORMATS, groupIndex, groups, height, IMAGE_MAX, linkFirst, linkProblem, MIN_LEN, newId, nextTone, PX, relay, removeItems, RESOLUTIONS, snap, SPEED_MAX, SPEED_MIN, split, upgrade, VIS_H, width } from "./canvas/modelo.js";
import type { Block, CanvasProject, Frame, FrameKey, Group } from "./canvas/modelo.js";
import { PAUSES, planParts, RULES } from "./quickedit";

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

/** O que os comandos precisam buscar fora do projeto. */
export interface Contexto {
  fonte(c: Comando): Promise<Fonte | null>;
  /** Os silêncios e a duração do arquivo, ou null se a análise não estiver disponível. */
  silencios(src: string): Promise<{ duracao: number; silencios: number[][] } | null>;
  /** O ponto entre os olhos, de 0 a 1, ou null se não houver. */
  rosto(src: string): Promise<{ x: number; y: number } | null>;
}

export const MAX_COMANDOS = 100;
/** Entre um bloco solto e o que está acima: longe das trilhas, para não virarem um grupo só. */
const LINHA = 96;
const IMAGEM_PADRAO = 3;

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

/** Aplica o lote e devolve o projeto novo, sem tocar no original. */
export async function aplicar(original: CanvasProject, comandos: Comando[], ctx: Contexto): Promise<{ project: CanvasProject; criados: string[] }> {
  let project = upgrade(original);
  const criados: string[] = [];
  const rotulos = new Map<string, string>();
  for (const [i, bruto] of comandos.entries()) {
    const falha = (codigo: string) => new ComandoError(codigo, i);
    const c = comRotulos(bruto, rotulos, falha);
    const antesDeCriar = criados.length;
    switch (c.tipo) {
      case "adicionar": {
        const f = await ctx.fonte(c);
        if (!f) throw falha("arquivo_indisponivel");
        const novo = adicionar(project, c, f, falha);
        project = novo.project;
        criados.push(novo.id);
        break;
      }
      case "dividir": {
        const b = project.blocks.find((o) => o.id === c.bloco);
        if (!b) throw falha("bloco_inexistente");
        const em = numero(c.em);
        if (b.kind === "image" || em === null || em - b.tin < MIN_LEN || b.tout - em < MIN_LEN) throw falha("corte_invalido");
        const novo = split(project, b.id, em);
        project = novo.project;
        criados.push(novo.id);
        break;
      }
      case "mover":
        project = mover(project, c, falha);
        break;
      case "velocidade": {
        const v = numero(c.velocidade);
        if (v === null || v < SPEED_MIN || v > SPEED_MAX) throw falha("velocidade_invalida");
        const alvo = project.blocks.find((b) => b.id === c.bloco);
        if (!alvo) throw falha("bloco_inexistente");
        if (alvo.kind === "image") throw falha("velocidade_invalida");
        project = alterar(project, alvo.id, (b) => ({ ...b, speed: v }));
        break;
      }
      case "removerPausas": {
        const novo = await removerPausas(project, c, ctx, falha);
        project = novo.project;
        criados.push(...novo.ids);
        break;
      }
      case "enquadrar":
        project = await enquadrar(project, c, ctx, falha);
        break;
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
        const antes = project;
        project = removeItems(project, ids);
        // Fechar: a sequência encosta onde saiu o bloco, sem deixar buraco.
        if (c.fechar === true) {
          for (const g of groups(antes)) {
            const ordem = g.blocks.map((b) => b.id).filter((id) => !ids.includes(id));
            if (ordem.length && ordem.length < g.blocks.length) project = relay(antes, project, ordem, g.x, g.blocks[0]!.y);
          }
        }
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
    if (typeof bruto.rotulo === "string" && criados.length > antesDeCriar) rotulos.set(bruto.rotulo, criados[antesDeCriar]!);
  }
  return { project, criados };
}

const CAMPOS_DE_BLOCO = ["bloco", "depois", "antes", "sobre", "de", "para"];

/** Num lote, "@nome" é o bloco que um comando anterior criou com rotulo: "nome". */
function comRotulos(c: Comando, rotulos: Map<string, string>, falha: (c: string) => ComandoError): Comando {
  const troca = (v: unknown) => {
    if (typeof v !== "string" || !v.startsWith("@")) return v;
    const id = rotulos.get(v.slice(1));
    if (!id) throw falha("rotulo_desconhecido");
    return id;
  };
  const novo = { ...c };
  for (const campo of CAMPOS_DE_BLOCO) if (campo in novo) novo[campo] = troca(novo[campo]);
  if (Array.isArray(novo.ids)) novo.ids = novo.ids.map(troca);
  return novo;
}

/** Bloco novo: depois de outro, sobre um grupo (imagem por cima ou som embaixo) ou numa linha nova. */
function adicionar(project: CanvasProject, c: Comando, f: Fonte, falha: (c: string) => ComandoError): { project: CanvasProject; id: string } {
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
    const seq = sequencia(project, alvo.id);
    if (!seq) throw falha("posicao_invalida");
    const ordem = seq.blocks.map((b) => b.id);
    ordem.splice(ordem.indexOf(alvo.id) + 1, 0, block.id);
    p = relay(project, p, ordem, seq.x, seq.blocks[0]!.y);
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
  return { project: p, id: block.id };
}

/** O grupo em que o bloco faz parte da sequência (e não da cobertura ou do som). */
function sequencia(project: CanvasProject, id: string): Group | null {
  const g = groups(project).find((o) => o.blocks.some((b) => b.id === id));
  return g ?? null;
}

/** Muda um bloco e mantém a sequência dele encostada, com o que o cobre acompanhando. */
function alterar(project: CanvasProject, id: string, muda: (b: Block) => Block): CanvasProject {
  const p = { ...project, blocks: project.blocks.map((b) => (b.id === id ? muda(b) : b)) };
  const seq = sequencia(project, id);
  return seq ? relay(project, p, seq.blocks.map((b) => b.id), seq.x, seq.blocks[0]!.y) : p;
}

/** Leva um bloco para depois ou antes de outro, fechando o buraco de onde saiu. */
function mover(project: CanvasProject, c: Comando, falha: (c: string) => ComandoError): CanvasProject {
  const id = texto(c.bloco);
  const alvoId = texto(c.depois) ?? texto(c.antes);
  const de = id ? sequencia(project, id) : null;
  const para = alvoId ? sequencia(project, alvoId) : null;
  if (!de || !para || id === alvoId) throw falha(!de || !para ? "bloco_inexistente" : "posicao_invalida");
  const sem = (g: Group) => g.blocks.map((b) => b.id).filter((o) => o !== id);
  const ordem = sem(para);
  ordem.splice(ordem.indexOf(alvoId!) + (c.depois ? 1 : 0), 0, id!);
  // Uma sequência que perde o bloco anda primeiro; a de destino é a que vale no fim.
  const resto = de.id !== para.id ? sem(de) : [];
  const base = resto.length ? relay(project, project, resto, de.x, de.blocks[0]!.y) : project;
  return relay(base, base, ordem, para.x, para.blocks[0]!.y);
}

/** Tira as pausas dos blocos de vídeo, com a regra da Edição rápida. */
async function removerPausas(project: CanvasProject, c: Comando, ctx: Contexto, falha: (c: string) => ComandoError): Promise<{ project: CanvasProject; ids: string[] }> {
  const pausa = PAUSES.find((p) => p.value === (c.pausa ?? "media"));
  if (!pausa) throw falha("pausa_invalida");
  const pedidos = c.bloco === undefined ? project.blocks.filter((b) => b.kind === "video") : project.blocks.filter((b) => b.id === c.bloco);
  if (!pedidos.length) throw falha("bloco_inexistente");
  let p = project;
  const ids: string[] = [];
  for (const alvo of pedidos) {
    if (alvo.kind !== "video" || !sequencia(p, alvo.id)) throw falha("posicao_invalida");
    const som = await ctx.silencios(alvo.src);
    if (!som) throw falha("analise_indisponivel");
    const silencios = som.silencios.filter(([a, b]) => a! < alvo.tout && b! > alvo.tin).map(([a, b]) => [Math.max(a!, alvo.tin), Math.min(b!, alvo.tout)]);
    // Do trecho do bloco para o tempo dele, e de volta para o arquivo.
    const partes = planParts(silencios.map(([a, b]) => [a! - alvo.tin, b! - alvo.tin]), alvo.tout - alvo.tin, pausa.pause, [1], RULES).map(([a, b]) => [a + alvo.tin, b + alvo.tin] as const);
    if (partes.length < 2 && (!partes[0] || (partes[0][0] === alvo.tin && partes[0][1] === alvo.tout))) continue;
    const seq = sequencia(p, alvo.id)!;
    const [primeira, ...outras] = partes;
    const novos: Block[] = outras.map(([a, b]) => ({ ...alvo, id: newId("b"), tin: a, tout: b }));
    const depois = { ...p, blocks: p.blocks.flatMap((b) => (b.id === alvo.id ? [{ ...b, tin: primeira![0], tout: primeira![1] }, ...novos] : [b])) };
    const ordem = seq.blocks.flatMap((b) => (b.id === alvo.id ? [b.id, ...novos.map((n) => n.id)] : [b.id]));
    p = relay(p, depois, ordem, seq.x, seq.blocks[0]!.y);
    ids.push(...novos.map((n) => n.id));
  }
  return { project: p, ids };
}

const ENCAIXES: Record<string, Frame["fit"]> = { preencher: "cover", caber: "contain", desfocar: "blur" };
const MAX_CHAVES = 32;
const MAX_ZOOM = 8;

/** Zoom, foco, recorte, espelho, giro, encaixe e animação. O que não vem fica como estava. */
async function enquadrar(project: CanvasProject, c: Comando, ctx: Contexto, falha: (c: string) => ComandoError): Promise<CanvasProject> {
  const b = project.blocks.find((o) => o.id === c.bloco);
  if (!b) throw falha("bloco_inexistente");
  if (b.kind === "audio") throw falha("enquadramento_invalido");
  const frame: Frame = c.limpar === true ? {} : { ...b.frame };
  if (c.encaixe !== undefined) {
    const fit = ENCAIXES[c.encaixe as string];
    if (!fit) throw falha("enquadramento_invalido");
    frame.fit = fit;
  }
  if (c.espelharH !== undefined) frame.flipH = c.espelharH === true;
  if (c.espelharV !== undefined) frame.flipV = c.espelharV === true;
  if (c.girar !== undefined) {
    if (![0, 90, 180, 270].includes(c.girar as number)) throw falha("enquadramento_invalido");
    frame.rotate = c.girar as number;
  }
  if (c.recorte !== undefined) {
    const r = (c.recorte ?? {}) as Record<string, unknown>;
    const lado = (k: string) => numero(r[k] ?? 0);
    const [l, t, d, a] = [lado("esquerda"), lado("topo"), lado("direita"), lado("base")];
    if ([l, t, d, a].some((v) => v === null || v < 0) || l! + d! > 0.9 || t! + a! > 0.9) throw falha("enquadramento_invalido");
    frame.crop = { l: l!, t: t!, r: d!, b: a! };
  }
  const foco = c.rosto === true ? await ctx.rosto(b.src) : null;
  if (c.rosto === true && !foco) throw falha("rosto_indisponivel");
  const chave = (k: Record<string, unknown>, t: number): FrameKey => {
    const z = k.zoom === undefined ? 1 : numero(k.zoom);
    const x = k.focoX === undefined ? (foco?.x ?? 0.5) : numero(k.focoX);
    const y = k.focoY === undefined ? (foco?.y ?? 0.5) : numero(k.focoY);
    if (z === null || x === null || y === null || z < 1 || z > MAX_ZOOM || x < 0 || x > 1 || y < 0 || y > 1) throw falha("enquadramento_invalido");
    return { t, z, x, y };
  };
  if (Array.isArray(c.chaves)) {
    if (!c.chaves.length || c.chaves.length > MAX_CHAVES) throw falha("enquadramento_invalido");
    frame.keys = (c.chaves as Record<string, unknown>[]).map((k) => {
      const t = numero(k.t);
      // Negativo: um movimento que começou no bloco anterior continua neste.
      if (t === null) throw falha("enquadramento_invalido");
      return chave(k, t);
    });
  } else if (c.zoom !== undefined || c.focoX !== undefined || c.focoY !== undefined || c.rosto === true) frame.keys = [chave(c, 0)];
  return { ...project, blocks: project.blocks.map((o) => (o === b ? { ...o, frame } : o)) };
}

/** O novo início e fim do trecho do arquivo, nas regras do corte da tela. */
function cortar(project: CanvasProject, c: Comando, falha: (c: string) => ComandoError): CanvasProject {
  const b = project.blocks.find((o) => o.id === c.bloco);
  if (!b) throw falha("bloco_inexistente");
  const inicio = c.inicio === undefined ? b.tin : numero(c.inicio);
  const fim = c.fim === undefined ? b.tout : numero(c.fim);
  const maximo = b.kind === "image" ? IMAGE_MAX : b.dur;
  if (inicio === null || fim === null || inicio < 0 || fim <= inicio || fim > maximo || (b.kind === "image" && inicio !== 0)) throw falha("corte_invalido");
  if (fim - inicio < MIN_LEN) throw falha("corte_invalido");
  return alterar(project, b.id, (o) => ({ ...o, tin: inicio, tout: fim }));
}

/** Cria um Final ou muda a resolução e o formato do que já existe. */
function final(project: CanvasProject, c: Comando, falha: (c: string) => ComandoError): { project: CanvasProject; id: string | null } {
  if (c.resolucao !== undefined && !RESOLUTIONS.includes(c.resolucao as string)) throw falha("resolucao_invalida");
  if (c.formato !== undefined && !FORMATS.some((f) => f.value === c.formato)) throw falha("formato_invalido");
  const velocidade = c.velocidade === undefined ? undefined : numero(c.velocidade);
  if (velocidade === null || (velocidade !== undefined && (velocidade < SPEED_MIN || velocidade > SPEED_MAX))) throw falha("velocidade_invalida");
  const ajustes = { ...(c.resolucao ? { resolution: c.resolucao as string } : {}), ...(c.formato ? { format: c.formato as string } : {}), ...(velocidade ? { speed: velocidade } : {}) };
  if (c.id !== undefined) {
    if (!project.finals.some((f) => f.id === c.id)) throw falha("bloco_inexistente");
    return { project: { ...project, finals: project.finals.map((f) => (f.id === c.id ? { ...f, ...ajustes } : f)) }, id: null };
  }
  const id = newId("f");
  const x = Math.max(0, ...project.blocks.map((b) => b.x + width(b))) + 160;
  return { project: { ...project, finals: [...project.finals, { id, x, y: 0, ...ajustes }] }, id };
}
