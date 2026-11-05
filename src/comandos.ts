/**
 * Os comandos da API dos projetos (docs/api.md): quem edita diz o que quer ("cole este
 * vídeo depois daquele"), não a geometria do canvas. Tudo passa pelo mesmo modelo da tela
 * (src/canvas/modelo.js), com as mesmas regras. Um lote vale inteiro ou não vale nada.
 */
import { arrange, CODE_MAX, dropBlock, FORMATS, groupIndex, groups, height, IMAGE_MAX, len, linkFirst, linkProblem, links, maxEnd, MIN_LEN, newId, nextTone, PX, relay, removeItems, renameGroup, RESOLUTIONS, snap, SPEED_MAX, SPEED_MIN, split, upgrade, VIS_H, width } from "./canvas/modelo.js";
import type { Block, CanvasProject, Frame, FrameKey, Group } from "./canvas/modelo.js";
import { PAUSES, planParts, RULES } from "./quickedit";

/** Comando recusado: o código, a posição dele no lote e o que ajuda a corrigir. */
export class ComandoError extends Error {
  constructor(
    readonly codigo: string,
    readonly indice: number,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(codigo);
  }
}

/** Os tipos que `aplicar` conhece; o teste confere que cada um tem o seu caso. */
export const TIPOS = ["adicionar", "rascunho", "editarCodigo", "renomear", "trocar", "cortar", "dividir", "mover", "velocidade", "removerPausas", "removerTrechos", "enquadrar", "ligar", "ordenar", "remover", "som", "final", "organizar"];

