/**
 * O acervo da conta para o agente: tudo o que ele pode ver, baixar e pôr num projeto, numa lista só
 * (`listar_arquivos`). Três fontes, com o mesmo item e a mesma página: o que os modelos geraram
 * (vídeos e imagens), os ativos dos avatares e os arquivos enviados aos projetos. O `listar_avatares`
 * e o `ver_projeto` usam os mesmos itens.
 */
import { downloadName, MEDIA_TYPES, mediaType, mimeOf, videoFileName } from "./arquivos";
import type { AssetKind, AvatarAsset, Db, Pagina, ProjectFile, User, Video } from "./db";
import { canUse, makesImage, STRUCTURES, structureById } from "./structures";

/** De onde o arquivo vem: gerado por um modelo, guardado num avatar ou enviado a um projeto. */
export type Fonte = "gerado" | "avatar" | "projeto";
const FONTES: readonly Fonte[] = ["gerado", "avatar", "projeto"];
const TIPOS: readonly AssetKind[] = ["video", "imagem", "audio"];

const PAGINA = 20;
const MAX_PAGINA = 100;

type Ref = { id: string; nome: string };

/** Um arquivo do acervo, igual venha de onde vier. */
export interface Item {
  id: string;
  /** O nome que a pessoa deu; o gerado sem nome não tem (a fala ou a descrição dizem o que é). */
  nome?: string;
  tipo: AssetKind;
  fonte: Fonte;
  modelo?: Ref;
  avatar?: Ref;
  projeto?: Ref;
  fala?: string;
  descricao?: string;
  duracao?: number;
  resolucao?: string;
  formato?: string;
  tamanho?: number;
  criado: string;
  src: string;
  /** O nome do arquivo baixado (com a extensão), o tipo e o endereço completo, que abre com o token. */
  arquivo: string;
  mime: string;
  baixar: string;
  /** O que vai no adicionar (editar_projeto) para pôr este arquivo num projeto. */
  usar: { video: string } | { imagem: string } | { ativo: string } | { arquivo: string };
}

/** O que o agente precisa para baixar um arquivo: o nome (a regra de todo download), o tipo e o endereço. */
export function paraBaixar(nome: string, mime: string, src: string, url: URL): Pick<Item, "arquivo" | "mime" | "baixar"> {
  return { arquivo: downloadName(nome, mime), mime, baixar: `${url.origin}${src}?baixar` };
}

/** Um vídeo ou imagem gerado (pronto, com arquivo). */
export function itemGerado(v: Video, url: URL, avatar: Ref | null): Item {
  const structure = structureById(v.structure);
  const imagem = !!structure && makesImage(structure);
  const src = `/videos/${v.id}.${v.video_key!.split(".").pop()}`;
  return {
    id: v.id,
    ...(v.name ? { nome: v.name } : {}),
    tipo: imagem ? "imagem" : "video",
    fonte: "gerado",
    modelo: { id: v.structure ?? "", nome: structure?.name ?? v.structure ?? "" },
    ...(avatar ? { avatar } : {}),
    ...(imagem ? { descricao: v.prompt } : { fala: v.prompt, duracao: v.duration }),
    resolucao: v.resolution,
    formato: v.aspect_ratio,
    criado: v.created_at,
    src,
    ...paraBaixar(videoFileName(v), mimeOf(v.video_key!), src, url),
    usar: imagem ? { imagem: v.id } : { video: v.id },
  };
}

/** Um ativo de avatar. */
export function itemAtivo(x: AvatarAsset, avatar: string, url: URL): Item {
  const src = `/avatares/${x.avatar_id}/arquivos/${x.id}`;
  return { id: x.id, nome: x.name, tipo: x.kind, fonte: "avatar", avatar: { id: x.avatar_id, nome: avatar }, tamanho: x.size, criado: x.created_at, src, ...paraBaixar(x.name, x.type, src, url), usar: { ativo: x.id } };
}

/** Um arquivo enviado a um projeto. */
export function itemProjeto(f: ProjectFile, projeto: string, url: URL): Item {
  const src = `/projetos/${f.project_id}/arquivos/${f.id}`;
  return { id: f.id, nome: f.name, tipo: mediaType(f.type)?.kind ?? "video", fonte: "projeto", projeto: { id: f.project_id, nome: projeto }, tamanho: f.size, criado: f.created_at, src, ...paraBaixar(f.name, f.type, src, url), usar: { arquivo: f.id } };
}

/** Os filtros do listar_arquivos. */
export interface Filtro extends Pagina {
  tipo?: AssetKind;
  fonte?: Fonte;
  modelo?: string;
  avatar?: string;
  projeto?: string;
}

