/**
 * API dos projetos (docs/api.md): o que um agente precisa para editar um projeto pelo
 * mesmo modelo da tela. Só o administrador, como o canvas; cada projeto é só de quem o
 * criou. Exportar e baixar usam as rotas do site, com o mesmo token.
 */
import { base, baseGaps, finalRate, groups, links, members, output, PX, upgrade, versionName, versions, width } from "./canvas/modelo.js";
import { ESTILO_PADRAO, type Estilo, falantes, html as legendaHtml, noGrupo, trechos } from "./legenda";
import type { CanvasProject } from "./canvas/modelo.js";
import { aplicar, ComandoError, type Fonte, MAX_COMANDOS } from "./comandos";
import { filtro, itemAtivo, itemProjeto, listar, pastaDe } from "./acervo";
import { MAX_FOLDERS } from "./db";
import type { AssetKind, Avatar, AvatarAsset, Db, Project, User, Video } from "./db";
import { type Exports } from "./exportar";
import { mp3Duration } from "./mp3";
import { mp4Duration } from "./mp4";
import { canUse, estimate, InputError, madeAtOnce, makesAudio, makesImage, prices, STRUCTURES, type Structure, structureById } from "./structures";
import { randomToken, sha256 } from "./auth";
import { HEYGEN_AVATAR, VOICES } from "./structures/heygen";
import { DIRECT_VOICES, HEYGEN_MODEL } from "./structures/heygen-direta";
import { criarEnvio, MAX_ATIVO, MAX_AVATAR_DESCRIPTION, receberAtivo, uso } from "./ativos";
import { MEDIA_TYPES, mediaType } from "./arquivos";
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

/** Os modelos de fala que a conta usa, para o agente saber o que pôr em modelo. */
const falas = (user: User) => STRUCTURES.filter((s) => makesAudio(s) && canUse(s, user)).map((s) => ({ id: s.id, nome: s.name }));
/** O que cada gerar_* faz: o tipo de arquivo que o modelo devolve. */
type Tipo = "video" | "imagem" | "audio";
const TIPOS: Tipo[] = ["video", "imagem", "audio"];
const tipoDe = (s: Structure): Tipo => (makesImage(s) ? "imagem" : makesAudio(s) ? "audio" : "video");
/** Os modelos do agente: os que têm descritor e a conta pode usar, de um tipo ou de todos. */
const modelosDoAgente = (user: User, tipo?: Tipo) => STRUCTURES.filter((s) => s.agent && canUse(s, user) && (!tipo || tipoDe(s) === tipo));
/** Os campos do pedido que não são do modelo (nem entram no código de confirmação). */
const CAMPOS_DO_PEDIDO = ["modelo", "confirmacao", "final", "previa"];
/** Por quanto tempo o sim da pessoa vale depois da simulação de um gerar_*. */
export const SIMULACAO_MIN = 20;
/** Os campos que, sem valor do agente, ficam com o padrão do formulário do site. */
const PADRAO = ["duracao", "resolucao", "formato", "estilo", "idioma", "expressividade"];
/** Como o modelo cobra: por segundo do vídeo, por caractere do texto ou por imagem. */
const COBRANCA = (s: Structure) => ("characters" in s.cost.seconds ? "caractere" : "fixed" in s.cost.seconds ? "imagem" : "segundo");

/** Os tipos de foto que os modelos recebem. */
const FOTO = /^image\/(jpeg|png|webp)$/;
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

/** As listas que têm pastas: a aba Vídeos, Projetos e os ativos de um avatar. */
const DE = ["videos", "projetos", "avatar"] as const;
type De = (typeof DE)[number];
/** Quantos itens o mover_para_pasta leva de uma vez. */
const MAX_MOVER = 100;