/** Quantas letras trocar, pôr ou tirar para ir de uma palavra à outra. */
function distancia(a: string, b: string): number {
  let antes = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const linha = [i];
    for (let j = 1; j <= b.length; j++) linha[j] = Math.min(antes[j]! + 1, linha[j - 1]! + 1, antes[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    antes = linha;
  }
  return antes[b.length]!;
}

/** O tipo que o agente quis dizer ("troca", "Cortar", "remover_pausas"), ou null se nenhum chega perto. */
export function sugestao(tipo: unknown): string | null {
  if (typeof tipo !== "string" || !tipo.trim()) return null;
  const limpo = tipo.trim().toLowerCase().replace(/[_\s-]/g, "");
  let melhor: string | null = null;
  let menor = Math.max(2, Math.floor(limpo.length / 3)) + 1;
  for (const t of TIPOS) {
    const d = distancia(limpo, t.toLowerCase());
    if (d < menor) [melhor, menor] = [t, d];
  }
  return melhor;
}

/** O arquivo de um bloco novo, depois de conferido quem pode usar. */
export interface Fonte {
  src: string;
  kind: Block["kind"];
  dur: number | null;
  name: string;
  /** false: o vídeo não tem faixa de som (entra sem a camada de áudio); sem isso, tem. */
  som?: boolean | null;
}

type Comando = Record<string, unknown>;

/** O que os comandos precisam buscar fora do projeto. */
export interface Contexto {
  fonte(c: Comando): Promise<Fonte | null>;
  /** Os silêncios e a duração do arquivo, ou null se a análise não estiver disponível. */
  silencios(src: string): Promise<{ duracao: number; silencios: number[][]; som: boolean } | null>;
  /** O ponto entre os olhos, de 0 a 1, ou null se não houver. */
  rosto(src: string): Promise<{ x: number; y: number } | null>;
  /** Uma animação já feita num projeto de quem edita (para reusar), ou null. */
  animacao(projeto: string, bloco: string): Promise<{ html: string; params?: Record<string, string | number>; duracao: number; nome: string } | null>;
}

export const MAX_COMANDOS = 100;
const MAX_FALA = 2000;
/** O código de uma animação: as cenas do caso real têm 3 a 5 mil caracteres; o projeto inteiro vai até 1 MB. */
export const MAX_CODIGO = 100_000;
const MAX_TROCAS = 50;
const MAX_PARAMETROS = 30;
const MAX_VALOR = 500;
const CHAVE_PARAMETRO = /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/;

/**
 * Os parâmetros de uma animação junto com os que já tinha: texto ou número por chave, e null tira
 * a chave. É o que um template muda sem reescrever o código (ver codeHtml em modelo.js).
 */
function parametros(v: unknown, antes: Record<string, string | number> | undefined, falha: (c: string, extra?: Record<string, unknown>) => ComandoError): Record<string, string | number> | undefined {
  if (v === undefined) return antes;
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw falha("parametros_invalidos");
  const novos = { ...antes };
  for (const [k, valor] of Object.entries(v)) {
    if (!CHAVE_PARAMETRO.test(k)) throw falha("parametros_invalidos", { parametro: k });
    if (valor === null) delete novos[k];
    else if ((typeof valor === "string" && valor.length <= MAX_VALOR) || (typeof valor === "number" && Number.isFinite(valor))) novos[k] = valor;
    else throw falha("parametros_invalidos", { parametro: k });
  }
  if (Object.keys(novos).length > MAX_PARAMETROS) throw falha("parametros_invalidos", { maximo: MAX_PARAMETROS });
  return Object.keys(novos).length ? novos : undefined;
}

/** O nome do bloco sem arquivo, como o dos blocos: Texto 1 (rascunho), Animação 1... depois do maior que já existe. */
function proximoNome(project: CanvasProject, prefixo: string, dele: (b: Block) => unknown): string {
  const usados = project.blocks.filter(dele).map((b) => Number(new RegExp(`^${prefixo} (\\d+)$`).exec(b.name)?.[1] ?? 0));
  return `${prefixo} ${Math.max(0, ...usados) + 1}`;
}
/** Entre um bloco solto e o que já está no canvas: longe, para não virarem um grupo só. */
const LINHA = 160;
const IMAGEM_PADRAO = 3;

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

/** Aplica o lote e devolve o projeto novo, sem tocar no original. */
export async function aplicar(original: CanvasProject, comandos: Comando[], ctx: Contexto): Promise<{ project: CanvasProject; criados: string[] }> {
  let project = upgrade(original);
  const criados: string[] = [];
  const rotulos = new Map<string, string>();
  for (const [i, bruto] of comandos.entries()) {
    const falha = (codigo: string, extra?: Record<string, unknown>) => new ComandoError(codigo, i, extra);
    const c = comRotulos(bruto, rotulos, falha);
    const antesDeCriar = criados.length;
    switch (c.tipo) {
      case "adicionar": {
        if (c.html !== undefined || c.animacao !== undefined) {
          // A animação em código: guardada como está, roda na prévia e vira vídeo só na exportação.
          // Com animacao, parte de uma já feita (código, valores, tempo e nome), e o que vier aqui muda.
          if (c.html !== undefined && c.animacao !== undefined) throw falha("codigo_invalido");
          const ref = (c.animacao ?? null) as Record<string, unknown> | null;
          const base = ref ? (typeof ref.projeto === "string" && typeof ref.bloco === "string" ? await ctx.animacao(ref.projeto, ref.bloco) : null) : null;
          if (ref && !base) throw falha("animacao_inexistente");
          const html = base ? base.html : codigo(c.html, falha);
          const duracao = c.duracao === undefined && base ? base.duracao : numero(c.duracao);
          if (duracao === null || duracao < MIN_LEN || duracao > CODE_MAX) throw falha("duracao_invalida");
          const nome = texto(c.nome) ?? base?.nome ?? proximoNome(project, "Animação", (b) => b.code);
          const params = parametros(c.parametros, base?.params, falha);
          const novo = adicionar(project, { ...c, inicio: 0, fim: duracao }, { src: "", kind: "image", dur: CODE_MAX, name: nome }, falha);
          project = { ...novo.project, blocks: novo.project.blocks.map((b) => (b.id === novo.id ? { ...b, code: { html, ...(params ? { params } : {}) } } : b)) };
          criados.push(novo.id);
          break;
        }
        const f = await ctx.fonte(c);
        if (!f) throw falha("arquivo_indisponivel");
        const novo = adicionar(project, c, f, falha);
        project = novo.project;
        criados.push(novo.id);
        break;
      }
      case "rascunho": {
        // O lugar de um vídeo que ainda não existe: um cartão com a fala, do tamanho estimado.
        const fala = typeof c.fala === "string" ? c.fala.trim().slice(0, MAX_FALA) : "";
        const duracao = numero(c.duracao);
        if (!fala) throw falha("fala_invalida");
        if (duracao === null || duracao < MIN_LEN || duracao > IMAGE_MAX) throw falha("duracao_invalida");
        const nome = texto(c.nome) ?? proximoNome(project, "Texto", (b) => b.draft);
        const novo = adicionar(project, { ...c, inicio: 0, fim: duracao }, { src: "", kind: "image", dur: null, name: nome }, falha);
        project = { ...novo.project, blocks: novo.project.blocks.map((b) => (b.id === novo.id ? { ...b, draft: { fala } } : b)) };
        criados.push(novo.id);
        break;
      }
      case "editarCodigo":
        project = editarCodigo(project, c, falha);
        break;
      case "trocar":
        project = await trocar(project, c, ctx, falha);
        break;
      case "renomear": {
        const nome = texto(c.nome);
        if (!nome) throw falha("nome_invalido");
        // O nome do grupo (Cena 1...), em vez de Bloco 1; vale qualquer bloco dele.
        if (c.grupo !== undefined) {
          const g = groupIndex(groups(project)).get(texto(c.grupo) ?? "");
          if (!g) throw falha("bloco_inexistente");
          project = renameGroup(project, g, nome);
          break;
        }
        if (!project.blocks.some((b) => b.id === c.bloco)) throw falha("bloco_inexistente");
        project = { ...project, blocks: project.blocks.map((b) => (b.id === c.bloco ? { ...b, name: nome } : b)) };
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
      case "removerTrechos": {
        const novo = removerTrechos(project, c, falha);
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
        // Encadear a partir de um grupo que é a única entrada de um Final (a ligação automática do primeiro bloco): ela sai,
        // senão esse grupo sairia sozinho como mais uma variação. A última cena se liga ao Final depois.
        const gs = groups(project);
        const ls = links(project, gs);
        const origem = groupIndex(gs).get(de!);
        const sozinha = project.finals.some((f) => f.id === para) ? [] : ls.filter((l) => l.from === origem && typeof l.to === "string" && ls.filter((o) => o.to === l.to).length === 1);
        const tirar = new Set(sozinha.map((l) => l.edge.id));
        project = { ...project, edges: [...project.edges.filter((e) => !tirar.has(e.id)), { id: newId("e"), from: de!, to: para! }] };
        break;
      }
      case "ordenar":
        project = ordenar(project, c, falha);
        break;
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
      default: {
        const s = sugestao(c.tipo);
        throw falha("comando_desconhecido", s ? { sugestao: s } : { tipos: TIPOS });
      }
    }
    if (typeof bruto.rotulo === "string" && criados.length > antesDeCriar) rotulos.set(bruto.rotulo, criados[antesDeCriar]!);
  }
  return { project, criados };
}

const CAMPOS_DE_BLOCO = ["bloco", "depois", "antes", "sobre", "de", "para", "grupo"];

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
  if (Array.isArray(novo.grupos)) novo.grupos = novo.grupos.map(troca);
  return novo;
}

/**
 * A ordem das cenas de uma vez: desfaz as ligações entre esses grupos e as deles ao Final, liga na ordem dada e o
 * último ao Final. Ligações de fora (ganchos que chegam ao primeiro) ficam.
 */
function ordenar(project: CanvasProject, c: Comando, falha: (c: string) => ComandoError): CanvasProject {
  const gs = groups(project);
  const idx = groupIndex(gs);
  const lista = Array.isArray(c.grupos) ? c.grupos.map((id) => (typeof id === "string" ? idx.get(id) : undefined)) : [];
  if (!lista.length || lista.some((g) => !g) || new Set(lista).size !== lista.length) throw falha("grupos_invalidos");
  const fim = c.final === undefined ? (project.finals.length === 1 ? project.finals[0]!.id : null) : texto(c.final);
  if (!fim || !project.finals.some((f) => f.id === fim)) throw falha("final_inexistente");
  const meus = new Set(lista);
  const tirar = new Set(links(project, gs).filter((l) => meus.has(l.from) && (typeof l.to === "string" ? l.to === fim : meus.has(l.to))).map((l) => l.edge.id));
  let p: CanvasProject = { ...project, edges: project.edges.filter((e) => !tirar.has(e.id)) };
  const ids = [...lista.map((g) => g!.id), fim];
  for (let i = 0; i < ids.length - 1; i++) {
    const problema = linkProblem(p, ids[i]!, ids[i + 1]!);
    if (problema) throw falha({ cycle: "ligacao_ciclo", limit: "limite_variacoes" }[problema] ?? "grupos_invalidos");
    p = { ...p, edges: [...p.edges, { id: newId("e"), from: ids[i]!, to: ids[i + 1]! }] };
  }
  return p;
}

/** Bloco novo: depois de outro, sobre um grupo (imagem por cima ou som embaixo) ou numa linha nova. */
function adicionar(project: CanvasProject, c: Comando, f: Fonte, falha: (c: string) => ComandoError): { project: CanvasProject; id: string } {
  // A imagem vai até IMAGE_MAX; a animação diz até onde vai.
  const dur = f.kind === "image" ? (f.dur ?? IMAGE_MAX) : (numero(c.dur) ?? f.dur);
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
    ...(f.kind === "video" ? { audio: c.semSom === true || f.som === false ? "none" : "linked" } : {}),
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
    const ref = project.blocks.find((b) => b.id === sobre);
    if (!grupo || !ref) throw falha("bloco_inexistente");
    // O em conta do começo do bloco citado (no primeiro, é o começo do grupo) e pode passar dele, até o fim do grupo.
    const em = numero(c.em) ?? 0;
    const desde = (ref.x - grupo.x) / PX;
    if (em < 0 || desde + em >= grupo.dur) throw falha("momento_invalido");
    const x = ref.x + em * PX;
    const y = f.kind === "audio" ? grupo.y + VIS_H : grupo.y - height(block);
    const s = snap(p, block.id, x, y, 1, { group: grupo.id });
    if (!s.mode) throw falha("posicao_invalida");
    p = dropBlock(p, block.id, s);
  } else {
    // À direita de tudo: empilhado, o que cobre um grupo cairia no som do grupo de cima.
    block.x = project.blocks.length ? Math.max(...project.blocks.map((b) => b.x + width(b))) + LINHA : 0;
  }
  // O primeiro elemento traz o Final, já ligado a ele, como na tela.
  linkFirst(p, p.blocks[0]!);
  return { project: p, id: block.id };
}