/** "2026-11-02" ou uma data ISO, no fuso UTC; um dia só vale inteiro no ate. Null se não é data. */
function data(v: string, ate: boolean): string | null {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const t = Date.parse(dia ? `${v}T00:00:00Z` : v);
  if (!Number.isFinite(t)) return null;
  return new Date(dia && ate ? t + 86_400_000 : t).toISOString();
}

/** Os filtros do pedido, ou o erro do primeiro que não vale. */
export function filtro(p: URLSearchParams, user: User): Filtro | { erro: string } {
  const limite = p.has("limite") ? Number(p.get("limite")) : PAGINA;
  if (!Number.isInteger(limite) || limite < 1 || limite > MAX_PAGINA) return { erro: "limite_invalido" };
  const desde = p.get("desde") ? data(p.get("desde")!, false) : undefined;
  const ate = p.get("ate") ? data(p.get("ate")!, true) : undefined;
  if (desde === null || ate === null) return { erro: "data_invalida" };
  const [criado, id] = (p.get("continuar") ?? "").split("|");
  if (p.get("continuar") && (!criado || !id)) return { erro: "continuar_invalido" };
  const tipo = p.get("tipo") || undefined;
  if (tipo && !TIPOS.includes(tipo as AssetKind)) return { erro: "tipo_invalido" };
  const fonte = p.get("fonte") || undefined;
  if (fonte && !FONTES.includes(fonte as Fonte)) return { erro: "fonte_invalida" };
  const modelo = p.get("modelo") || undefined;
  const structure = modelo ? structureById(modelo) : undefined;
  if (modelo && (!structure || !canUse(structure, user))) return { erro: "modelo_invalido" };
  return {
    q: (p.get("q") ?? "").trim(),
    desde,
    ate,
    depois: criado && id ? { criado, id } : undefined,
    limite,
    tipo: tipo as AssetKind | undefined,
    fonte: fonte as Fonte | undefined,
    modelo,
    avatar: p.get("avatar") || undefined,
    projeto: p.get("projeto") || undefined,
  };
}

/**
 * Uma página do acervo, do mais novo ao mais antigo, das fontes que o filtro deixa: cada fonte traz
 * a página dela (um a mais, para saber se há outra) e a página é o começo das três juntas. O
 * continuar é o criado e o id do último, o mesmo ponto de parada nas três.
 */
export async function listar(db: Db, user: User, f: Filtro, url: URL): Promise<{ arquivos: Item[]; continuar?: string }> {
  const conta = db.conta(user.id);
  const pagina: Filtro = { ...f, limite: f.limite + 1 };
  const quer = (fonte: Fonte) => !f.fonte || f.fonte === fonte;
  // O modelo só gera; o projeto só tem os enviados a ele; o avatar tem os ativos e os gerados com ele.
  const structures = STRUCTURES.filter((s) => canUse(s, user) && (!f.modelo || s.id === f.modelo) && (!f.tipo || f.tipo === (makesImage(s) ? "imagem" : "video"))).map((s) => s.id);
  const [gerados, ativos, enviados, avatares] = await Promise.all([
    quer("gerado") && !f.projeto ? conta.readyVideos(structures, pagina) : [],
    quer("avatar") && !f.modelo && !f.projeto ? conta.assetsPage({ ...pagina, kind: f.tipo }) : [],
    quer("projeto") && !f.modelo && !f.avatar ? conta.projectFilesPage({ ...pagina, types: f.tipo ? Object.keys(MEDIA_TYPES).filter((t) => MEDIA_TYPES[t]!.kind === f.tipo) : undefined, project: f.projeto }) : [],
    db.avatarsByUser(user.id),
  ]);
  const nomes = new Map(avatares.map((a) => [a.id, a.name]));
  const todos = [
    ...gerados.map((v) => itemGerado(v, url, v.avatar_id && nomes.has(v.avatar_id) ? { id: v.avatar_id, nome: nomes.get(v.avatar_id)! } : null)),
    ...ativos.map((x) => itemAtivo(x, x.avatar_name, url)),
    ...enviados.map((e) => itemProjeto(e, e.project_name, url)),
  ].sort((a, b) => (a.criado === b.criado ? (a.id < b.id ? 1 : -1) : a.criado < b.criado ? 1 : -1));
  const arquivos = todos.slice(0, f.limite);
  const ultimo = arquivos[arquivos.length - 1];
  return { arquivos, ...(todos.length > f.limite && ultimo ? { continuar: `${ultimo.criado}|${ultimo.id}` } : {}) };
}
