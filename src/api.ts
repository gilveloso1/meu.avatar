/**
 * API dos projetos (docs/api.md): o que um agente precisa para editar um projeto pelo
 * mesmo modelo da tela. Só o administrador, como o canvas; cada projeto é só de quem o
 * criou. Exportar e baixar usam as rotas do site, com o mesmo token.
 */
import { baseGaps, finalRate, groups, members, output, versionName, versions } from "./canvas/modelo.js";
import { ESTILO_PADRAO, type Estilo, falantes, html as legendaHtml, noGrupo, trechos } from "./legenda";
import type { CanvasProject } from "./canvas/modelo.js";
import { aplicar, ComandoError, type Fonte, MAX_COMANDOS } from "./comandos";
import type { AssetKind, AvatarAsset, Db, Project, User, Video } from "./db";
import { type Exports } from "./exportar";
import { mp4Duration } from "./mp4";
import { canUse, InputError, STRUCTURES, structureById } from "./structures";
import { FONTES, MAX_RENDER_SECONDS, RenderError } from "./render";
import { AudioLongoError, type Palavra } from "./transcricao";

export const API_PATH = /^\/api\/v1(\/|$)/;
/** O que o site já faz e o token também alcança: exportar, baixar e mandar arquivos. */
export const PROJECT_API_PATH = /^\/projetos\/[0-9a-f-]{36}\/(arquivos|exportar|exportacoes)(\/|$)/;

const VAZIO = JSON.stringify({ blocks: [], finals: [], edges: [] });
const MAX_BYTES = 1024 * 1024;
/** Ler o MP4 inteiro para saber a duração só vale até aqui; acima, fica a duração pedida. */
const MAX_LEITURA = 64 * 1024 * 1024;
const MAX_QUADROS = 12;

const KINDS: Record<AssetKind, Fonte["kind"]> = { imagem: "image", video: "video", audio: "audio" };
const assetSrc = (a: AvatarAsset) => `/avatares/${a.avatar_id}/arquivos/${a.id}`;

const falha = (status: number, erro: string, extra: Record<string, unknown> = {}) => Response.json({ erro, ...extra }, { status });

/** O contêiner não respondeu nem nas novas tentativas (src/conteiner.ts): o agente tenta mais tarde. */
function conteinerFalhou(oQue: string, err: unknown): Response {
  console.error(`${oQue} falhou`, err);
  return falha(503, "conteiner_falhou");
}

const nomeDoArquivo = (v: unknown, padrao: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : padrao);
const COR = /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i;

function estiloValido(e: Estilo): boolean {
  return FONTES.includes(e.fonte) && COR.test(e.cor) && COR.test(e.destaque) && typeof e.maiusculas === "boolean" && typeof e.tamanho === "number" && e.tamanho >= 16 && e.tamanho <= 120 && typeof e.altura === "number" && e.altura >= 0.05 && e.altura <= 0.95;
}