/**
 * Põe outro arquivo no lugar de um bloco (o vídeo pronto no lugar do rascunho): a posição, a
 * velocidade e o que está por cima ficam; a sequência acompanha a duração nova.
 */
async function trocar(project: CanvasProject, c: Comando, ctx: Contexto, falha: (c: string) => ComandoError): Promise<CanvasProject> {
  const b = project.blocks.find((o) => o.id === c.bloco);
  if (!b) throw falha("bloco_inexistente");
  if (b.kind === "audio") throw falha("posicao_invalida");
  const f = await ctx.fonte(c);
  if (!f) throw falha("arquivo_indisponivel");
  if (f.kind === "audio") throw falha("posicao_invalida");
  const dur = f.kind === "image" ? IMAGE_MAX : (numero(c.dur) ?? f.dur);
  if (dur === null || dur <= 0) throw falha("duracao_obrigatoria");
  // Sem início nem fim, o vídeo entra sem o silêncio da ponta (aparar: false o põe inteiro).
  const ponta = f.kind === "video" && c.inicio === undefined && c.fim === undefined && c.aparar !== false ? await pontas(ctx, f.src, dur) : null;
  const inicio = numero(c.inicio) ?? ponta?.[0] ?? 0;
  // A imagem fica com o tempo que o bloco tinha; o vídeo entra inteiro, se ninguém cortar.
  const fim = numero(c.fim) ?? ponta?.[1] ?? (f.kind === "image" ? Math.min(b.tout - b.tin, IMAGE_MAX) : dur);
  if (inicio < 0 || fim <= inicio || fim > dur || fim - inicio < MIN_LEN || (f.kind === "image" && inicio !== 0)) throw falha("corte_invalido");
  // No lugar de um rascunho, o que está por cima vai para o mesmo ponto da fala: a fala real tem outro tamanho que a estimada.
  // Outro arquivo no lugar de outro: os tempos não se correspondem, e a camada fica onde estava no bloco.
  const mapa: Mapa = b.draft ? (off, antes, depois) => (off * len(depois)) / len(antes) : (off) => off;
  return alterar(project, b.id, (o) => {
    const { draft, code, frame, audio, ...resto } = o;
    return {
      ...resto,
      kind: f.kind,
      src: f.src,
      dur,
      tin: inicio,
      tout: fim,
      name: texto(c.nome) ?? f.name,
      tone: nextTone(project, f.kind, f.src),
      // O enquadramento de um rascunho não diz nada sobre o vídeo; o de um arquivo trocado, sim.
      ...(frame && !draft && !code ? { frame } : {}),
      ...(f.kind === "video" ? { audio: c.semSom === true || f.som === false ? "none" : "linked" } : {}),
    };
  }, mapa);
}

