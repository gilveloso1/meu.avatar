/**
 * API dos projetos (docs/api.md): o que um agente precisa para editar um projeto pelo
 * mesmo modelo da tela. Só o administrador, como o canvas; cada projeto é só de quem o
 * criou. Exportar e baixar usam as rotas do site, com o mesmo token.
 */
import { baseGaps, finalRate, groups, links, members, output, PX, upgrade, versionName, versions, width } from "./canvas/modelo.js";
import { ESTILO_PADRAO, type Estilo, falantes, html as legendaHtml, noGrupo, trechos } from "./legenda";
import type { CanvasProject } from "./canvas/modelo.js";
import { aplicar, ComandoError, type Fonte, MAX_COMANDOS } from "./comandos";
import { filtro, itemAtivo, itemProjeto, listar } from "./acervo";
import type { AssetKind, AvatarAsset, Db, Project, User, Video } from "./db";
import { type Exports } from "./exportar";
import { mp4Duration } from "./mp4";
import { canUse, estimate, InputError, madeAtOnce, makesAudio, makesImage, STRUCTURES, structureById } from "./structures";
import { HEYGEN_AVATAR, VOICES } from "./structures/heygen";
import { DIRECT_VOICES, HEYGEN_MODEL } from "./structures/heygen-direta";
import { NANO_BANANA } from "./structures/imagem";
import { base64, ForbiddenError, type Studio } from "./studio";
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
/**
 * Outra pessoa (o canvas) salvou antes: vai o resumo do projeto como está agora, na revisão nova.
 * O agente compara com o que já tem e refaz o lote sem ler o projeto de novo.
 */
const conflito = (project: Project) => falha(409, "conflito", { ...resumo(JSON.parse(project.data) as CanvasProject), revisao: project.revision });

const PAGINA_ANIMACOES = 20;
const MAX_PAGINA_ANIMACOES = 100;

/** O texto que a animação mostra, sem estilo, script nem marcação: o que ajuda a escolher uma. */
function textoNaTela(html: string): string {
  const t = html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 160 ? `${t.slice(0, 159)}…` : t;
}

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

const TIPOS_DE_BLOCO = { video: "video", image: "imagem", audio: "audio" } as const;
const segundos = (px: number) => +(px / PX).toFixed(3);

/**
 * O que o projeto significa: grupos com os blocos (onde cada um começa e termina no grupo),
 * Finais com as variações e avisos. É a resposta dos comandos e o padrão do ver_projeto.
 */
function resumo(data: CanvasProject) {
  const gs = groups(data);
  return {
    grupos: gs.map((g) => ({
      id: g.id,
      nome: g.label,
      duracao: g.dur,
      blocos: members(g).map((b) => ({
        id: b.id,
        nome: b.name,
        tipo: b.draft ? "rascunho" : b.code ? "animacao" : TIPOS_DE_BLOCO[b.kind],
        camada: g.blocks.includes(b) ? "base" : g.covers.includes(b) ? "cobertura" : "audio",
        inicio: segundos(b.x - g.x),
        fim: segundos(b.x + width(b) - g.x),
      })),
    })),
    // Cada ligação de grupo a grupo ou a um Final, com o id para remover (o primeiro bloco já vem ligado ao Final).
    ligacoes: links(data, gs).map((l) => ({ id: l.edge.id, de: l.from.id, para: typeof l.to === "string" ? l.to : l.to.id })),
    finais: data.finals.map((f) => {
      const { resolution, format } = output(f);
      const vs = versions(data, f.id);
      return { id: f.id, resolucao: resolution, formato: format, variacoes: vs.map((v, i) => ({ nome: versionName(i), grupos: v.map((g) => g.id), duracao: v.reduce((t, g) => t + g.dur, 0) / finalRate(f) })) };
    }),
    avisos: [
      ...gs.filter((g) => g.blocks.length).flatMap((g) => baseGaps(g).map(([de, ate]) => ({ tipo: "sem_video_de_base", grupo: g.id, de, ate, segundos: +(ate! - de!).toFixed(3) }))),
      ...data.blocks.filter((b) => b.draft).map((b) => ({ tipo: "rascunho", bloco: b.id, fala: b.draft!.fala, ...(b.draft!.descricao ? { descricao: b.draft!.descricao } : {}), segundos: +(b.tout - b.tin).toFixed(3) })),
      // Um Final a que nenhum grupo chega não exporta nada (falta ligar a última cena a ele).
      ...(gs.length ? data.finals.filter((f) => !versions(data, f.id).length).map((f) => ({ tipo: "final_sem_variacao", final: f.id })) : []),
    ],
  };
}

/** As notas novas ou com o texto trocado (com o texto) e as que saíram, para a resposta dos comandos. */
function notasMudadas(antes: CanvasProject, depois: CanvasProject) {
  const eram = new Map((antes.notes ?? []).map((n) => [n.id, n.text]));
  const ficam = new Set((depois.notes ?? []).map((n) => n.id));
  return {
    notas: (depois.notes ?? []).filter((n) => eram.get(n.id) !== n.text).map((n) => ({ id: n.id, texto: n.text })),
    removidas: [...eram.keys()].filter((id) => !ficam.has(id)),
  };
}