/** A resposta de um link de envio criado: o endereço, quando vence e o curl pronto, sem token. */
function envioCriado(url: URL, codigo: string, expira: string, tipoPedido: unknown): Response {
  const tipo = typeof tipoPedido === "string" && mediaType(tipoPedido) ? tipoPedido : "";
  const destino = `${url.origin}/envio/${codigo}`;
  return Response.json(
    {
      envio: {
        url: destino,
        metodo: "POST",
        expira,
        comando: `curl -sS --data-binary @"<caminho do arquivo>" -H "content-type: ${tipo || "<tipo, como audio/mpeg ou image/png>"}" ${destino}`,
        tipos: Object.keys(MEDIA_TYPES),
      },
    },
    { status: 201 },
  );
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
    grupos: gs.map((g) => {
      // A base é a trilha 0 de vídeo ou, num bloco só de som, a 0 de som (a fala em sequência).
      const main = base(g);
      return {
      id: g.id,
      nome: g.label,
      duracao: +g.dur.toFixed(3),
      blocos: members(g).map((b) => ({
        id: b.id,
        nome: b.name,
        tipo: b.draft ? "rascunho" : b.code ? "animacao" : TIPOS_DE_BLOCO[b.kind],
        camada: main.includes(b) ? "base" : g.covers.includes(b) ? "cobertura" : "audio",
        inicio: segundos(b.x - g.x),
        fim: segundos(b.x + width(b) - g.x),
        // O que som e velocidade mudaram, só quando saiu do padrão: o agente confere sem pedir o canvas inteiro.
        // O trecho do arquivo que o bloco usa, quando ele foi cortado (a imagem, o rascunho e a animação não têm arquivo a cortar).
        ...(b.kind !== "image" && (b.tin > 0.001 || b.tout < b.dur - 0.001) ? { corte: [+b.tin.toFixed(3), +b.tout.toFixed(3)] } : {}),
        ...(b.speed && b.speed !== 1 ? { velocidade: b.speed } : {}),
        ...(b.mute ? { mudo: true } : b.vol !== 1 && b.vol !== undefined ? { volume: b.vol } : {}),
      })),
      };
    }),
    // Cada ligação de grupo a grupo ou a um Final, com o id para remover (o primeiro bloco já vem ligado ao Final).
    ligacoes: links(data, gs).map((l) => ({ id: l.edge.id, de: l.from.id, para: typeof l.to === "string" ? l.to : l.to.id })),
    finais: data.finals.map((f) => {
      const { resolution, format } = output(f);
      const vs = versions(data, f.id);
      return { id: f.id, resolucao: resolution, formato: format, variacoes: vs.map((v, i) => ({ nome: versionName(i), grupos: v.map((g) => g.id), duracao: +(v.reduce((t, g) => t + g.dur, 0) / finalRate(f)).toFixed(3) })) };
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
    if (path === "/api/v1/avatares") return post ? this.createAvatar(request, user) : this.avatars(user, url);
    const av = /^\/api\/v1\/avatares\/([0-9a-f-]{36})(?:\/(arquivos|envio))?$/.exec(path);
    if (av) {
      const avatar = await this.db.avatarById(av[1]!);
      // Avatar de outra pessoa (ou que não existe): nada existe.
      if (!avatar || avatar.user_id !== user.id) return falha(404, "nao_encontrado");
      if (!post) return falha(405, "metodo_invalido");
      if (av[2] === "arquivos") return this.uploadAsset(request, avatar, url);
      if (av[2] === "envio") return this.uploadLink(request, user, avatar, url);
      return this.editAvatar(request, avatar);
    }
    if (path === "/api/v1/pastas") return post ? this.createFolder(request, user) : this.folders(user, url);
    if (path === "/api/v1/pastas/mover") return post ? this.moveToFolder(request, user) : falha(405, "metodo_invalido");
    if (path === "/api/v1/animacoes" && !post) return this.animations(user, url);
    if (path === "/api/v1/projetos") return post ? this.create(request, user) : this.list(user, url);
    if (path === "/api/v1/vozes" && !post) return this.voices(user, url);
    if (path === "/api/v1/modelos") return post ? falha(405, "metodo_invalido") : this.models(user, url);
    if (path === "/api/v1/audios") return post ? this.generate("audio", request, user, null) : falha(405, "metodo_invalido");
    const video = /^\/api\/v1\/videos\/([0-9a-f-]{36})$/.exec(path);
    if (video) return post ? falha(405, "metodo_invalido") : this.followVideo(user, video[1]!);
    const m = /^\/api\/v1\/projetos\/([0-9a-f-]{36})(?:\/(comandos|quadros|silencios|transcricao|html|legenda|limpar|animacao|imagem|video|cena|envio|apagar))?$/.exec(path);
    const project = m ? await this.db.projectById(m[1]!) : null;
    if (!m || !project || project.user_id !== user.id) return falha(404, "nao_encontrado");
    if (m[2] === "comandos") return post ? this.commands(request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "html") return post ? this.renderHtml(request, project) : falha(405, "metodo_invalido");
    if (m[2] === "legenda") return post ? this.caption(request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "limpar") return post ? this.cleanFiles(request, project) : falha(405, "metodo_invalido");
    if (m[2] === "envio") return post ? this.projectUploadLink(request, user, project, url) : falha(405, "metodo_invalido");
    if (m[2] === "apagar") return post ? this.deleteProject(request, project) : falha(405, "metodo_invalido");
    if (m[2] === "animacao") return post ? falha(405, "metodo_invalido") : this.inspectCode(project, url);
    if (m[2] === "imagem") return post ? this.generate("imagem", request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "video") return post ? this.generate("video", request, user, project) : falha(405, "metodo_invalido");
    if (m[2] === "cena") return post ? falha(405, "metodo_invalido") : this.scene(user, project, url);
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
        // O texto como sai na tela: com os valores dos parâmetros no lugar de {{chave}}.
        const texto = textoNaTela(b.code.html.replace(/\{\{\s*(\w+)\s*\}\}/g, (m: string, k: string) => String(b.code!.params?.[k] ?? m)));
        if (busca && !`${b.name} ${texto} ${Object.values(b.code.params ?? {}).join(" ")}`.toLowerCase().includes(busca)) continue;
        lista.push({ projeto: { id: o.id, nome: o.name }, bloco: b.id, nome: b.name, duracao: +(b.tout - b.tin).toFixed(3), texto, ...(b.code.params ? { parametros: b.code.params } : {}), avatares, atualizado: o.updated_at });
      }
    }
    return Response.json({ animacoes: lista.slice(0, limite), ...(lista.length > limite ? { mais: lista.length - limite } : {}) });
  }

  /** Cria um avatar (criar_avatar): só o nome e a descrição; os arquivos entram com o enviar_ativo. */
  private async createAvatar(request: Request, user: User): Promise<Response> {
    const body = await json(request);
    const name = typeof body?.nome === "string" ? body.nome.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!name) return falha(400, "nome_obrigatorio");
    const description = typeof body?.descricao === "string" ? body.descricao.trim().slice(0, MAX_AVATAR_DESCRIPTION) : "";
    const a = await this.db.insertAvatar({ id: crypto.randomUUID(), user_id: user.id, name, description });
    return Response.json({ avatar: { id: a.id, nome: a.name, descricao: a.description } }, { status: 201 });
  }

  /**
   * Muda o avatar (editar_avatar): nome, descrição e qual ativo enviado é a foto principal ou a voz
   * para clonagem ("" tira). A foto é uma imagem e a voz um áudio, ambos do próprio avatar.
   */
  private async editAvatar(request: Request, avatar: Avatar): Promise<Response> {
    const body = await json(request);
    if (!body) return falha(400, "json_invalido");
    const name = typeof body.nome === "string" ? body.nome.replace(/\s+/g, " ").trim().slice(0, 120) : avatar.name;
    if (!name) return falha(400, "nome_obrigatorio");
    const description = typeof body.descricao === "string" ? body.descricao.trim().slice(0, MAX_AVATAR_DESCRIPTION) : avatar.description;
    const papel = async (campo: "foto" | "voz", kind: AssetKind, atual: string | null): Promise<string | null | Response> => {
      const v = body[campo];
      if (v === undefined) return atual;
      if (v === "" || v === null) return null;
      const asset = typeof v === "string" ? await this.db.asset(avatar.id, v) : null;
      if (!asset) return falha(404, "ativo_inexistente", { campo });
      if (asset.kind !== kind || asset.source_video) return falha(400, "uso_invalido", { campo, precisa: `${kind} enviado ao avatar` });
      return asset.id;
    };
    const photo = await papel("foto", "imagem", avatar.photo_asset);
    if (photo instanceof Response) return photo;
    const voice = await papel("voz", "audio", avatar.voice_asset);
    if (voice instanceof Response) return voice;
    await this.db.updateAvatar(avatar.id, { name, description, photo_asset: photo, voice_asset: voice });
    return Response.json({ avatar: { id: avatar.id, nome: name, descricao: description, foto: photo, voz: voice } });
  }

  /** Recebe um arquivo para o avatar com o token (o enviar_ativo com url passa por aqui). */
  private async uploadAsset(request: Request, avatar: Avatar, url: URL): Promise<Response> {
    const papel = uso(url.searchParams.get("uso") ?? "");
    if (papel === null) return falha(400, "uso_invalido", { foto: "imagem", voz: "audio" });
    let name = "";
    try {
      name = decodeURIComponent(request.headers.get("x-nome") ?? "");
    } catch {
      name = "";
    }
    const pasta = await this.avatarFolder(avatar, url.searchParams.get("pasta"));
    if (pasta === false) return falha(404, "pasta_inexistente");
    const tipo = mediaType(request.headers.get("content-type") ?? "");
    if (tipo && Number(request.headers.get("content-length")) > MAX_ATIVO(tipo.kind)) return falha(413, "arquivo_grande_demais", { maximo: MAX_ATIVO(tipo.kind) });
    const r = await receberAtivo(this.db, this.media, avatar, { bytes: tipo ? await request.arrayBuffer() : new ArrayBuffer(0), type: request.headers.get("content-type") ?? "", name }, papel, pasta);
    if (typeof r !== "string") return falha(r.status, r.erro, r.extra);
    return this.assetResponse(avatar.id, r, url);
  }

  /** A pasta do avatar pedida pelo agente: o id, null sem pedido, ou false se ela não é deste avatar. */
  private async avatarFolder(avatar: Avatar, id: unknown): Promise<string | null | false> {
    if (id === undefined || id === null || id === "") return null;
    return (await this.db.folders(avatar.id)).find((f) => f.id === id)?.id ?? false;
  }

  /** O ativo recém-guardado, no mesmo item do listar_avatares. */
  private async assetResponse(avatarId: string, id: string, url: URL): Promise<Response> {
    const [avatar, asset, pastas] = await Promise.all([this.db.avatarById(avatarId), this.db.asset(avatarId, id), this.db.folders(avatarId)]);
    return Response.json({ ativo: { ...itemAtivo(asset!, avatar!.name, url, pastaDe(pastas)(asset!.folder_id)), origem: "enviado", foto: id === avatar!.photo_asset, voz: id === avatar!.voice_asset } }, { status: 201 });
  }

  /**
   * O link de envio (enviar_ativo sem url): o agente manda o arquivo do computador com um curl, sem
   * base64 e sem o token. Um arquivo, para este avatar, em até 30 min (src/ativos.ts).
   */
  private async uploadLink(request: Request, user: User, avatar: Avatar, url: URL): Promise<Response> {
    const body = (await json(request)) ?? {};
    const papel = uso(body.uso ?? "");
    if (papel === null) return falha(400, "uso_invalido", { foto: "imagem", voz: "audio" });
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    const pasta = await this.avatarFolder(avatar, body.pasta);
    if (pasta === false) return falha(404, "pasta_inexistente");
    const { codigo, expira } = await criarEnvio(this.media, user.id, { avatar: avatar.id, pasta }, nome, papel);
    return envioCriado(url, codigo, expira, body.tipo);
  }

  /**
   * O link de envio para o projeto (enviar_arquivo sem url nem base64): o arquivo do computador entra
   * nos arquivos deste projeto com um curl, sem token. Um arquivo, em até 30 min (src/ativos.ts).
   */
  private async projectUploadLink(request: Request, user: User, project: Project, url: URL): Promise<Response> {
    const body = (await json(request)) ?? {};
    const { codigo, expira } = await criarEnvio(this.media, user.id, { projeto: project.id }, nomeDoArquivo(body.nome, ""), "");
    return envioCriado(url, codigo, expira, body.tipo);
  }

  /**
   * Apaga o projeto (apagar_projeto), com os arquivos enviados a ele e as exportações; os vídeos
   * gerados e os ativos dos avatares ficam. Sem a confirmacao, só mostra o que sairia e devolve o
   * código: o agente leva isso à pessoa e só apaga com o sim dela. O código sai do projeto como está
   * (id, revisão e arquivos), sem nada guardado: não dá para apagar sem ter visto o primeiro passo,
   * nem um projeto que mudou depois dele. Durante uma exportação, recusa.
   */
  private async deleteProject(request: Request, project: Project): Promise<Response> {
    const body = await json(request);
    const data = JSON.parse(project.data) as CanvasProject;
    const arquivos = await this.db.projectFiles(project.id);
    const resumo = { id: project.id, nome: project.name, atualizado: project.updated_at, blocos: data.blocks.length, arquivos: arquivos.length, tamanho: arquivos.reduce((t, f) => t + f.size, 0) };
    const codigo = (await sha256(`apagar:${project.id}:${project.revision}:${arquivos.map((f) => f.id).sort().join(",")}`)).slice(0, 12);
    if (body?.confirmacao === undefined || body.confirmacao === null || body.confirmacao === "") {
      return Response.json({ projeto: resumo, apagado: false, confirmacao: codigo, proximo: "Mostre à pessoa o nome do projeto e o que sai com ele; só com o sim dela, chame de novo com a confirmacao. Não tem volta." });
    }
    if (body.confirmacao !== codigo) return falha(409, "confirmacao_invalida", { motivo: "O código não é o deste projeto como está agora. Chame sem confirmacao, mostre à pessoa e use o código novo." });
    if ((await this.db.runningExports(project.id)).length) return falha(409, "exportando");
    const keys = await this.db.deleteProject(project.id);
    if (keys.length) await this.media.delete(keys);
    return Response.json({ projeto: resumo, apagado: true });
  }

  /** As estruturas cujos vídeos a conta vê na aba Vídeos (a contagem das pastas é a da tela). */
  private structures(user: User): string[] {
    return STRUCTURES.filter((s) => canUse(s, user)).map((s) => s.id);
  }

  /**
   * As pastas da conta (listar_pastas): da aba Vídeos, de Projetos e dos ativos de cada avatar, cada
   * uma com quantos itens tem. `de` escolhe a lista; com `avatar`, só as dele.
   */
  private async folders(user: User, url: URL): Promise<Response> {
    const de = url.searchParams.get("de") ?? "";
    const avatarId = url.searchParams.get("avatar") ?? "";
    if (de && !DE.includes(de as De)) return falha(400, "de_invalido", { aceitos: DE });
    const conta = this.db.conta(user.id);
    const pastas: Record<string, unknown>[] = [];
    for (const kind of ["videos", "projetos"] as const) {
      if ((de && de !== kind) || avatarId) continue;
      const [lista, n] = await Promise.all([conta.folders(kind), conta.folderCounts(kind, kind === "videos" ? this.structures(user) : [])]);
      pastas.push(...lista.map((f) => ({ id: f.id, nome: f.name, de: kind, itens: n.get(f.id) ?? 0 })));
    }
    if (!de || de === "avatar") {
      const [avatares, lista, ativos] = await Promise.all([this.db.avatarsByUser(user.id), this.db.foldersByUser(user.id), this.db.assetsByUser(user.id)]);
      if (avatarId && !avatares.some((a) => a.id === avatarId)) return falha(404, "nao_encontrado");
      const nomes = new Map(avatares.map((a) => [a.id, a.name]));
      pastas.push(...lista.filter((f) => !avatarId || f.avatar_id === avatarId).map((f) => ({ id: f.id, nome: f.name, de: "avatar", avatar: { id: f.avatar_id, nome: nomes.get(f.avatar_id) ?? "" }, itens: ativos.filter((x) => x.folder_id === f.id).length })));
    }
    return Response.json({ pastas });
  }

  /** Cria uma pasta (criar_pasta) numa das listas: simples, sem pasta dentro de pasta, como no site. */
  private async createFolder(request: Request, user: User): Promise<Response> {
    const body = await json(request);
    const de = body?.de;
    if (typeof de !== "string" || !DE.includes(de as De)) return falha(400, "de_invalido", { aceitos: DE });
    const nome = typeof body?.nome === "string" ? body.nome.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!nome) return falha(400, "nome_obrigatorio");
    const id = crypto.randomUUID();
    if (de === "avatar") {
      const avatar = typeof body?.avatar === "string" ? await this.db.avatarById(body.avatar) : null;
      if (!avatar || avatar.user_id !== user.id) return falha(404, "nao_encontrado");
      if ((await this.db.folders(avatar.id)).length >= MAX_FOLDERS) return falha(409, "pastas_demais", { maximo: MAX_FOLDERS });
      await this.db.insertFolder({ id, avatar_id: avatar.id, name: nome });
      return Response.json({ pasta: { id, nome, de, avatar: { id: avatar.id, nome: avatar.name }, itens: 0 } }, { status: 201 });
    }
    if (!(await this.db.conta(user.id).insertFolder(id, de as "videos" | "projetos", nome, MAX_FOLDERS))) return falha(409, "pastas_demais", { maximo: MAX_FOLDERS });
    return Response.json({ pasta: { id, nome, de, itens: 0 } }, { status: 201 });
  }

  /**
   * Põe itens numa pasta da lista deles, ou fora de pasta (mover_para_pasta): vídeos, imagens e
   * áudios gerados numa pasta da aba Vídeos, projetos numa de Projetos e ativos numa do avatar
   * deles. A pasta tem de ser da mesma lista (e, nos ativos, do mesmo avatar); item de outra conta
   * não existe. Só muda onde o item aparece: nada é apagado nem copiado.
   */
  private async moveToFolder(request: Request, user: User): Promise<Response> {
    const body = await json(request);
    const de = body?.de;
    if (typeof de !== "string" || !DE.includes(de as De)) return falha(400, "de_invalido", { aceitos: DE });
    const itens = Array.isArray(body?.itens) ? [...new Set(body.itens.filter((i): i is string => typeof i === "string" && !!i))] : [];
    if (!itens.length || itens.length > MAX_MOVER) return falha(400, "itens_invalidos", { maximo: MAX_MOVER });
    const destino = typeof body?.pasta === "string" && body.pasta ? body.pasta : null;
    const conta = this.db.conta(user.id);
    const movidos: string[] = [];
    let pasta: { id: string; nome: string } | null = null;
    if (de === "avatar") {
      const avatar = typeof body?.avatar === "string" ? await this.db.avatarById(body.avatar) : null;
      if (!avatar || avatar.user_id !== user.id) return falha(404, "nao_encontrado");
      const alvo = destino ? (await this.db.folders(avatar.id)).find((f) => f.id === destino) : null;
      if (destino && !alvo) return falha(404, "pasta_inexistente");
      pasta = alvo ? { id: alvo.id, nome: alvo.name } : null;
      for (const id of itens) {
        if (!(await this.db.asset(avatar.id, id))) continue;
        await this.db.moveAsset(avatar.id, id, alvo?.id ?? null);
        movidos.push(id);
      }
    } else {
      const alvo = destino ? await conta.folder(destino) : null;
      // Pasta de outra conta, ou da outra lista, não serve de destino.
      if (destino && alvo?.kind !== de) return falha(404, "pasta_inexistente");
      pasta = alvo ? { id: alvo.id, nome: alvo.name } : null;
      for (const id of itens) if (de === "videos" ? await conta.moveVideo(id, alvo?.id ?? null) : await conta.moveProject(id, alvo?.id ?? null)) movidos.push(id);
    }
    const naoEncontrados = itens.filter((i) => !movidos.includes(i));
    if (!movidos.length) return falha(404, "itens_inexistentes", { naoEncontrados });
    return Response.json({ movidos, pasta, ...(naoEncontrados.length ? { naoEncontrados } : {}) });
  }

  private async avatars(user: User, url: URL): Promise<Response> {
    const [avatars, assets, folders] = await Promise.all([this.db.avatarsByUser(user.id, (url.searchParams.get("q") ?? "").trim()), this.db.assetsByUser(user.id), this.db.foldersByUser(user.id)]);
    const pasta = pastaDe(folders);
    return Response.json({
      avatares: avatars.map((a) => ({
        id: a.id,
        nome: a.name,
        descricao: a.description,
        // As pastas dos ativos dele (só quando há): cada ativo diz a sua em pasta.
        ...(folders.some((f) => f.avatar_id === a.id) ? { pastas: folders.filter((f) => f.avatar_id === a.id).map((f) => ({ id: f.id, nome: f.name })) } : {}),
        ativos: assets
          .filter((x) => x.avatar_id === a.id)
          .map((x) => ({ ...itemAtivo(x, a.name, url, pasta(x.folder_id)), origem: x.source_video ? "gerado" : "enviado", foto: x.id === a.photo_asset, voz: x.id === a.voice_asset })),
      })),
    });
  }

  private async list(user: User, url: URL): Promise<Response> {
    const [projects, folders] = await Promise.all([this.db.projectsByUser(user.id, (url.searchParams.get("q") ?? "").trim()), this.db.conta(user.id).folders("projetos")]);
    const pasta = pastaDe(folders);
    const so = url.searchParams.get("pasta") ?? "";
    if (so && !folders.some((f) => f.id === so)) return falha(404, "pasta_inexistente");
    return Response.json({
      projetos: projects.filter((p) => !so || p.folder_id === so).map((p) => ({ id: p.id, nome: p.name, revisao: p.revision, atualizado: p.updated_at, ...(pasta(p.folder_id) ? { pasta: pasta(p.folder_id) } : {}) })),
    });
  }

  private async create(request: Request, user: User): Promise<Response> {
    const body = await json(request);
    const name = typeof body?.nome === "string" ? body.nome.trim().slice(0, 120) : "";
    // Criado numa pasta de Projetos, o projeto fica nela (como na tela).
    const conta = this.db.conta(user.id);
    const pasta = typeof body?.pasta === "string" && body.pasta ? await conta.folder(body.pasta) : null;
    if (typeof body?.pasta === "string" && body.pasta && pasta?.kind !== "projetos") return falha(404, "pasta_inexistente");
    const project = await this.db.insertProject({ id: crypto.randomUUID(), user_id: user.id, name: name || "Projeto sem nome", data: VAZIO });
    if (pasta) await conta.moveProject(project.id, pasta.id);
    return Response.json({ ...(await this.view(project)), ...(pasta ? { pasta: { id: pasta.id, nome: pasta.name } } : {}) }, { status: 201 });
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
    // Qualquer exportação andando, não só a última: uma mais antiga ainda pode precisar do arquivo.
    if ((await this.db.runningExports(project.id)).length) return falha(409, "exportando");
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

  /**
   * As vozes do HeyGen Avatar para o gerar_video: as prontas (o catálogo da HeyGen, com busca,
   * idioma e gênero, como o menu de vozes do site) e as clonadas da pessoa, com as dos avatares.
   */
  private async voices(user: User, url: URL): Promise<Response> {
    const modelo = url.searchParams.get("modelo") ?? "";
    // Sem modelo padrão: as vozes são de um modelo, o mesmo que vai no gerar_video ou no gerar_audio.
    const comVoz = STRUCTURES.filter((x) => x.agent?.fields.voz && canUse(x, user)).map((x) => x.id);
    if (!modelo) return falha(400, "modelo_obrigatorio", { modelos: comVoz });
    if (modelo !== HEYGEN_AVATAR.id) return this.speechVoices(user, url, modelo);
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
   * As vozes de um modelo de fala (listar_vozes com modelo): as prontas, com a mesma busca, idioma e
   * gênero, e, no Fish, as clonadas da pessoa e a de cada avatar com gravação.
   */
  private async speechVoices(user: User, url: URL, modelo: string): Promise<Response> {
    const structure = structureById(modelo);
    if (!this.studio || !structure || !makesAudio(structure) || !canUse(structure, user)) return falha(404, "modelo_inexistente", { modelos: falas(user) });
    const { voices, lists } = await this.studio.speechVoices(structure, user.id);
    const q = url.searchParams;
    const busca = (q.get("q") ?? "").trim().toLowerCase();
    const idioma = (q.get("idioma") ?? "").trim().toLowerCase();
    const genero = q.get("genero") === "feminina" ? "female" : q.get("genero") === "masculina" ? "male" : "";
    const limite = Math.min(100, Math.max(1, Number(q.get("limite")) || 30));
    const prontas = voices.filter((v) => (!busca || v.name.toLowerCase().includes(busca)) && (!idioma || v.language.toLowerCase().includes(idioma)) && (!genero || v.gender === genero));
    return Response.json({
      prontas: prontas.slice(0, limite).map((v) => ({ id: v.value, nome: v.name, idioma: v.language, genero: v.gender === "female" ? "feminina" : v.gender === "male" ? "masculina" : null })),
      total: prontas.length,
      clonadas: (lists.clones ?? []).filter((c) => !busca || c.label.toLowerCase().includes(busca)).map((c) => ({ id: c.value, nome: c.label, ...(lists.newClones?.includes(c.value) ? { clonarNoPrimeiroUso: true } : {}) })),
    });
  }

  /**
   * Os modelos que o agente usa (listar_modelos): os que têm descritor (`agent`, src/structures/) e a
   * conta pode usar, de um tipo ou de todos. Cada um diz quando usar, os campos que aceita e, do
   * formulário do site, as durações, resoluções e formatos, com o preço.
   */
  private async models(user: User, url: URL): Promise<Response> {
    const tipo = url.searchParams.get("tipo") ?? "";
    if (tipo && !TIPOS.includes(tipo as Tipo)) return falha(400, "tipo_invalido", { tipos: TIPOS });
    const lista = [];
    for (const s of modelosDoAgente(user, (tipo as Tipo) || undefined)) {
      const opcoes: Record<string, unknown> = {};
      try {
        const resolved = this.studio ? await this.studio.resolve(s) : s;
        const model = resolved.platform === "heygen" ? HEYGEN_MODEL : this.studio ? await this.studio.modelOf(resolved) : null;
        const fields = resolved.sections(model, { duration: 5, resolution: "720p", aspectRatio: "9:16" }).flatMap((x) => x.fields);
        const op = (name: string) => {
          const f = fields.find((x) => x.name === name);
          return f && (f.kind === "select" || f.kind === "segmented") ? f.options.map((o) => o.value) : undefined;
        };
        const nomes: Record<string, string> = { duracao: "duracoes", resolucao: "resolucoes", formato: "formatos" };
        for (const [campo, nome] of Object.entries(nomes)) if (s.agent!.fields[campo] && op(campo)) opcoes[nome] = op(campo);
        if (model) opcoes.preco = { por: COBRANCA(resolved), dolares: prices(resolved, model) };
      } catch (err) {
        // Sem a lista do provedor, o modelo aparece sem as opções; o pedido confere de novo.
        console.error("Opções do modelo indisponíveis", s.id, err);
      }
      lista.push({ id: s.id, nome: s.name, tipo: tipoDe(s), usar: s.agent!.use, campos: s.agent!.fields, obrigatorios: s.agent!.required, ...opcoes });
    }
    return Response.json({ modelos: lista });
  }

  /**
   * Gera com o modelo escolhido (gerar_video, gerar_imagem, gerar_audio), em dois passos, para a
   * pessoa ver o custo antes: sem `confirmacao`, só simula (confere tudo pela estrutura, como o
   * site, sem gastar) e devolve o custo estimado e o código de confirmação; com o código, gera. O
   * código é sorteado e fica guardado (só o hash) com o pedido e o custo: vale para o mesmo
   * pedido, uma vez, por SIMULACAO_MIN minutos e enquanto o custo for o que a pessoa viu;
   * qualquer campo diferente, o reenvio ou o prazo vencido pedem outra simulação. Não há modelo
   * padrão. Os arquivos (foto, ultimoQuadro, referencias, audio) são src do projeto.
   */
  private async generate(tipo: Tipo, request: Request, user: User, project: Project | null): Promise<Response> {
    const body = ((await json(request)) ?? {}) as Record<string, unknown>;
    const texto = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
    const modelos = modelosDoAgente(user, tipo).map((s) => s.id);
    // Conta sem nenhum modelo do tipo: nada existe, como a página de um modelo em teste.
    if (!modelos.length) return falha(404, "nao_encontrado");
    if (!texto("modelo")) return falha(400, "modelo_obrigatorio", { modelos });
    const structure = structureById(texto("modelo"));
    if (!structure?.agent || !canUse(structure, user) || tipoDe(structure) !== tipo) return falha(404, "modelo_inexistente", { modelos });
    const spec = structure.agent;
    if (!this.studio) return falha(503, "criacao_pausada");
    const resolved = await this.studio.resolve(structure);
    if (!this.studio.canGenerateWith(resolved)) return falha(503, "criacao_pausada");

    const pedido = Object.fromEntries(Object.entries(body).filter(([k, v]) => !CAMPOS_DO_PEDIDO.includes(k) && v !== undefined && v !== null && !(typeof v === "string" && !v.trim())));
    // O áudio próprio só vai onde o formulário do modelo, na plataforma em uso, tem o campo.
    const direta = resolved.platform === "heygen";
    const model = direta ? HEYGEN_MODEL : await this.studio.modelOf(resolved);
    const lists = await this.studio.lists(resolved, user.id);
    const formulario = resolved.sections(model, { duration: 5, resolution: "720p", aspectRatio: texto("formato") || "9:16" }, lists).flatMap((s) => s.fields);
    const recusados = Object.keys(pedido).filter((k) => !(k in spec.fields) || (k === "audio" && !formulario.some((f) => f.kind === "audio")));
    if (recusados.length) return falha(400, "campo_nao_aceito", { campos: recusados, aceitos: Object.keys(spec.fields) });
    const faltam = spec.required.filter((k) => !(k in pedido));
    if (faltam.length) return falha(400, "campo_obrigatorio", { campos: faltam });

    let formato = texto("formato");
    if (project) {
      const data = JSON.parse(project.data) as CanvasProject;
      const final = texto("final") ? data.finals.find((f) => f.id === body.final) : data.finals[0];
      if (texto("final") && !final) return falha(400, "final_inexistente");
      // Sem Final, o formato padrão dos projetos (9:16).
      formato ||= final ? output(final).format : "9:16";
    }

    // Os arquivos: a foto (ou a primeira referência) vai como imagem; o resto, como o modelo pede.
    const referencias = Array.isArray(pedido.referencias) ? (pedido.referencias as unknown[]).filter((r): r is string => typeof r === "string" && r !== "") : [];
    if (referencias.length && (texto("foto") || texto("ultimoQuadro"))) return falha(400, "quadros_ou_referencias");
    if (spec.maxReferences && referencias.length > spec.maxReferences) return falha(400, "referencias_demais", { maximo: spec.maxReferences });
    const arquivo = async (src: string, tipos: RegExp, nome: string) => (src && project ? this.projectFile(project, user, src, tipos, nome) : null);
    const imagens: File[] = [];
    for (const src of referencias) {
      const f = await arquivo(src, FOTO, "referencia");
      if (f instanceof Response) return f;
      if (f) imagens.push(f);
    }
    const foto = await arquivo(texto("foto"), FOTO, "foto");
    if (foto instanceof Response) return foto;
    const ultimo = await arquivo(texto("ultimoQuadro"), FOTO, "ultimoQuadro");
    if (ultimo instanceof Response) return ultimo;
    const audio = await arquivo(texto("audio"), /^audio\/(mpeg|mp3|wav|x-wav|wave)$/, "audio");
    if (audio instanceof Response) return audio;
    const [primeira = null, ...references] = imagens;

    // Os campos de texto viram o formulário; o que faltar fica com o padrão do formulário do site.
    const valores = spec.values({ ...pedido, ...(formato ? { formato } : {}) }, lists);
    const padroes = Object.fromEntries(
      resolved
        .sections(model, { duration: 5, resolution: "720p", aspectRatio: formato || "9:16" }, lists)
        .flatMap((s) => s.fields)
        .filter((f) => PADRAO.includes(f.name) && "value" in f)
        .map((f) => [f.name, (f as { value: string }).value]),
    );
    const values = (name: string) => valores[name] || padroes[name] || "";
    const avatar = /^\/avatares\/([0-9a-f-]{36})\/arquivos\//.exec(texto("foto") || referencias[0] || "")?.[1] ?? null;
    const input = { structure: resolved, values, image: foto ?? primeira, references, lastFrame: ultimo, audio, avatarId: avatar, user };
    const resumo = await sha256(JSON.stringify([user.id, tipo, project?.id ?? null, texto("modelo"), texto("final"), Object.keys(pedido).sort().map((k) => [k, pedido[k]])]));
    const centavos = (custo: number | undefined) => (custo !== undefined ? +custo.toFixed(4) : null);

    try {
      if (body.confirmacao === undefined) {
        const { built } = await this.studio.check(input);
        const custo = estimate(resolved, model, values);
        const r = built.record;
        const codigo = randomToken().slice(0, 16);
        const agora = Date.now();
        await this.db.addSimulacao(await sha256(codigo), user.id, resumo, centavos(custo), new Date(agora).toISOString(), new Date(agora + SIMULACAO_MIN * 60_000).toISOString());
        return Response.json({
          simulacao: true,
          modelo: structure.id,
          custoEstimado: centavos(custo),
          ...(tipo === "video" ? { duracao: r.duration || null, resolucao: r.resolution, formato: r.aspect_ratio } : tipo === "imagem" ? { resolucao: r.resolution, formato: r.aspect_ratio } : {}),
          confirmacao: codigo,
          validade: `${SIMULACAO_MIN} min`,
          proximo: "Mostre o modelo, o pedido e o custo à pessoa. Com o sim dela, chame de novo com os mesmos campos e confirmacao; sem o sim, não gere. O código gera uma vez só.",
        });
      }
      // O código sai do banco aqui, antes de gerar: reenviado, não gera nem cobra de novo.
      const simulada = typeof body.confirmacao === "string" && body.confirmacao ? await this.db.useSimulacao(await sha256(body.confirmacao), user.id, resumo, new Date().toISOString()) : null;
      const invalida = (motivo: string) => falha(409, "confirmacao_invalida", { motivo });
      if (!simulada) return invalida(`O código vale para o mesmo pedido, uma vez, por ${SIMULACAO_MIN} min: simule de novo (sem confirmacao) e confirme com a pessoa.`);
      // O preço mudou depois do sim: a pessoa vê o custo novo antes de gerar.
      if (simulada.custo !== centavos(estimate(resolved, model, values))) return invalida("O custo mudou desde a simulação: simule de novo (sem confirmacao) e confirme com a pessoa.");

      const v = await this.studio.create(input);
      if (tipo === "video") {
        if (v.status === "failed") return falha(502, "video_falhou", { id: v.id });
        const custo = estimate(resolved, model, values);
        return Response.json(
          { video: { id: v.id, modelo: structure.id, status: v.status, duracaoEstimada: v.duration || null, custoEstimado: custo !== undefined ? +custo.toFixed(2) : null, resolucao: v.resolution, formato: v.aspect_ratio } },
          { status: 201 },
        );
      }
      const pronto = await this.studio.waitImage(v);
      if (pronto.status !== "completed" || !pronto.video_key) return falha(502, tipo === "imagem" ? "imagem_falhou" : "audio_falhou", { id: pronto.id });
      const src = `/videos/${pronto.id}.${pronto.video_key.split(".").pop()}`;
      if (tipo === "audio") {
        const settings = JSON.parse(pronto.settings ?? "{}") as Record<string, string>;
        return Response.json(
          { audio: { id: pronto.id, src, duracao: await this.duration(pronto), custo: pronto.cost, modelo: structure.id, voz: settings.voice ?? null, ...(settings.source === "clonada" ? { clonada: true } : {}) }, usar: { audio: pronto.id } },
          { status: 201 },
        );
      }
      const resposta: Record<string, unknown> = { imagem: { id: pronto.id, src, modelo: structure.id, resolucao: pronto.resolution, formato: pronto.aspect_ratio, custo: pronto.cost } };
      if (body.previa === true) {
        const file = await this.media.get(pronto.video_key);
        if (file) {
          resposta.previa = base64(await file.arrayBuffer());
          resposta.previaTipo = file.httpMetadata?.contentType ?? "image/png";
        }
      }
      return Response.json(resposta, { status: 201 });
    } catch (err) {
      if (err instanceof ForbiddenError) return falha(404, "nao_encontrado");
      // Voz que não existe, texto longo, duração ou formato fora do modelo: a frase diz o que fazer.
      if (err instanceof InputError) return falha(400, "pedido_invalido", { motivo: err.message });
      throw err;
    }
  }

  /** O arquivo de um src do projeto, se for de um desses tipos; senão, a resposta de erro. */
  private async projectFile(project: Project, user: User, src: string, tipos: RegExp, nome: string): Promise<File | Response> {
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
      return { src: `/videos/${v.id}.mp3`, kind: "audio", dur: await this.duration(v), name: v.name ?? (nomeDaFala(v.prompt) || "Áudio") };
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

  /**
   * Quadros de uma cena montada como na exportação, com todas as camadas (ver_cena), sem exportar o vídeo. Os
   * instantes são segundos do grupo, como os de ver_projeto. A primeira vez monta o trecho no servidor (202,
   * montando): é o mesmo que a exportação depois reaproveita.
   */
  private async scene(user: User, project: Project, url: URL): Promise<Response> {
    const data = upgrade(JSON.parse(project.data) as CanvasProject);
    const p = url.searchParams;
    const final = p.get("final") ? data.finals.find((f) => f.id === p.get("final")) : data.finals[0];
    if (!final) return falha(404, "final_inexistente");
    const grupo = groups(data).find((g) => members(g).some((b) => b.id === p.get("grupo")));
    if (!grupo) return falha(404, "grupo_inexistente");
    const instants = (p.get("instantes") ?? "").split(",").filter(Boolean).map(Number);
    if (!instants.length || instants.length > MAX_QUADROS || !instants.every((t) => Number.isFinite(t) && t >= 0 && t < grupo.dur)) return falha(400, "instantes_invalidos", { duracao: +grupo.dur.toFixed(3) });
    try {
      const r = await this.exports.scene(project, user, final.id, grupo.id);
      if ("exportacao" in r) {
        const e = r.exportacao;
        if (e.status === "failed") return falha(502, "cena_falhou");
        return Response.json({ status: "montando", feitos: e.step, total: e.total, aviso: "A cena está sendo montada no servidor. Chame de novo em uns 20 s." }, { status: 202 });
      }
      // Os segundos do grupo, na velocidade do Final: o tempo do trecho.
      const rate = finalRate(final);
      const noTrecho = instants.map((t) => Math.min(+(t / rate).toFixed(3), Math.max(0, r.duracao - 0.04)));
      const res = await this.exports.inspect(r.trecho, "/quadros", noTrecho.join(","));
      return new Response(res.body, { headers: { "content-type": "image/jpeg", "content-length": res.headers.get("content-length")!, "cache-control": "private, no-store" } });
    } catch (err) {
      if (err instanceof InputError) return falha(400, "cena_invalida", { motivo: err.message });
      return conteinerFalhou("Cena", err);
    }
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

  /**
   * A duração do arquivo que vale (o tratado ou o original), que pode diferir da pedida ao modelo. A da fala
   * fica guardada em segundos inteiros: o bloco usa a do MP3, para não passar do fim do arquivo.
   */
  private async duration(v: Video): Promise<number> {
    const key = v.processed_key ?? v.video_key!;
    const object = await this.media.get(key);
    if (!object) return v.duration;
    if (object.size > MAX_LEITURA) {
      await object.body.cancel();
      return v.duration;
    }
    const lida = (key.endsWith(".mp3") ? mp3Duration : mp4Duration)(await object.arrayBuffer());
    return lida ? +lida.toFixed(3) : v.duration;
  }
}

const ready = (v: Video) => v.status === "completed" && !!v.video_key;

/** O nome do bloco de uma fala sem nome: as primeiras palavras, sem as emoções ("[serious]"). */
const nomeDaFala = (fala: string) => fala.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).slice(0, 6).join(" ");

async function json(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
