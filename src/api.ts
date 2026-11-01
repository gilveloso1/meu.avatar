/**
 * API dos projetos (docs/api.md): o que um agente precisa para editar um projeto pelo
 * mesmo modelo da tela. Só o administrador, como o canvas; cada projeto é só de quem o
 * criou. Exportar e baixar usam as rotas do site, com o mesmo token.
 */
import { baseGaps, finalRate, groups, members, output, versionName, versions } from "./canvas/modelo.js";
import type { CanvasProject } from "./canvas/modelo.js";
import { aplicar, ComandoError, type Fonte, MAX_COMANDOS } from "./comandos";
import type { Db, Project, User, Video } from "./db";
import { type Exports } from "./exportar";
import { mp4Duration } from "./mp4";
import { canUse, InputError, STRUCTURES, structureById } from "./structures";

export const API_PATH = /^\/api\/v1(\/|$)/;
/** O que o site já faz e o token também alcança: exportar, baixar e mandar arquivos. */
export const PROJECT_API_PATH = /^\/projetos\/[0-9a-f-]{36}\/(arquivos|exportar|exportacoes)(\/|$)/;

const VAZIO = JSON.stringify({ blocks: [], finals: [], edges: [] });
const MAX_BYTES = 1024 * 1024;
/** Ler o MP4 inteiro para saber a duração só vale até aqui; acima, fica a duração pedida. */
const MAX_LEITURA = 64 * 1024 * 1024;
const MAX_QUADROS = 12;

const falha = (status: number, erro: string, extra: Record<string, unknown> = {}) => Response.json({ erro, ...extra }, { status });