type Resumo = ReturnType<typeof resumo>;
type Aviso = Resumo["avisos"][number];

/** O aviso sem a fala e a descrição do rascunho: quem editou acabou de escrevê-las, e o ver_projeto as mostra. */
const semFala = (a: Aviso) => ("fala" in a ? (({ fala: _, descricao: __, ...resto }) => resto)(a) : a);

/**
 * O que o lote mudou, para o agente não reler o projeto inteiro a cada edição (num roteiro de 30 falas, o resumo
 * passava de 7 mil caracteres, metade nas falas dos rascunhos). Grupos novos ou alterados só com os blocos novos ou
 * alterados, Finais alterados, o que sumiu e os avisos que apareceram ou se resolveram. Campo vazio não vem.
 * Blocos que só andaram no grupo (um corte antes deles) vêm em andaram, uma faixa por deslocamento, e não um a um.
 */
function mudancas(antes: Resumo, depois: Resumo) {
  const chave = (x: unknown) => JSON.stringify(x);
  type Bloco = Resumo["grupos"][number]["blocos"][number];
  const grupoDe = new Map(depois.grupos.flatMap((g) => g.blocos.map((b) => [b.id, g.id] as const)));
  const idsAntes = new Set(antes.grupos.map((g) => g.id));
  const idsDepois = new Set(depois.grupos.map((g) => g.id));
  // O grupo tem o id do primeiro bloco: tirado esse bloco, o mesmo grupo passa a ter o id do seguinte. Não é remoção.
  const idNovo = new Map(
    antes.grupos.flatMap((g) => {
      if (idsDepois.has(g.id)) return [];
      const onde = [...new Set(g.blocos.map((b) => grupoDe.get(b.id)).filter((id): id is string => !!id))];
      return onde.length === 1 && !idsAntes.has(onde[0]!) ? [[g.id, onde[0]!] as const] : [];
    }),
  );
  const g0 = (id: string) => idNovo.get(id) ?? id;
  const blocosAntes = new Map(antes.grupos.flatMap((g) => g.blocos.map((b) => [b.id, { g: g0(g.id), b }] as const)));
  const gruposAntes = new Map(antes.grupos.map((g) => [g0(g.id), chave([g.nome, g.duracao])]));
  /** 0 quando nada mudou; o deslocamento, quando só o início e o fim andaram juntos; null quando mudou de verdade. */
  const passo = (g: string, b: Bloco): number | null => {
    const a = blocosAntes.get(b.id);
    if (!a || a.g !== g) return null;
    const d = +(b.inicio - a.b.inicio).toFixed(3);
    const igual = chave({ ...a.b, inicio: 0, fim: 0 }) === chave({ ...b, inicio: 0, fim: 0 }) && Math.abs(b.fim - a.b.fim - d) < 0.001;
    return igual ? d : null;
  };
  const grupos = depois.grupos
    .map((g) => {
      const blocos: Bloco[] = [];
      const andaram: { de: string; ate: string; segundos: number }[] = [];
      let faixa: (typeof andaram)[number] | null = null;
      for (const b of g.blocos) {
        const d = passo(g.id, b);
        if (d === null) blocos.push(b);
        if (d === null || d === 0) {
          faixa = null;
          continue;
        }
        if (faixa && faixa.segundos === d) faixa.ate = b.id;
        else {
          faixa = { de: b.id, ate: b.id, segundos: d };
          andaram.push(faixa);
        }
      }
      return { id: g.id, nome: g.nome, duracao: g.duracao, ...(blocos.length ? { blocos } : {}), ...(andaram.length ? { andaram } : {}) };
    })
    .filter((g) => g.blocos || g.andaram || gruposAntes.get(g.id) !== chave([g.nome, g.duracao]));
  const ligacoesAntes = new Set(antes.ligacoes.map((l) => chave({ ...l, de: g0(l.de), para: g0(l.para) })));
  const ligacoes = depois.ligacoes.filter((l) => !ligacoesAntes.has(chave(l)));
  // Um grupo que o lote partiu: parte dos blocos dele foi parar num grupo novo, só com blocos dele (remover sem fechar).
  const novos = depois.grupos.filter((g) => !gruposAntes.has(g.id));
  const partidos = antes.grupos.flatMap((g) => {
    const meus = new Set(g.blocos.filter((b) => b.camada === "base").map((b) => b.id));
    const partes = [...new Set(g.blocos.filter((b) => meus.has(b.id) && grupoDe.has(b.id)).map((b) => grupoDe.get(b.id)!))];
    const sobra = novos.some((n) => partes.includes(n.id) && n.blocos.filter((b) => b.camada === "base").every((b) => meus.has(b.id)));
    return partes.length > 1 && sobra ? [{ tipo: "grupo_partido", grupo: g.id, partes }] : [];
  });
  const finaisAntes = new Map(antes.finais.map((f) => [f.id, chave({ ...f, variacoes: f.variacoes.map((v) => ({ ...v, grupos: v.grupos.map(g0) })) })]));
  const finais = depois.finais.filter((f) => finaisAntes.get(f.id) !== chave(f));
  const ficaram = (lista: { id: string }[]) => new Set(lista.map((x) => x.id));
  const blocosDepois = new Set(depois.grupos.flatMap((g) => g.blocos.map((b) => b.id)));
  const removidos = {
    blocos: [...blocosAntes.keys()].filter((id) => !blocosDepois.has(id)),
    grupos: antes.grupos.map((g) => g.id).filter((id) => !idsDepois.has(id) && !idNovo.has(id)),
    finais: antes.finais.map((f) => f.id).filter((id) => !ficaram(depois.finais).has(id)),
    ligacoes: antes.ligacoes.map((l) => l.id).filter((id) => !ficaram(depois.ligacoes).has(id)),
  };
  // Um aviso é do seu bloco, grupo ou Final: se só o valor mudou (a duração do rascunho), vem uma vez, com o novo.
  const quem = (a: Aviso) => chave([a.tipo, "bloco" in a ? a.bloco : "grupo" in a ? g0(a.grupo) : "final" in a ? a.final : ""]);
  const normal = (a: Aviso) => chave("grupo" in a ? { ...a, grupo: g0(a.grupo) } : a);
  const avisosAntes = new Set(antes.avisos.map(normal));
  const quemDepois = new Set(depois.avisos.map(quem));
  const avisos = [...partidos, ...depois.avisos.filter((a) => !avisosAntes.has(chave(a))).map(semFala)];
  const avisosResolvidos = antes.avisos.filter((a) => !quemDepois.has(quem(a))).map(semFala);
  const gruposComIdNovo = [...idNovo].map(([de, para]) => ({ de, para }));
  const cheio = (x: unknown[]) => x.length > 0;
  return {
    mudou: {
      ...(cheio(gruposComIdNovo) ? { gruposComIdNovo } : {}),
      ...(cheio(grupos) ? { grupos } : {}),
      ...(cheio(finais) ? { finais } : {}),
      ...(cheio(ligacoes) ? { ligacoes } : {}),
      ...(Object.values(removidos).some(cheio) ? { removidos: Object.fromEntries(Object.entries(removidos).filter(([, v]) => cheio(v))) } : {}),
      ...(cheio(avisos) ? { avisos } : {}),
      ...(cheio(avisosResolvidos) ? { avisosResolvidos } : {}),
    },
    avisosPendentes: depois.avisos.length,
  };
}