export function bearerToken(request: Request): string | null {
  return /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

/** O que o projeto significa: grupos, Finais com as variações e avisos. É a resposta dos comandos. */
function resumo(data: CanvasProject) {
  const gs = groups(data);
  return {
    grupos: gs.map((g) => ({ id: g.id, nome: g.label, duracao: g.dur, blocos: members(g).map((b) => b.id) })),
    finais: data.finals.map((f) => {
      const { resolution, format } = output(f);
      const vs = versions(data, f.id);
      return { id: f.id, resolucao: resolution, formato: format, variacoes: vs.map((v, i) => ({ nome: versionName(i), grupos: v.map((g) => g.id), duracao: v.reduce((t, g) => t + g.dur, 0) / finalRate(f) })) };
    }),
    avisos: [
      ...gs.filter((g) => g.blocks.length).flatMap((g) => baseGaps(g).map(([de, ate]) => ({ tipo: "sem_video_de_base", grupo: g.id, de, ate, segundos: +(ate! - de!).toFixed(3) }))),
      ...data.blocks.filter((b) => b.draft).map((b) => ({ tipo: "rascunho", bloco: b.id, fala: b.draft!.fala, segundos: +(b.tout - b.tin).toFixed(3) })),
    ],
  };
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
    if (path === "/api/v1/avatares" && !post) return this.avatars(user, url);
    if (path === "/api/v1/projetos") return post ? this.create(request, user) : this.list(user, url);
    const m = /^\/api\/v1\/projetos\/([0-9a-f-]{36})(?:\/(comandos|quadros|silencios|transcricao|html|legenda))?$/.exec(path);
    const project = m ? await this.db.projectById(m[1]!) : null;
    if (!m || !project || project.user_id !== user.id) return falha(404, "nao_encontrado");
    if (m[2] === "comandos") return post ? this.commands(request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "html") return post ? this.renderHtml(request, project) : falha(405, "metodo_invalido");
    if (m[2] === "legenda") return post ? this.caption(request, user, project) : falha(405, "metodo_invalido");
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

  /** Os avatares da pessoa com os ativos, para entrar num projeto como os vídeos. */
  private async avatars(user: User, url: URL): Promise<Response> {
    const [avatars, assets] = await Promise.all([this.db.avatarsByUser(user.id, (url.searchParams.get("q") ?? "").trim()), this.db.assetsByUser(user.id)]);
    return Response.json({
      avatares: avatars.map((a) => ({
        id: a.id,
        nome: a.name,
        descricao: a.description,
        ativos: assets
          .filter((x) => x.avatar_id === a.id)
          .map((x) => ({ id: x.id, nome: x.name, tipo: x.kind, origem: x.source_video ? "gerado" : "enviado", foto: x.id === a.photo_asset, voz: x.id === a.voice_asset, src: assetSrc(x) })),
      })),
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

  /** O projeto salvo, com o que ele significa e, no fim, os arquivos e o canvas inteiro. */
  private async view(project: Project) {
    const data = JSON.parse(project.data) as CanvasProject;
    const files = await this.db.projectFiles(project.id);
    return {
      id: project.id,
      nome: project.name,
      revisao: project.revision,
      atualizado: project.updated_at,
      ...resumo(data),
      arquivos: files.map((f) => ({ id: f.id, nome: f.name, tipo: f.type, src: `/projetos/${project.id}/arquivos/${f.id}` })),
      canvas: data,
    };
  }

  /** O HTML do agente vira um WebM transparente no projeto; o log volta quando o HTML não roda. */
  private async renderHtml(request: Request, project: Project): Promise<Response> {
    const body = await json(request);
    return this.render(project, { nome: nomeDoArquivo(body?.nome, "camada.webm"), html: typeof body?.html === "string" ? body.html : "", duracao: typeof body?.duracao === "number" ? body.duracao : NaN, final: typeof body?.final === "string" ? body.final : undefined });
  }

  /** O WebM no projeto, com os erros do render em códigos para o agente. */
  private async render(project: Project, c: { nome: string; html: string; duracao: number; final?: string }, extra: Record<string, unknown> = {}): Promise<Response> {
    try {
      const r = await this.exports.renderHtml(project, c);
      if (r === null) return falha(503, "render_indisponivel");
      if (typeof r === "string") return falha(r === "html_grande_demais" || r === "video_grande_demais" ? 413 : 400, r);
      return Response.json({ arquivo: { id: r.file.id, nome: r.file.name, tipo: r.file.type, src: `/projetos/${project.id}/arquivos/${r.file.id}` }, duracao: c.duracao, largura: r.largura, altura: r.altura, ...extra }, { status: 201 });
    } catch (err) {
      if (err instanceof RenderError) return falha(422, "render_falhou", { detalhe: err.message });
      return conteinerFalhou("Render", err);
    }
  }

  /**
   * A legenda palavra a palavra de um grupo: as palavras vêm da transcrição dos blocos que falam
   * (ou do agente, corrigidas) e viram um WebM do tamanho do grupo. simular mostra os trechos sem fazer o vídeo.
   */
  private async caption(request: Request, user: User, project: Project): Promise<Response> {
    const body = await json(request);
    const data = JSON.parse(project.data) as CanvasProject;
    const g = groups(data).find((o) => o.id === body?.grupo);
    if (!g) return falha(400, "grupo_inexistente");
    if (g.dur > MAX_RENDER_SECONDS) return falha(400, "grupo_longo_demais");
    const semTexto = Array.isArray(body?.semTexto) ? (body.semTexto as unknown[]) : [];
    if (!semTexto.every((t) => Array.isArray(t) && t.length === 2 && t.every((v) => typeof v === "number") && t[0] < t[1])) return falha(400, "sem_texto_invalido");
    const estilo = { ...ESTILO_PADRAO, ...(typeof body?.estilo === "object" && body.estilo ? body.estilo : {}) } as Estilo;
    if (!estiloValido(estilo)) return falha(400, "estilo_invalido");
    let palavras: Palavra[];
    if (body?.palavras !== undefined) {
      const lista = Array.isArray(body.palavras) ? (body.palavras as Record<string, unknown>[]) : [];
      if (!lista.length || !lista.every((p) => typeof p?.palavra === "string" && p.palavra.trim() && typeof p.inicio === "number" && typeof p.fim === "number" && p.inicio >= 0 && p.fim >= p.inicio && p.inicio < g.dur)) return falha(400, "palavras_invalidas");
      palavras = lista.map((p) => ({ palavra: (p.palavra as string).trim(), inicio: p.inicio as number, fim: p.fim as number }));
    } else {
      const ids = Array.isArray(body?.fontes) ? (body.fontes as unknown[]).filter((v): v is string => typeof v === "string") : undefined;
      const quem = falantes(g, ids);
      if (!quem.length) return falha(400, "sem_fala");
      palavras = [];
      try {
        for (const b of quem) {
          const t = await this.exports.transcribe(await this.exports.source(project, user.role, b.src));
          if (!t) return falha(503, "transcricao_indisponivel");
          palavras.push(...noGrupo(g, b, t.palavras));
        }
      } catch (err) {
        if (err instanceof InputError) return falha(404, "arquivo_indisponivel");
        if (err instanceof AudioLongoError) return falha(413, "audio_longo_demais");
        return conteinerFalhou("Transcrição da legenda", err);
      }
    }
    const ts = trechos(palavras, semTexto as number[][], g.dur);
    const resumo = { palavras, trechos: ts.map((t) => ({ texto: t.palavras.map((p) => p.palavra).join(" "), inicio: t.inicio, fim: t.fim })) };
    const duracao = +g.dur.toFixed(3);
    if (body?.simular === true) return Response.json({ duracao, ...resumo });
    if (!ts.length) return falha(400, "sem_fala");
    const final = typeof body?.final === "string" ? body.final : undefined;
    const f = final === undefined ? data.finals[0] : data.finals.find((o) => o.id === final);
    if (final !== undefined && !f) return falha(400, "final_inexistente");
    const { width, height } = output(f!);
    return this.render(project, { nome: nomeDoArquivo(body?.nome, "legenda.webm"), html: legendaHtml(ts, estilo, width, height), duracao, final }, resumo);
  }

  /** Um lote de comandos sobre uma revisão: tudo ou nada, e quem partiu de uma revisão velha lê de novo. */
  private async commands(request: Request, user: User, project: Project): Promise<Response> {
    const body = await json(request);
    if (!Array.isArray(body?.comandos) || !body.comandos.length || body.comandos.length > MAX_COMANDOS) return falha(400, "comandos_invalidos");
    if (typeof body.revisao !== "number") return falha(400, "revisao_obrigatoria");
    if (body.revisao !== project.revision) return falha(409, "conflito", { revisao: project.revision });
    try {
      const memo = new Map<string, { duracao: number; silencios: number[][]; som: boolean }>();
      const { project: data, criados } = await aplicar(JSON.parse(project.data) as CanvasProject, body.comandos as Record<string, unknown>[], {
        fonte: (c) => this.source(user, project, c),
        silencios: async (src) => {
          if (!memo.has(src)) memo.set(src, await this.silences(user, project, src));
          return memo.get(src)!;
        },
        rosto: (src) => this.face(user, src),
      });
      const text = JSON.stringify(data);
      if (text.length > MAX_BYTES) return falha(413, "projeto_grande_demais");
      const revision = await this.db.saveProject(project.id, { data: text }, body.revisao);
      if (revision === null) return falha(409, "conflito");
      // Só o que o lote mudou: os arquivos e o canvas inteiro ficam no ver_projeto (o maior gasto do agente).
      return Response.json({ revisao: revision, criados, ...resumo(data) });
    } catch (err) {
      if (err instanceof ComandoError) return falha(400, err.codigo, { comando: err.indice, ...err.extra });
      throw err;
    }
  }

  /** O arquivo de um bloco novo: um vídeo que a pessoa pode usar, um ativo de um avatar dela ou um arquivo deste projeto. */
  private async source(user: User, project: Project, c: Record<string, unknown>): Promise<Fonte | null> {
    if (typeof c.ativo === "string") {
      const a = await this.db.assetOfUser(user.id, c.ativo);
      if (!a) return null;
      // O vídeo gerado tem a duração conhecida; o enviado, como o arquivo do projeto, pede dur.
      const video = a.source_video ? await this.db.videoById(a.source_video) : null;
      return { src: assetSrc(a), kind: KINDS[a.kind], dur: video ? await this.duration(video) : null, name: a.name };
    }
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
    return { src: `/projetos/${project.id}/arquivos/${file.id}`, kind, dur: null, name: file.name, som: await this.exports.hasSound(file.key, file.type) };
  }

  /** Quadros de um arquivo, lado a lado, os silêncios ou a fala dele: o que o agente usa para decidir. */
  private async inspect(user: User, project: Project, what: string, url: URL): Promise<Response> {
    const src = url.searchParams.get("src") ?? "";
    try {
      if (what === "silencios") return Response.json(await this.silences(user, project, src));
      if (what === "transcricao") {
        const t = await this.exports.transcribe(await this.exports.source(project, user.role, src));
        return t ? Response.json(t) : falha(503, "transcricao_indisponivel");
      }
      const instants = (url.searchParams.get("instantes") ?? "").split(",").filter(Boolean).map(Number);
      if (!instants.length || instants.length > MAX_QUADROS || !instants.every((t) => Number.isFinite(t) && t >= 0)) return falha(400, "instantes_invalidos");
      const res = await this.exports.inspect(await this.exports.source(project, user.role, src), "/quadros", instants.join(","));
      return new Response(res.body, { headers: { "content-type": "image/jpeg", "content-length": res.headers.get("content-length")!, "cache-control": "private, no-store" } });
    } catch (err) {
      if (err instanceof InputError) return falha(404, "arquivo_indisponivel");
      if (err instanceof AudioLongoError) return falha(413, "audio_longo_demais");
      return conteinerFalhou(`Inspeção (${what})`, err);
    }
  }

  /** som: false é arquivo sem faixa de áudio (o WebM do render): não há silêncio a cortar. */
  private async silences(user: User, project: Project, src: string): Promise<{ duracao: number; silencios: number[][]; som: boolean }> {
    const res = await this.exports.inspect(await this.exports.source(project, user.role, src), "/silencios");
    return res.json();
  }

  /** O ponto entre os olhos, achado pelo agendamento (videos.face e avatar_assets.face). */
  private async face(user: User, src: string): Promise<{ x: number; y: number } | null> {
    const id = /^\/videos\/([0-9a-f-]{36})/.exec(src)?.[1];
    const asset = /^\/avatares\/[0-9a-f-]{36}\/arquivos\/([0-9a-f-]{36})$/.exec(src)?.[1];
    const face = id ? (await this.db.videoById(id))?.face : asset ? (await this.db.assetOfUser(user.id, asset))?.face : null;
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