/** Do silêncio que sobra antes e depois da fala, quanto fica (s): um respiro, sem cortar a palavra. */
const RESPIRO_ANTES = 0.1;
const RESPIRO_DEPOIS = 0.2;

/** O trecho do vídeo sem o silêncio do começo e do fim, ou null (sem análise, sem som ou nada a tirar). */
async function pontas(ctx: Contexto, src: string, dur: number): Promise<[number, number] | null> {
  const som = await ctx.silencios(src).catch(() => null);
  if (!som?.som) return null;
  const fimArquivo = Math.min(dur, som.duracao || dur);
  const primeiro = som.silencios.find(([a]) => a! <= 0.05);
  const ultimo = som.silencios.find(([, b]) => b! >= fimArquivo - 0.05);
  if (primeiro && primeiro === ultimo) return null; // Só silêncio: fica como veio.
  const inicio = primeiro ? Math.max(0, primeiro[1]! - RESPIRO_ANTES) : 0;
  const fim = ultimo ? Math.min(fimArquivo, ultimo[0]! + RESPIRO_DEPOIS) : fimArquivo;
  if (fim - inicio < MIN_LEN || (inicio === 0 && fim >= dur)) return null;
  return [+inicio.toFixed(3), +fim.toFixed(3)];
}

/** O código da animação, conferido: texto, não vazio e no limite. */
function codigo(v: unknown, falha: (c: string, extra?: Record<string, unknown>) => ComandoError): string {
  if (typeof v !== "string" || !v.trim()) throw falha("codigo_invalido");
  if (v.length > MAX_CODIGO) throw falha("codigo_grande_demais", { maximo: MAX_CODIGO });
  return v;
}