export class Api {
  constructor(
    private readonly db: Db,
    private readonly media: R2Bucket,
    private readonly exports: Exports,
    /** Gera a imagem (gerar_imagem); sem ele, a rota responde que a criação está pausada. */
    private readonly studio: Studio | null = null,
  ) {}

  async handle(request: Request, user: User, path: string, url: URL): Promise<Response> {
    const post = request.method === "POST";
    if (path === "/api/v1/arquivos" && !post) return this.files(user, url);
    if (path === "/api/v1/avatares" && !post) return this.avatars(user, url);
    if (path === "/api/v1/animacoes" && !post) return this.animations(user, url);
    if (path === "/api/v1/projetos") return post ? this.create(request, user) : this.list(user, url);
    if (path === "/api/v1/vozes" && !post) return this.voices(user, url);
    const video = /^\/api\/v1\/videos\/([0-9a-f-]{36})$/.exec(path);
    if (video) return post ? falha(405, "metodo_invalido") : this.followVideo(user, video[1]!);
    const m = /^\/api\/v1\/projetos\/([0-9a-f-]{36})(?:\/(comandos|quadros|silencios|transcricao|html|legenda|limpar|animacao|imagem|video))?$/.exec(path);
    const project = m ? await this.db.projectById(m[1]!) : null;
    if (!m || !project || project.user_id !== user.id) return falha(404, "nao_encontrado");
    if (m[2] === "comandos") return post ? this.commands(request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "html") return post ? this.renderHtml(request, project) : falha(405, "metodo_invalido");
    if (m[2] === "legenda") return post ? this.caption(request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "limpar") return post ? this.cleanFiles(request, project) : falha(405, "metodo_invalido");
    if (m[2] === "animacao") return post ? falha(405, "metodo_invalido") : this.inspectCode(project, url);
    if (m[2] === "imagem") return post ? this.generateImage(request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "video") return post ? this.generateVideo(request, user, project) : falha(405, "metodo_invalido");
    if (m[2]) return post ? falha(405, "metodo_invalido") : this.inspect(user, project, m[2], url);
    return post ? falha(405, "metodo_invalido") : Response.json(await this.view(project, (url.searchParams.get("incluir") ?? "").split(","), url));
  }

  /**
   * O acervo da conta (src/acervo.ts): vídeos, imagens e áudios gerados, dos avatares e dos
   * projetos, uma página por vez, com os filtros de tipo, fonte, modelo, avatar, projeto e data.
   */
  private async files(user: User, url: URL): Promise<Response> {
    const f = filtro(url.searchParams, user);
    return "erro" in f ? falha(400, f.erro) : Response.json(await listar(this.db, user, f, url));
  }