export function bearerToken(request: Request): string | null {
  return /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

export class Api {
  constructor(
    private readonly db: Db,
    private readonly media: R2Bucket,
    private readonly exports: Exports,
  ) {}

  async handle(request: Request, user: User, path: string, url: URL): Promise<Response> {
    const post = request.method === "POST";
    if (path === "/api/v1/videos" && !post) return this.videos(user, url);
    if (path === "/api/v1/projetos") return post ? this.create(request, user) : this.list(user, url);
    const m = /^\/api\/v1\/projetos\/([0-9a-f-]{36})(?:\/(comandos|quadros|silencios))?$/.exec(path);
    const project = m ? await this.db.projectById(m[1]!) : null;
    if (!m || !project || project.user_id !== user.id) return falha(404, "nao_encontrado");
    if (m[2] === "comandos") return post ? this.commands(request, user, project) : falha(405, "metodo_invalido");
    if (m[2]) return post ? falha(405, "metodo_invalido") : this.inspect(user, project, m[2], url);
    return post ? falha(405, "metodo_invalido") : Response.json(await this.view(project));
  }

  private async videos(user: User, url: URL): Promise<Response> {
    const usable = STRUCTURES.filter((s) => canUse(s, user.role)).map((s) => s.id);
    const videos = (await this.db.videosByStructures(usable, (url.searchParams.get("q") ?? "").trim())).filter(ready);
    return Response.json({
      videos: videos.map((v) => ({ id: v.id, fala: v.prompt, duracao: v.duration, resolucao: v.resolution, formato: v.aspect_ratio, criado: v.created_at, src: `/videos/${v.id}.mp4` })),
    });
  }

  private async list(user: User, url: URL): Promise<Response> {
    const projects = await this.db.projectsByUser(user.id, (url.searchParams.get("q") ?? "").trim());
    return Response.json({ projetos: projects.map((p) => ({ id: p.id, nome: p.name, revisao: p.revision, atualizado: p.updated_at })) });
  }

  private async create(request: Request, user: User): Promise<Response> {
    const body = await json(request);
    const name = typeof body?.nome === "string" ? body.nome.trim().slice(0, 120) : "";
    const project = await this.db.insertProject({ id: crypto.randomUUID(), user_id: user.id, name: name || "Projeto sem nome", data: VAZIO });
    return Response.json(await this.view(project), { status: 201 });
  }

  /** O projeto salvo, com o que ele significa: grupos, Finais e variações. */
  private async view(project: Project) {
    const data = JSON.parse(project.data) as CanvasProject;
    const gs = groups(data);
    const files = await this.db.projectFiles(project.id);
    return {
      id: project.id,
      nome: project.name,
      revisao: project.revision,
      atualizado: project.updated_at,
      grupos: gs.map((g) => ({ id: g.id, nome: g.label, duracao: g.dur, blocos: members(g).map((b) => b.id) })),
      finais: data.finals.map((f) => {
        const { resolution, format } = output(f);
        const vs = versions(data, f.id);
        return { id: f.id, resolucao: resolution, formato: format, variacoes: vs.map((v, i) => ({ nome: versionName(i), grupos: v.map((g) => g.id), duracao: v.reduce((t, g) => t + g.dur, 0) / finalRate(f) })) };
      }),
      arquivos: files.map((f) => ({ id: f.id, nome: f.name, tipo: f.type, src: `/projetos/${project.id}/arquivos/${f.id}` })),
      avisos: gs.filter((g) => g.blocks.length).flatMap((g) => baseGaps(g).map(([de, ate]) => ({ tipo: "sem_video_de_base", grupo: g.id, de, ate, segundos: +(ate! - de!).toFixed(3) }))),
      canvas: data,
    };
  }

  /** Um lote de comandos sobre uma revisão: tudo ou nada, e quem partiu de uma revisão velha lê de novo. */
  private async commands(request: Request, user: User, project: Project): Promise<Response> {
    const body = await json(request);
    if (!Array.isArray(body?.comandos) || !body.comandos.length || body.comandos.length > MAX_COMANDOS) return falha(400, "comandos_invalidos");
    if (typeof body.revisao !== "number") return falha(400, "revisao_obrigatoria");
    if (body.revisao !== project.revision) return falha(409, "conflito", { revisao: project.revision });
    try {
      const memo = new Map<string, { duracao: number; silencios: number[][] }>();
      const { project: data, criados } = await aplicar(JSON.parse(project.data) as CanvasProject, body.comandos as Record<string, unknown>[], {
        fonte: (c) => this.source(user, project, c),
        silencios: async (src) => {
          if (!memo.has(src)) memo.set(src, await this.silences(user, project, src));
          return memo.get(src)!;
        },
        rosto: (src) => this.face(src),
      });
      const text = JSON.stringify(data);
      if (text.length > MAX_BYTES) return falha(413, "projeto_grande_demais");
      const revision = await this.db.saveProject(project.id, { data: text }, body.revisao);
      if (revision === null) return falha(409, "conflito");
      return Response.json({ criados, ...(await this.view({ ...project, data: text, revision })) });
    } catch (err) {
      if (err instanceof ComandoError) return falha(400, err.codigo, { comando: err.indice });
      throw err;
    }
  }

  /** O arquivo de um bloco novo: um vídeo que a pessoa pode usar ou um arquivo deste projeto. */
  private async source(user: User, project: Project, c: Record<string, unknown>): Promise<Fonte | null> {
    if (typeof c.video === "string") {
      const v = await this.db.videoById(c.video);
      const structure = v && structureById(v.structure);
      if (!v || !ready(v) || !structure || !canUse(structure, user.role)) return null;
      return { src: `/videos/${v.id}.mp4`, kind: "video", dur: await this.duration(v), name: v.prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Vídeo" };
    }
    if (typeof c.arquivo !== "string") return null;
    const file = await this.db.projectFile(project.id, c.arquivo);
    if (!file) return null;
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "video";
    return { src: `/projetos/${project.id}/arquivos/${file.id}`, kind, dur: null, name: file.name };
  }

  /** Quadros de um arquivo, lado a lado, ou os silêncios dele: o que o agente usa para decidir. */
  private async inspect(user: User, project: Project, what: string, url: URL): Promise<Response> {
    const src = url.searchParams.get("src") ?? "";
    try {
      if (what === "silencios") return Response.json(await this.silences(user, project, src));
      const instants = (url.searchParams.get("instantes") ?? "").split(",").filter(Boolean).map(Number);
      if (!instants.length || instants.length > MAX_QUADROS || !instants.every((t) => Number.isFinite(t) && t >= 0)) return falha(400, "instantes_invalidos");
      const res = await this.exports.inspect(await this.exports.source(project, user.role, src), "/quadros", instants.join(","));
      return new Response(res.body, { headers: { "content-type": "image/jpeg", "content-length": res.headers.get("content-length")!, "cache-control": "private, no-store" } });
    } catch (err) {
      if (err instanceof InputError) return falha(404, "arquivo_indisponivel");
      throw err;
    }
  }

  private async silences(user: User, project: Project, src: string): Promise<{ duracao: number; silencios: number[][] }> {
    const res = await this.exports.inspect(await this.exports.source(project, user.role, src), "/silencios");
    return res.json();
  }

  /** O ponto entre os olhos, achado pelo agendamento (videos.face). */
  private async face(src: string): Promise<{ x: number; y: number } | null> {
    const id = /^\/videos\/([0-9a-f-]{36})/.exec(src)?.[1];
    const face = id ? (await this.db.videoById(id))?.face : null;
    if (!face) return null;
    try {
      const { x, y } = JSON.parse(face) as { x?: unknown; y?: unknown };
      return typeof x === "number" && typeof y === "number" ? { x, y } : null;
    } catch {
      return null;
    }
  }

  /** A duração do arquivo que vale (o tratado ou o original), que pode diferir da pedida ao modelo. */
  private async duration(v: Video): Promise<number> {
    const object = await this.media.get(v.processed_key ?? v.video_key!);
    if (!object) return v.duration;
    if (object.size > MAX_LEITURA) {
      await object.body.cancel();
      return v.duration;
    }
    return mp4Duration(await object.arrayBuffer()) ?? v.duration;
  }
}

const ready = (v: Video) => v.status === "completed" && !!v.video_key;

async function json(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