/**
 * Troca o código de uma animação: inteiro (html) ou só trechos (trocas: [{de, para}]), para o
 * agente não reenviar a cena toda. Cada de tem de aparecer uma vez só, como está. parametros
 * muda só os valores, sozinho ou junto.
 */
function editarCodigo(project: CanvasProject, c: Comando, falha: (c: string, extra?: Record<string, unknown>) => ComandoError): CanvasProject {
  const b = project.blocks.find((o) => o.id === c.bloco);
  if (!b) throw falha("bloco_inexistente");
  if (!b.code) throw falha("sem_codigo");
  if ((c.html !== undefined && c.trocas !== undefined) || (c.html === undefined && c.trocas === undefined && c.parametros === undefined)) throw falha("codigo_invalido");
  const params = parametros(c.parametros, b.code.params, falha);
  let html = b.code.html;
  if (c.html !== undefined) html = codigo(c.html, falha);
  else if (c.trocas !== undefined) {
    if (!Array.isArray(c.trocas) || !c.trocas.length || c.trocas.length > MAX_TROCAS) throw falha("trocas_invalidas");
    for (const [i, t] of (c.trocas as unknown[]).entries()) {
      const { de, para } = (t ?? {}) as Record<string, unknown>;
      if (typeof de !== "string" || !de || typeof para !== "string") throw falha("trocas_invalidas", { troca: i });
      const vezes = html.split(de).length - 1;
      if (vezes !== 1) throw falha("trecho_nao_unico", { troca: i, vezes });
      html = html.replace(de, () => para);
    }
    html = codigo(html, falha);
  }
  return { ...project, blocks: project.blocks.map((o) => (o === b ? { ...o, code: { html, ...(params ? { params } : {}) } } : o)) };
}