  /** Os avatares da pessoa com os ativos, para entrar num projeto como os vídeos. */
  /**
   * As animações em código já feitas nos projetos da pessoa, para o próximo agente partir de uma
   * delas: do mesmo projeto, dos projetos que usam um avatar (pelos vídeos e ativos dele) ou pela
   * busca no texto. Sem o código, que custa caro: só o que ajuda a escolher. A cópia é adicionar {animacao}.
   */
  private async animations(user: User, url: URL): Promise<Response> {
    const p = url.searchParams;
    const limite = p.has("limite") ? Number(p.get("limite")) : PAGINA_ANIMACOES;
    if (!Number.isInteger(limite) || limite < 1 || limite > MAX_PAGINA_ANIMACOES) return falha(400, "limite_invalido");
    const projeto = p.get("projeto") ?? "";
    const avatar = p.get("avatar") ?? "";
    const busca = (p.get("q") ?? "").trim().toLowerCase();
    const projetos = (await this.db.projectsByUser(user.id)).filter((o) => !projeto || o.id === projeto);
    const dados = projetos.map((o) => ({ projeto: o, data: JSON.parse(o.data) as CanvasProject }));
    const videos = [...new Set(dados.flatMap((d) => d.data.blocks.map((b) => /^\/videos\/([0-9a-f-]{36})/.exec(b.src)?.[1]).filter((v): v is string => !!v)))];
    const avatarDoVideo = await this.db.conta(user.id).videoAvatars(videos);
    const lista = [];
    for (const { projeto: o, data } of dados) {
      const avatares = [...new Set(data.blocks.map((b) => /^\/avatares\/([0-9a-f-]{36})\//.exec(b.src)?.[1] ?? avatarDoVideo.get(/^\/videos\/([0-9a-f-]{36})/.exec(b.src)?.[1] ?? "")).filter((v): v is string => !!v))];
      if (avatar && !avatares.includes(avatar)) continue;
      for (const b of data.blocks) {
        if (!b.code) continue;
        const texto = textoNaTela(b.code.html);
        if (busca && !`${b.name} ${texto} ${Object.values(b.code.params ?? {}).join(" ")}`.toLowerCase().includes(busca)) continue;
        lista.push({ projeto: { id: o.id, nome: o.name }, bloco: b.id, nome: b.name, duracao: +(b.tout - b.tin).toFixed(3), texto, ...(b.code.params ? { parametros: b.code.params } : {}), avatares, atualizado: o.updated_at });
      }
    }
    return Response.json({ animacoes: lista.slice(0, limite), ...(lista.length > limite ? { mais: lista.length - limite } : {}) });
  }

  private async avatars(user: User, url: URL): Promise<Response> {
    const [avatars, assets] = await Promise.all([this.db.avatarsByUser(user.id, (url.searchParams.get("q") ?? "").trim()), this.db.assetsByUser(user.id)]);
    return Response.json({
      avatares: avatars.map((a) => ({
        id: a.id,
        nome: a.name,
        descricao: a.description,
        ativos: assets
          .filter((x) => x.avatar_id === a.id)
          .map((x) => ({ ...itemAtivo(x, a.name, url), origem: x.source_video ? "gerado" : "enviado", foto: x.id === a.photo_asset, voz: x.id === a.voice_asset })),
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

  /**
   * O projeto salvo, com o que ele significa. Os arquivos, o código das animações e o canvas inteiro (o maior gasto do
   * agente: uns 7 e 10 mil caracteres no projeto da Lara Resende) só vêm quando pedidos em incluir.
   */
  private async view(project: Project, incluir: string[] = [], url?: URL) {
    const data = JSON.parse(project.data) as CanvasProject;
    const arquivos = incluir.includes("arquivos") && url ? (await this.db.projectFiles(project.id)).map((f) => itemProjeto(f, project.name, url)) : null;
    return {
      id: project.id,
      nome: project.name,
      revisao: project.revision,
      atualizado: project.updated_at,
      ...resumo(data),
      // As notas que a pessoa colou ou escreveu no canvas (briefing, roteiro, referências): fora dos vídeos.
      ...(data.notes?.length ? { notas: data.notes.map((n) => ({ id: n.id, texto: n.text })) } : {}),
      ...(arquivos ? { arquivos } : {}),
      ...(incluir.includes("codigo") ? { codigo: data.blocks.filter((b) => b.code).map((b) => ({ bloco: b.id, nome: b.name, duracao: +(b.tout - b.tin).toFixed(3), html: b.code!.html, ...(b.code!.params ? { parametros: b.code!.params } : {}), ...(b.code!.escala ? { escala: b.code!.escala } : {}), ...(b.code!.fixa ? { esticar: false } : {}) })) } : {}),
      ...(incluir.includes("canvas") ? { canvas: data } : {}),
    };
  }

  /**
   * Os arquivos do projeto que nenhum bloco usa (os WebMs refeitos se acumulam: mais de 30 no projeto
   * da Lara Resende). Sem apagar: true, só a lista. Durante uma exportação, recusa: ela lê os arquivos.
   */
  private async cleanFiles(request: Request, project: Project): Promise<Response> {
    const body = await json(request);
    const data = JSON.parse(project.data) as CanvasProject;
    const usados = new Set(data.blocks.map((b) => b.src));
    const semUso = (await this.db.projectFiles(project.id)).filter((f) => !usados.has(`/projetos/${project.id}/arquivos/${f.id}`));
    const lista = { arquivos: semUso.map((f) => ({ id: f.id, nome: f.name, tipo: f.type, tamanho: f.size })), tamanho: semUso.reduce((t, f) => t + f.size, 0) };
    if (body?.apagar !== true) return Response.json(lista);
    if ((await this.db.latestExport(project.id))?.status === "running") return falha(409, "exportando");
    const keys = await this.db.deleteProjectFiles(project.id, semUso.map((f) => f.id));
    if (keys.length) await this.media.delete(keys);
    return Response.json({ ...lista, apagados: true });
  }

  /** O HTML do agente vira um WebM transparente no projeto; o log volta quando o HTML não roda. */
  private async renderHtml(request: Request, project: Project): Promise<Response> {
    const body = await json(request);
    return this.render(project, { nome: nomeDoArquivo(body?.nome, "camada.webm"), html: typeof body?.html === "string" ? body.html : "", duracao: typeof body?.duracao === "number" ? body.duracao : NaN, final: typeof body?.final === "string" ? body.final : undefined });
  }

  /**
   * O código de um bloco aberto no Chrome do render, sem fazer vídeo: problemas, o que muda entre
   * os instantes e os tweens, em texto curto (o agente vê o resultado sem gastar com imagem).
   * quadros=1 traz também o mosaico, em base64.
   */
  private async inspectCode(project: Project, url: URL): Promise<Response> {
    const p = url.searchParams;
    const instantes = (p.get("instantes") ?? "").split(",").filter(Boolean).map(Number);
    try {
      const r = await this.exports.inspectCode(project, { bloco: p.get("bloco") ?? "", instantes, quadros: p.get("quadros") === "1", final: p.get("final") ?? undefined });
      if (r === null) return falha(503, "render_indisponivel");
      if (typeof r === "string") return falha(400, r);
      return Response.json(r, { headers: { "cache-control": "private, no-store" } });
    } catch (err) {
      if (err instanceof RenderError) return falha(422, "render_falhou", { detalhe: err.message });
      return conteinerFalhou("Inspeção da animação", err);
    }
  }

  /** O WebM no projeto, com os erros do render em códigos para o agente. */
  /**
   * As vozes do HeyGen Avatar para o gerar_video: as prontas (o catálogo da HeyGen, com busca,
   * idioma e gênero, como o menu de vozes do site) e as clonadas da pessoa, com as dos avatares.
   */
  private async voices(user: User, url: URL): Promise<Response> {
    if (!this.studio || !canUse(HEYGEN_AVATAR, user)) return falha(404, "nao_encontrado");
    const structure = await this.studio.resolve(HEYGEN_AVATAR);
    const lists = await this.studio.lists(structure, user.id);
    const q = url.searchParams;
    const busca = (q.get("q") ?? "").trim().toLowerCase();
    const idioma = (q.get("idioma") ?? "").trim().toLowerCase();
    const genero = q.get("genero") === "feminina" ? "female" : q.get("genero") === "masculina" ? "male" : "";
    const limite = Math.min(100, Math.max(1, Number(q.get("limite")) || 30));
    // Sem o catálogo, as vozes de reserva, como no formulário do site.
    const prontas = (lists.voices?.length ? lists.voices : structure.platform === "heygen" ? DIRECT_VOICES : VOICES)
      .filter((v) => (!busca || v.name.toLowerCase().includes(busca)) && (!idioma || v.language.toLowerCase().includes(idioma)) && (!genero || v.gender === genero));
    return Response.json({
      prontas: prontas.slice(0, limite).map((v) => ({ id: v.value, nome: v.name, idioma: v.language, genero: v.gender === "female" ? "feminina" : v.gender === "male" ? "masculina" : null })),
      total: prontas.length,
      // Só a API direta da HeyGen clona voz; pelo OpenRouter, a lista fica vazia.
      clonadas: (lists.clones ?? []).filter((c) => !busca || c.label.toLowerCase().includes(busca)).map((c) => ({ id: c.value, nome: c.label, ...(lists.newClones?.includes(c.value) ? { clonarNoPrimeiroUso: true } : {}) })),
    });
  }

  /**
   * Gera um vídeo com o HeyGen Avatar (gasta créditos), como o formulário do modelo no site: a foto
   * é qualquer src de imagem que o projeto aceita (a foto de um ativo, um arquivo do projeto, uma
   * imagem gerada); a fala é o texto lido por uma voz de listar_vozes, ou um áudio (Meu áudio). O
   * formato padrão é o do Final. O vídeo leva minutos: a resposta traz o id para o acompanhar_video.
   */
  private async generateVideo(request: Request, user: User, project: Project): Promise<Response> {
    if (!this.studio) return falha(503, "criacao_pausada");
    if (!canUse(HEYGEN_AVATAR, user)) return falha(404, "nao_encontrado");
    const structure = await this.studio.resolve(HEYGEN_AVATAR);
    if (!this.studio.canGenerateWith(structure)) return falha(503, "criacao_pausada");
    const body = await json(request);
    const texto = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : "");
    const data = JSON.parse(project.data) as CanvasProject;
    const final = texto("final") ? data.finals.find((f) => f.id === body!.final) : data.finals[0];
    if (texto("final") && !final) return falha(400, "final_inexistente");
    if (!texto("foto")) return falha(400, "foto_obrigatoria");
    const direta = structure.platform === "heygen";
    if (texto("audio") && !direta) return falha(400, "audio_indisponivel");
    if (!texto("audio") && !texto("fala").trim()) return falha(400, "fala_obrigatoria");

    /** O arquivo de um src do projeto, se for de um desses tipos. */
    const arquivo = async (src: string, tipos: RegExp, nome: string): Promise<File | Response> => {
      let key: string;
      try {
        key = await this.exports.source(project, user, src);
      } catch (err) {
        if (err instanceof InputError) return falha(404, "arquivo_indisponivel", { src });
        throw err;
      }
      const object = await this.media.get(key);
      const type = object?.httpMetadata?.contentType ?? "";
      if (!object) return falha(404, "arquivo_indisponivel", { src });
      if (!tipos.test(type)) return falha(400, `${nome}_tipo_invalido`, { tipo: type });
      return new File([await object.arrayBuffer()], nome, { type });
    };
    const image = await arquivo(texto("foto"), /^image\/(jpeg|png|webp)$/, "foto");
    if (image instanceof Response) return image;
    const audio = texto("audio") ? await arquivo(texto("audio"), /^audio\/(mpeg|mp3|wav|x-wav|wave)$/, "audio") : null;
    if (audio instanceof Response) return audio;

    // A voz: com áudio, nenhuma; uma clonada da lista vai como "Voz clonada"; o resto, como voz pronta.
    const lists = await this.studio.lists(structure, user.id);
    const voz = texto("voz");
    const clonada = !audio && !!lists.clones?.some((c) => c.value === voz);
    const formato = texto("formato") || (final ? output(final).format : "9:16");
    const fields: Record<string, string> = {
      fonte: audio ? "audio" : clonada ? "clonada" : "pronta",
      voz: clonada ? "" : voz,
      clone: clonada ? voz : "",
      consentimento: body?.consentimento === true ? "sim" : "",
      fala: texto("fala"),
      expressividade: texto("expressividade") || "low",
      movimento: texto("movimento"),
      resolucao: texto("resolucao") || "720p",
      formato,
    };
    const values = (name: string) => fields[name] ?? "";
    const avatar = /^\/avatares\/([0-9a-f-]{36})\/arquivos\//.exec(texto("foto"))?.[1] ?? null;
    try {
      const v = await this.studio.create({ structure, values, image, audio, avatarId: avatar, user });
      if (v.status === "failed") return falha(502, "video_falhou", { id: v.id });
      // A API direta tem o próprio preço (HEYGEN_MODEL), como no formulário do site.
      const custo = estimate(structure, direta ? HEYGEN_MODEL : await this.studio.modelOf(structure), values);
      return Response.json(
        { video: { id: v.id, status: v.status, duracaoEstimada: v.duration || null, custoEstimado: custo !== undefined ? +custo.toFixed(2) : null, resolucao: v.resolution, formato: v.aspect_ratio } },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof ForbiddenError) return falha(404, "nao_encontrado");
      // Voz que não existe, fala longa, formato fora do modelo: a frase diz o que fazer.
      if (err instanceof InputError) return falha(400, "pedido_invalido", { motivo: err.message });
      throw err;
    }
  }

  /** O andamento de um vídeo gerado (acompanhar_video): consulta o provedor e, pronto, traz o src. */
  private async followVideo(user: User, id: string): Promise<Response> {
    const found = await this.db.conta(user.id).video(id);
    const structure = found && structureById(found.structure);
    if (!found || !structure || madeAtOnce(structure) || !canUse(structure, user)) return falha(404, "nao_encontrado");
    const v = this.studio ? await this.studio.sync(found) : found;
    const pronto = ready(v);
    // O áudio tratado no contêiner vem depois do vídeo pronto: até lá, o src é o original.
    const tratando = pronto && (v.audio_status === "pending" || v.audio_status === "processing");
    return Response.json({
      id: v.id,
      status: pronto ? "pronto" : v.status === "failed" ? "falhou" : "gerando",
      ...(pronto ? { src: `/videos/${v.id}.mp4`, duracao: await this.duration(v), usar: { video: v.id } } : {}),
      ...(tratando ? { audio: "tratando" } : {}),
      custo: v.cost,
    });
  }

  /**
   * Gera uma imagem com o modelo de imagem (gasta créditos) para entrar no projeto com
   * adicionar {imagem}. O formato padrão é o do Final; a referência é qualquer src que o projeto
   * aceita (ativo, arquivo do projeto, outra imagem gerada), desde que seja imagem. Com
   * `previa`, a resposta traz a imagem em base64, que o MCP mostra ao agente.
   */
  private async generateImage(request: Request, user: User, project: Project): Promise<Response> {
    if (!this.studio?.canGenerate) return falha(503, "criacao_pausada");
    const body = await json(request);
    const descricao = typeof body?.descricao === "string" ? body.descricao : "";
    if (!descricao.trim()) return falha(400, "descricao_obrigatoria");
    const data = JSON.parse(project.data) as CanvasProject;
    const final = typeof body?.final === "string" ? data.finals.find((f) => f.id === body.final) : data.finals[0];
    if (typeof body?.final === "string" && !final) return falha(400, "final_inexistente");
    const formato = typeof body?.formato === "string" ? body.formato : final ? output(final).format : "9:16";
    const resolucao = typeof body?.resolucao === "string" ? body.resolucao : "1K";
    let image: File | null = null;
    if (body?.referencia !== undefined) {
      let key: string;
      try {
        key = await this.exports.source(project, user, body.referencia);
      } catch (err) {
        if (err instanceof InputError) return falha(404, "arquivo_indisponivel");
        throw err;
      }
      const object = await this.media.get(key);
      const type = object?.httpMetadata?.contentType ?? "";
      if (!object) return falha(404, "arquivo_indisponivel");
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return falha(400, "referencia_nao_e_imagem");
      image = new File([await object.arrayBuffer()], "referencia", { type });
    }
    const values = (name: string) => ({ descricao, resolucao, formato })[name] ?? "";
    try {
      const v = await this.studio.waitImage(await this.studio.create({ structure: NANO_BANANA, values, image, user }));
      if (v.status !== "completed" || !v.video_key) return falha(502, "imagem_falhou", { id: v.id });
      const src = `/videos/${v.id}.${v.video_key.split(".").pop()}`;
      const resposta: Record<string, unknown> = { imagem: { id: v.id, src, resolucao: v.resolution, formato: v.aspect_ratio, custo: v.cost } };
      if (body?.previa === true) {
        const file = await this.media.get(v.video_key);
        if (file) {
          resposta.previa = base64(await file.arrayBuffer());
          resposta.previaTipo = file.httpMetadata?.contentType ?? "image/png";
        }
      }
      return Response.json(resposta, { status: 201 });
    } catch (err) {
      if (err instanceof ForbiddenError) return falha(404, "nao_encontrado");
      // Formato ou resolução que o modelo não aceita, descrição longa: a frase diz o que fazer.
      if (err instanceof InputError) return falha(400, "pedido_invalido", { motivo: err.message });
      throw err;
    }
  }

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
   * (ou do agente, corrigidas) e viram uma animação em código por cima do grupo, que a exportação
   * renderiza. Com bloco, troca o código de uma legenda que já existe. simular mostra os trechos
   * sem mexer no projeto.
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
          const t = await this.exports.transcribe(await this.exports.source(project, user, b.src));
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
    const html = legendaHtml(ts, estilo, width, height);
    // Legenda refeita depois de cortes: o mesmo bloco, com o código e o tempo novos.
    const comandos =
      typeof body?.bloco === "string"
        ? [
            { tipo: "editarCodigo", bloco: body.bloco, html },
            { tipo: "cortar", bloco: body.bloco, fim: duracao },
          ]
        : [{ tipo: "adicionar", html, duracao, sobre: g.id, em: 0, nome: typeof body?.nome === "string" && body.nome.trim() ? body.nome : "Legenda" }];
    return this.batch(user, project, body?.revisao, comandos, { legenda: resumo });
  }

  /** Um lote de comandos sobre uma revisão: tudo ou nada, e quem partiu de uma revisão velha lê de novo. */
  private async commands(request: Request, user: User, project: Project): Promise<Response> {
    const body = await json(request);
    if (!Array.isArray(body?.comandos) || !body.comandos.length || body.comandos.length > MAX_COMANDOS) return falha(400, "comandos_invalidos");
    return this.batch(user, project, body.revisao, body.comandos as Record<string, unknown>[]);
  }

  /** Aplica e salva um lote sobre a revisão lida; extra vai junto na resposta (a legenda manda as palavras). */
  private async batch(user: User, project: Project, revisao: unknown, comandos: Record<string, unknown>[], extra: Record<string, unknown> = {}): Promise<Response> {
    if (typeof revisao !== "number") return falha(400, "revisao_obrigatoria");
    if (revisao !== project.revision) return conflito(project);
    try {
      const memo = new Map<string, { duracao: number; silencios: number[][]; som: boolean }>();
      const anterior = JSON.parse(project.data) as CanvasProject;
      const antes = resumo(upgrade(anterior));
      const { project: data, criados } = await aplicar(anterior, comandos, {
        fonte: (c) => this.source(user, project, c),
        silencios: async (src) => {
          if (!memo.has(src)) memo.set(src, await this.silences(user, project, src));
          return memo.get(src)!;
        },
        rosto: (src) => this.face(user, src),
        animacao: async (projeto, bloco) => {
          // Só dos projetos de quem edita, como o resto da API.
          const o = projeto === project.id ? project : await this.db.projectById(projeto);
          const b = o && o.user_id === user.id ? (JSON.parse(o.data) as CanvasProject).blocks.find((x) => x.id === bloco) : undefined;
          return b?.code ? { html: b.code.html, params: b.code.params, escala: b.code.escala, fixa: b.code.fixa, duracao: +(b.tout - b.tin).toFixed(3), nome: b.name } : null;
        },
      });
      const text = JSON.stringify(data);
      if (text.length > MAX_BYTES) return falha(413, "projeto_grande_demais");
      const revision = await this.db.saveProject(project.id, { data: text }, revisao);
      if (revision === null) {
        const atual = await this.db.projectById(project.id);
        return atual ? conflito(atual) : falha(404, "nao_encontrado");
      }
      // Só o que o lote mudou: o projeto inteiro fica no ver_projeto (o maior gasto do agente).
      const { mudou, avisosPendentes } = mudancas(antes, resumo(data));
      const { notas, removidas } = notasMudadas(anterior, data);
      const removidos = removidas.length ? { removidos: { ...mudou.removidos, notas: removidas } } : {};
      return Response.json({ revisao: revision, criados, mudou: { ...mudou, ...(notas.length ? { notas } : {}), ...removidos }, avisosPendentes, ...extra });
    } catch (err) {
      if (err instanceof ComandoError) return falha(400, err.codigo, { comando: err.indice, ...err.extra });
      throw err;
    }
  }

  /** O arquivo de um bloco novo: um vídeo dela que ela pode usar, um ativo de um avatar dela ou um arquivo deste projeto. */
  private async source(user: User, project: Project, c: Record<string, unknown>): Promise<Fonte | null> {
    if (typeof c.ativo === "string") {
      const a = await this.db.assetOfUser(user.id, c.ativo);
      if (!a) return null;
      // O vídeo gerado tem a duração conhecida; o enviado, como o arquivo do projeto, pede dur.
      const video = a.source_video ? await this.db.conta(user.id).video(a.source_video) : null;
      return { src: assetSrc(a), kind: KINDS[a.kind], dur: video ? await this.duration(video) : null, name: a.name };
    }
    // A imagem do modelo de imagem (gerar_imagem): entra como bloco de imagem.
    if (typeof c.imagem === "string") {
      const v = await this.db.conta(user.id).video(c.imagem);
      const structure = v && structureById(v.structure);
      if (!v || !v.video_key || v.status !== "completed" || !structure || !makesImage(structure) || !canUse(structure, user)) return null;
      return { src: `/videos/${v.id}.${v.video_key.split(".").pop()}`, kind: "image", dur: null, name: v.name ?? (v.prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Imagem") };
    }
    // A fala de um modelo de voz: entra como bloco de som, com a duração do MP3.
    if (typeof c.audio === "string") {
      const v = await this.db.conta(user.id).video(c.audio);
      const structure = v && structureById(v.structure);
      if (!v || !v.video_key || v.status !== "completed" || !structure || !makesAudio(structure) || !canUse(structure, user)) return null;
      return { src: `/videos/${v.id}.mp3`, kind: "audio", dur: v.duration, name: v.name ?? (v.prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Áudio") };
    }
    if (typeof c.video === "string") {
      const v = await this.db.conta(user.id).video(c.video);
      const structure = v && structureById(v.structure);
      if (!v || !ready(v) || !structure || madeAtOnce(structure) || !canUse(structure, user)) return null;
      return { src: `/videos/${v.id}.mp4`, kind: "video", dur: await this.duration(v), name: v.name ?? (v.prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Vídeo") };
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
        const t = await this.exports.transcribe(await this.exports.source(project, user, src));
        return t ? Response.json(t) : falha(503, "transcricao_indisponivel");
      }
      const instants = (url.searchParams.get("instantes") ?? "").split(",").filter(Boolean).map(Number);
      if (!instants.length || instants.length > MAX_QUADROS || !instants.every((t) => Number.isFinite(t) && t >= 0)) return falha(400, "instantes_invalidos");
      const res = await this.exports.inspect(await this.exports.source(project, user, src), "/quadros", instants.join(","));
      return new Response(res.body, { headers: { "content-type": "image/jpeg", "content-length": res.headers.get("content-length")!, "cache-control": "private, no-store" } });
    } catch (err) {
      if (err instanceof InputError) return falha(404, "arquivo_indisponivel");
      if (err instanceof AudioLongoError) return falha(413, "audio_longo_demais");
      return conteinerFalhou(`Inspeção (${what})`, err);
    }
  }

  /** som: false é arquivo sem faixa de áudio (o WebM do render): não há silêncio a cortar. */
  private async silences(user: User, project: Project, src: string): Promise<{ duracao: number; silencios: number[][]; som: boolean }> {
    const res = await this.exports.inspect(await this.exports.source(project, user, src), "/silencios");
    return res.json();
  }

  /** O ponto entre os olhos (videos.face e avatar_assets.face): o guardado ou, ainda não procurado, o do contêiner agora. */
  private async face(user: User, src: string): Promise<{ x: number; y: number } | null> {
    const id = /^\/videos\/([0-9a-f-]{36})/.exec(src)?.[1];
    const asset = /^\/avatares\/[0-9a-f-]{36}\/arquivos\/([0-9a-f-]{36})$/.exec(src)?.[1];
    const video = id ? await this.db.conta(user.id).video(id) : null;
    const ativo = asset ? await this.db.assetOfUser(user.id, asset) : null;
    // Ainda não procurado (null): o contêiner procura agora, uma vez só (src/studio.ts, faceOnDemand).
    let face = video?.face ?? ativo?.face ?? null;
    if (face === null && this.studio && (video || ativo)) face = await this.studio.faceOnDemand(video ? { video } : { asset: ativo! });
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