/** O grupo em que o bloco faz parte da sequência (e não da cobertura ou do som). */
function sequencia(project: CanvasProject, id: string): Group | null {
  const g = groups(project).find((o) => o.blocks.some((b) => b.id === id));
  return g ?? null;
}

/** Onde fica, em segundos do bloco depois da mudança, o que começava a off segundos dele antes. */
type Mapa = (off: number, antes: Block, depois: Block) => number;

/** Pelo arquivo: o mesmo instante da fala (cortar o começo ou mudar a velocidade não desalinha a camada). */
const peloArquivo: Mapa = (off, antes, depois) => {
  const t = antes.tin + off * (antes.speed ?? 1);
  return Math.min(len(depois), Math.max(0, (t - depois.tin) / (depois.speed ?? 1)));
};

const EPS = 1e-6;

/** As coberturas e os sons somados que começam dentro do bloco, com os segundos do bloco em que começam. */
function presos(project: CanvasProject, alvo: Block): { id: string; off: number }[] {
  const g = sequencia(project, alvo.id);
  if (!g) return [];
  return [...g.covers, ...g.audios].filter((o) => o.x >= alvo.x - EPS && o.x < alvo.x + width(alvo) - EPS).map((o) => ({ id: o.id, off: (o.x - alvo.x) / PX }));
}

/** Põe cada camada presa no x dado (null: fica onde a sequência a deixou). */
function reposicionar(project: CanvasProject, camadas: { id: string; off: number }[], onde: (off: number) => number | null): CanvasProject {
  if (!camadas.length) return project;
  const xs = new Map(camadas.map((c) => [c.id, onde(c.off)]));
  return { ...project, blocks: project.blocks.map((b) => (xs.get(b.id) != null ? { ...b, x: +xs.get(b.id)!.toFixed(3) } : b)) };
}

/** Muda um bloco e mantém a sequência dele encostada, com o que o cobre acompanhando o mesmo ponto da fala. */
function alterar(project: CanvasProject, id: string, muda: (b: Block) => Block, mapa: Mapa = peloArquivo): CanvasProject {
  const antes = project.blocks.find((b) => b.id === id)!;
  const p = { ...project, blocks: project.blocks.map((b) => (b.id === id ? muda(b) : b)) };
  const seq = sequencia(project, id);
  if (!seq) return p;
  const camadas = presos(project, antes);
  const novo = relay(project, p, seq.blocks.map((b) => b.id), seq.x, seq.blocks[0]!.y);
  const depois = novo.blocks.find((b) => b.id === id)!;
  return reposicionar(novo, camadas, (off) => depois.x + mapa(off, antes, depois) * PX);
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
  // acima: toda pausa maior que isso (s) fica com isso; sem ele, a regra da Edição rápida.
  const acima = c.acima === undefined ? null : numero(c.acima);
  if (acima === null && c.acima !== undefined) throw falha("pausa_invalida");
  if (acima !== null && (acima < ACIMA_MIN || acima > ACIMA_MAX || c.pausa !== undefined)) throw falha("pausa_invalida");
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
    const partes =
      acima !== null
        ? pausasAcima(silencios as [number, number][], alvo.tin, alvo.tout, acima)
        : planParts(silencios.map(([a, b]) => [a! - alvo.tin, b! - alvo.tin]), alvo.tout - alvo.tin, pausa.pause, [1], RULES).map(([a, b]) => [a + alvo.tin, b + alvo.tin] as const);
    if (partes.length < 2 && (!partes[0] || (partes[0][0] === alvo.tin && partes[0][1] === alvo.tout))) continue;
    const novo = manterPartes(p, alvo, partes);
    p = novo.project;
    ids.push(...novo.ids);
  }
  return { project: p, ids };
}

const ACIMA_MIN = 0.1;
const ACIMA_MAX = 5;

/**
 * As partes do trecho [de, ate] que ficam quando toda pausa maior que `acima` passa a ter `acima`: do que fica, a
 * parte de RULES.tail depois da fala e o resto antes da seguinte, como na Edição rápida. Corte que deixaria um
 * pedaço menor que um bloco não é feito (a pausa fica inteira).
 */
export function pausasAcima(silencios: [number, number][], de: number, ate: number, acima: number): (readonly [number, number])[] {
  const cortes: [number, number][] = [];
  for (const [s, e] of silencios) {
    if (e - s <= acima) continue;
    const comeco = s <= de + EPS;
    const fim = e >= ate - EPS;
    if (comeco && fim) continue; // O trecho inteiro é silêncio: nada a guardar.
    const a = comeco ? s : s + acima * RULES.tail;
    const b = fim ? e : e - acima * (1 - RULES.tail);
    if (b - a >= RULES.minCut) cortes.push([a, b]);
  }
  const partes = () => {
    const ps: [number, number][] = [];
    let x = de;
    for (const [a, b] of cortes) {
      if (a > x) ps.push([x, a]);
      x = b;
    }
    if (x < ate) ps.push([x, ate]);
    return ps;
  };
  // Pedaço curto demais: desfaz o corte do lado dele (o seguinte, ou o anterior no fim) até todos caberem.
  for (let ps = partes(); ps.some(([a, b]) => b - a < MIN_LEN) && cortes.length; ps = partes()) {
    const i = ps.findIndex(([a, b]) => b - a < MIN_LEN);
    const fim = ps[i]![1];
    const depois = cortes.findIndex(([x]) => x >= fim - EPS);
    cortes.splice(depois >= 0 ? depois : cortes.length - 1, 1);
  }
  return partes().map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)] as const);
}

const MAX_TRECHOS = 200;

/** Tira do bloco os trechos do arquivo pedidos (vícios, repetições, palavras da transcrição); o resto encosta. */
function removerTrechos(project: CanvasProject, c: Comando, falha: (c: string) => ComandoError): { project: CanvasProject; ids: string[] } {
  const alvo = project.blocks.find((b) => b.id === c.bloco);
  if (!alvo) throw falha("bloco_inexistente");
  if (alvo.kind === "image" || !sequencia(project, alvo.id)) throw falha("posicao_invalida");
  if (!Array.isArray(c.trechos) || !c.trechos.length || c.trechos.length > MAX_TRECHOS) throw falha("trechos_invalidos");
  const trechos = (c.trechos as unknown[]).map((t) => {
    const [a, b] = Array.isArray(t) ? t.map(numero) : [null, null];
    if (a == null || b == null || a >= b || b <= alvo.tin || a >= alvo.tout) throw falha("trechos_invalidos");
    return [Math.max(a, alvo.tin), Math.min(b, alvo.tout)] as const;
  });
  trechos.sort((x, y) => x[0] - y[0]);
  const partes: (readonly [number, number])[] = [];
  let de = alvo.tin;
  for (const [a, b] of trechos) {
    if (a > de) partes.push([de, a]);
    de = Math.max(de, b);
  }
  if (de < alvo.tout) partes.push([de, alvo.tout]);
  // Sobra menor que um bloco: quem pede junta ao trecho do lado, sem palavra cortada às escondidas.
  if (!partes.length || partes.some(([a, b]) => b - a < MIN_LEN)) throw falha("sobra_curta");
  return manterPartes(project, alvo, partes);
}

/** O bloco vira estas partes do arquivo, em ordem, e a sequência encosta. */
function manterPartes(project: CanvasProject, alvo: Block, partes: readonly (readonly [number, number])[]): { project: CanvasProject; ids: string[] } {
  const seq = sequencia(project, alvo.id)!;
  const [primeira, ...outras] = partes;
  const novos: Block[] = outras.map(([a, b]) => ({ ...alvo, id: newId("b"), tin: a, tout: b }));
  const depois = { ...project, blocks: project.blocks.flatMap((b) => (b.id === alvo.id ? [{ ...b, tin: primeira![0], tout: primeira![1] }, ...novos] : [b])) };
  const ordem = seq.blocks.flatMap((b) => (b.id === alvo.id ? [b.id, ...novos.map((n) => n.id)] : [b.id]));
  const p = relay(project, depois, ordem, seq.x, seq.blocks[0]!.y);
  // O que cobre o bloco vai para o mesmo ponto da fala; se ele caiu num trecho que saiu, para onde a fala volta.
  const pecas = [alvo.id, ...novos.map((n) => n.id)].map((id) => p.blocks.find((b) => b.id === id)!);
  const ultima = pecas[pecas.length - 1]!;
  const onde = (off: number) => {
    const t = alvo.tin + off * (alvo.speed ?? 1);
    const peca = pecas.find((b) => t < b.tout - EPS);
    if (!peca) return ultima.x + width(ultima);
    return peca.x + (Math.max(0, t - peca.tin) / (peca.speed ?? 1)) * PX;
  };
  return { project: reposicionar(p, presos(project, alvo), onde), ids: novos.map((n) => n.id) };
}

const ENCAIXES: Record<string, Frame["fit"]> = { preencher: "cover", caber: "contain", desfocar: "blur" };
const MAX_CHAVES = 32;
const MAX_ZOOM = 8;

/** Zoom, foco, recorte, espelho, giro, encaixe e animação. O que não vem fica como estava. */
async function enquadrar(project: CanvasProject, c: Comando, ctx: Contexto, falha: (c: string) => ComandoError): Promise<CanvasProject> {
  const b = project.blocks.find((o) => o.id === c.bloco);
  if (!b) throw falha("bloco_inexistente");
  // A animação já se desenha no tamanho do Final: o enquadramento é o do próprio código.
  if (b.kind === "audio" || b.code) throw falha("enquadramento_invalido");
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
  // duracao no lugar de fim: o que fica a partir do início (num rascunho, a duração dele).
  const duracao = c.duracao === undefined ? undefined : numero(c.duracao);
  const fim = duracao !== undefined ? (duracao === null || inicio === null ? null : +(inicio + duracao).toFixed(3)) : c.fim === undefined ? b.tout : numero(c.fim);
  const maximo = maxEnd(b);
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
