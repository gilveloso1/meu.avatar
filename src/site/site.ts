/**
 * O estúdio: páginas em HTML montado no Worker, com CSS e um script pequeno
 * embutidos (o mesmo jeito do blog do anb.bot), no Material Design 3.
 *
 *   /cadastro    cria a primeira conta, que é a do administrador; depois fecha
 *   /entrar      login (e-mail e senha)
 *   /sair        encerra a sessão (POST)
 *   /              os modelos, um cartão por estrutura (src/structures/)
 *   /videos        os vídeos de todos os modelos, com filtro por status
 *   /modelo/<id>   a página do modelo em três painéis: a configuração, o vídeo
 *                  escolhido (?video=<id>) com a caixa da fala, e os vídeos
 *                  dele; o POST gera o vídeo
 *
 * Tudo pede sessão, menos /midia/avatares/..., que o provedor de vídeo precisa
 * baixar. Segurança como no painel do estuda.mais: cookie __Host- (HttpOnly,
 * Secure, SameSite=Strict), todo POST precisa vir do próprio site (cabeçalho
 * Origin), páginas sem cache e sem abrir dentro de outros sites, e o script
 * da página só roda com o nonce da CSP.
 */
import { type Accounts, PASSWORD_MAX, PASSWORD_MIN, SESSION_DAYS } from "../auth";
import type { Db, User, Video, VideoStatus } from "../db";
import type { VideoModel } from "../openrouter";
import { styleById } from "../prompt";
import { CAMERAS, DEFAULT_CAMERA, DEFAULT_PAUSE, PAUSES, parsePlan, RULES } from "../quickedit";
import { canUse, type Defaults, estimate, type Field, lowestPrice, type Section, STRUCTURES, structureById, type Structure, type Values } from "../structures";
import { ForbiddenError, InputError, MAX_IMAGE_BYTES, type Studio } from "../studio";
import { CSS } from "./style";
import { DARK, LIGHT } from "./theme";

export interface SiteConfig {
  /** Padrões do formulário (wrangler.jsonc). */
  defaults: Defaults;
}

const SITE_NAME = "Meu Avatar";
export const SESSION_COOKIE = "__Host-sessao";
/** Enquanto há vídeo na fila, a página confere de novo a cada tantos segundos. */
const REFRESH_SECONDS = 20;

/** Ícones usados (Material Symbols); a fonte só baixa esses. */
const ICONS = [
  "add", "add_photo_alternate", "arrow_drop_down", "arrow_upward", "check", "check_circle", "close", "content_cut", "download", "error", "face", "graphic_eq", "grid_view", "left_panel_close", "left_panel_open", "more_vert", "right_panel_close", "right_panel_open",
  "edit", "hourglass_top", "info", "lock", "logout", "movie", "pause", "person_add", "play_arrow", "record_voice_over", "schedule", "search", "send", "subdirectory_arrow_right",
  "videocam", "view_list",
];

/** Falas prontas da página do modelo sem vídeos: um clique põe o texto na caixa da fala. */
const IDEAS = [
  { label: "Apresentação", text: "Oi! Eu sou [SEU NOME] e aqui você vai encontrar [O QUE VOCÊ FAZ]." },
  { label: "Oferta", text: "Só hoje: [PRODUTO] com [DESCONTO]. Corre que é por tempo limitado!" },
  { label: "Convite", text: "Hoje tem live às [HORÁRIO]. Ative o lembrete e venha conversar comigo." },
];

/** Filtros da página de vídeos: o grupo de status (cardStatus) que cada um mostra. */
const FILTERS = [
  { id: "", label: "Todos", kind: null },
  { id: "prontos", label: "Prontos", kind: "done" },
  { id: "andamento", label: "Em andamento", kind: "busy" },
  { id: "erro", label: "Com erro", kind: "error" },
] as const;

const SURFACE_LIGHT = /--md-sys-color-surface: (#\w+)/.exec(LIGHT)![1];
const SURFACE_DARK = /--md-sys-color-surface: (#\w+)/.exec(DARK)![1];

const STATUS: Record<VideoStatus, { label: string; icon: string; kind: "busy" | "done" | "error" }> = {
  submitting: { label: "Enviando", icon: "send", kind: "busy" },
  pending: { label: "Na fila", icon: "schedule", kind: "busy" },
  in_progress: { label: "Gerando", icon: "hourglass_top", kind: "busy" },
  completed: { label: "Pronto", icon: "check_circle", kind: "done" },
  failed: { label: "Falhou", icon: "error", kind: "error" },
  cancelled: { label: "Cancelado", icon: "error", kind: "error" },
  expired: { label: "Expirou", icon: "error", kind: "error" },
};

export class Site {
  constructor(
    private readonly db: Db,
    private readonly media: R2Bucket,
    private readonly studio: Studio,
    private readonly accounts: Accounts,
    private readonly config: SiteConfig,
  ) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const post = request.method === "POST";
    if (!post && request.method !== "GET" && request.method !== "HEAD") return new Response("método não permitido", { status: 405 });

    // A foto do avatar é baixada pelo provedor de vídeo, sem login.
    if (!post && path.startsWith("/midia/avatares/")) {
      return this.object(request, path.slice("/midia/".length), "public, max-age=86400");
    }

    // Formulário de outro site tentando agir em nome de quem está logado.
    if (post && !sameSite(request, url)) return new Response("forbidden", { status: 403 });

    if (path === "/cadastro") return post ? this.signup(request) : this.signupPage();
    if (path === "/entrar") {
      if (post) return this.login(request);
      return (await this.accounts.signupOpen()) ? redirect("/cadastro") : html(loginPage());
    }

    const token = sessionToken(request);
    if (path === "/sair" && post) {
      await this.accounts.logout(token);
      return redirect("/entrar", clearCookie());
    }
    const user = await this.accounts.session(token);
    if (!user) return redirect("/entrar");

    if (!post && path === "/") return this.home(user, url);
    if (!post && path === "/videos") return this.videosPage(user, url);
    // Endereços da versão anterior.
    if (!post && path === "/novo") return redirect("/");
    const old = /^\/novo\/([a-z0-9-]+)$/.exec(path);
    if (!post && old) return redirect(`/modelo/${old[1]}`);

    const model = /^\/modelo\/([a-z0-9-]+)$/.exec(path);
    if (model) {
      // Estrutura que não existe ou que a pessoa não pode usar: a página nem aparece.
      const structure = structureById(model[1]);
      if (!structure || !canUse(structure, user.role)) return new Response("não encontrado", { status: 404 });
      return post
        ? this.createVideo(request, user, structure)
        : this.modelPage(user, structure, url.searchParams.get("video"), undefined, undefined, url.searchParams.has("original"));
    }

    const quickEdit = /^\/videos\/([0-9a-f-]{36})\/edicao-rapida$/.exec(path);
    if (post && quickEdit) return this.quickEdit(request, user, quickEdit[1]!);

    // /videos/<id>.mp4: o áudio tratado, se já houver; /videos/<id>.original.mp4: como veio do modelo;
    // /videos/<id>.editado.mp4: a edição rápida.
    const file = /^\/videos\/([0-9a-f-]{36})(?:\.(original|editado))?\.mp4$/.exec(path);
    if (request.method === "GET" && file) {
      const video = await this.db.videoById(file[1]!);
      const version = file[2];
      const key = version === "original" ? video?.video_key : version === "editado" ? video?.edited_key : (video?.processed_key ?? video?.video_key);
      if (!video || !key) return new Response("não encontrado", { status: 404 });
      const name = `meu-avatar-${video.id.slice(0, 8)}${version ? `-${version}` : ""}.mp4`;
      return this.object(request, key, "private, max-age=86400", url.searchParams.has("baixar") ? name : undefined);
    }

    return new Response("não encontrado", { status: 404 });
  }

  /** Tela inicial: um card por estrutura que a pessoa pode usar; a busca filtra pelo nome. */
  private async home(user: User, url: URL): Promise<Response> {
    const q = (url.searchParams.get("q") ?? "").trim();
    const counts = await this.db.countByStructure();
    const structures = STRUCTURES.filter((s) => canUse(s, user.role) && s.name.toLowerCase().includes(q.toLowerCase()));
    const cards = structures.map((s, i) => {
      const n = counts.get(s.id) ?? 0;
      return tileCard({
        href: `/modelo/${s.id}`,
        tile: `<span class="icon-tile icon-tile--large icon-tile--${MODEL_TONES[i % MODEL_TONES.length]}" aria-hidden="true"><span class="icon">${esc(s.icon)}</span></span>`,
        badge: s.access === "admin" ? { label: "Em teste", title: "Em teste: só o administrador vê" } : undefined,
        headline: s.name,
        supporting: n === 1 ? "1 vídeo" : `${n} vídeos`,
        menu: [
          { label: "Criar vídeo", icon: "add", href: `/modelo/${s.id}` },
          { label: "Ver os vídeos", icon: "movie", href: `/videos?modelo=${s.id}` },
        ],
      });
    });
    const body = `
<main class="page" id="conteudo">
  <div class="page__head">
    <div>
      <h1 class="page__headline">Modelos</h1>
      <p class="page__intro">Escolha um modelo para criar vídeos e ver os que ele já fez.</p>
    </div>
  </div>
  ${cards.length ? `<div class="tile-grid">${cards.join("")}</div>` : emptyState("search", "Nenhum modelo encontrado", `Nada com “${q}” no nome.`)}
</main>`;
    return html(page(SITE_NAME, body, { bar: { user, tab: "modelos", search: { action: "/", label: "Pesquisar modelos", q } } }));
  }

  /** Os vídeos de todos os modelos que a pessoa pode usar, com filtro por status, busca pela fala e grade ou lista. */
  private async videosPage(user: User, url: URL): Promise<Response> {
    const q = (url.searchParams.get("q") ?? "").trim();
    const filter = FILTERS.find((f) => f.id === url.searchParams.get("status")) ?? FILTERS[0];
    const list = url.searchParams.get("ver") === "lista";
    // ?modelo= (do menu do card do modelo) só restringe; nunca mostra modelo que a pessoa não pode usar.
    const only = url.searchParams.get("modelo") ?? "";
    const usable = STRUCTURES.filter((s) => canUse(s, user.role) && (!only || s.id === only));
    const all = await this.db.videosByStructures(usable.map((s) => s.id), q);
    const videos = all.filter((v) => !filter.kind || cardStatus(v).kind === filter.kind);
    const waiting = videos.some((v) => cardStatus(v).kind === "busy");
    const keep = { q, status: filter.id, ver: list ? "lista" : "", modelo: only };
    // Os links da página guardam os outros parâmetros: trocar o filtro não perde a busca nem a vista.
    const link = (changes: Record<string, string>) => {
      const params = new URLSearchParams({ ...keep, ...changes });
      for (const [k, v] of [...params]) if (!v) params.delete(k);
      const s = params.toString();
      return `/videos${s ? `?${s}` : ""}`;
    };
    const chips = FILTERS.map(
      (f) =>
        `<a class="chip interactive" href="${esc(link({ status: f.id }))}"${f === filter ? ' aria-current="true"' : ""}>${f === filter ? '<span class="icon">check</span>' : ""}${esc(f.label)}</a>`,
    ).join("");
    const items = videos.map((v) => {
      const structure = structureById(v.structure)!;
      const status = cardStatus(v);
      const meta = [formatDate(v.created_at), structure.name, durationLabel(v, structure)].join(" · ");
      const href = `/modelo/${structure.id}?video=${v.id}`;
      if (list) {
        return `<a class="list-row interactive" href="${href}">${statusTile(status)}<span class="list-row__headline">${esc(v.prompt)}</span><span class="list-row__supporting">${esc(`${status.label} · ${meta}`)}</span></a>`;
      }
      return tileCard({
        href,
        tile: statusTile(status, true),
        headline: v.prompt,
        supporting: meta,
        hidden: `${status.label} · `,
        menu: [
          { label: "Abrir", icon: "play_arrow", href },
          ...(v.video_key ? [{ label: "Baixar MP4", icon: "download", href: `/videos/${v.id}.mp4?baixar`, download: true }] : []),
        ],
      });
    });
    const empty = q || filter.id || only ? emptyState("search", "Nenhum vídeo encontrado", "Tente outro filtro ou outra busca.") : emptyState("movie", "Nenhum vídeo ainda", "Escolha um modelo para gerar o primeiro.");
    const body = `
<main class="page" id="conteudo">
  <div class="page__head">
    <h1 class="page__headline">${only && usable[0] ? `Vídeos · ${esc(usable[0].name)}` : "Vídeos"}</h1>
    <a class="fab fab--extended interactive" href="/"><span class="icon">add</span>Novo vídeo</a>
  </div>
  <nav class="chip-set" aria-label="Filtrar por status">${chips}</nav>
  ${!items.length ? empty : list ? `<div class="list-box">${items.join("")}</div>` : `<div class="tile-grid">${items.join("")}</div>`}
</main>`;
    const view = `<nav class="view-toggle" aria-label="Visualização">
      <a class="view-toggle__option interactive" href="${esc(link({ ver: "" }))}"${list ? "" : ' aria-current="true"'} aria-label="Grade" title="Grade"><span class="icon">grid_view</span></a>
      <a class="view-toggle__option interactive" href="${esc(link({ ver: "lista" }))}"${list ? ' aria-current="true"' : ""} aria-label="Lista" title="Lista"><span class="icon">view_list</span></a>
    </nav>`;
    return html(
      page(`Vídeos · ${SITE_NAME}`, body, {
        refresh: waiting,
        bar: { user, tab: "videos", search: { action: "/videos", label: "Pesquisar pela fala", q, keep: { status: filter.id, ver: keep.ver, modelo: only } }, extra: view },
      }),
    );
  }

  /**
   * A página do modelo em três painéis: a configuração do vídeo à esquerda, o
   * vídeo escolhido e a caixa da fala no centro, e os vídeos do modelo à
   * direita; os painéis dos lados se recolhem. Sem `?video=`, fica o mais novo;
   * sem vídeos, a apresentação do modelo e as falas prontas.
   */
  private async modelPage(user: User, structure: Structure, selectedId: string | null, values?: Values, error?: string, showOriginal = false): Promise<Response> {
    const { model, error: modelError } = await this.tryModel(structure);
    const banner = modelError ?? (this.studio.canGenerate ? null : "Falta a chave do OpenRouter (segredo OPENROUTER_API_KEY): dá para ver os vídeos, mas não gerar novos.");
    const sections = structure.sections(model, this.config.defaults);
    const value = values ?? defaultValues(sections);
    const cost = model ? estimate(structure, model, value) : undefined;
    const config = {
      prices: model?.pricing_skus ?? {},
      sku: structure.cost.sku,
      seconds: structure.cost.seconds,
      rate: structure.wordsPerSecond,
    };
    const seconds = "field" in structure.cost.seconds ? `${value(structure.cost.seconds.field)} s` : "—";
    const videos = await this.db.videosByStructure(structure.id);
    // Só vale um vídeo deste modelo: o id de outro não abre nada aqui.
    const selected = videos.find((v) => v.id === selectedId) ?? videos[0];
    const waiting = videos.some((v) => cardStatus(v).kind === "busy");

    // A fala vai na caixa do centro; a foto abre o painel; o resto segue as seções da estrutura.
    const fields = sections.flatMap((s) => s.fields);
    const speech = fields.find((f): f is Extract<Field, { kind: "textarea" }> => f.kind === "textarea");
    const images = fields.filter((f) => f.kind === "image");
    const rest = sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f.kind !== "textarea" && f.kind !== "image") })).filter((s) => s.fields.length);
    const price = model ? lowestPrice(model) : undefined;
    const tone = MODEL_TONES[STRUCTURES.indexOf(structure) % MODEL_TONES.length];

    const intro = `
      <div class="model-intro">
        <span class="icon-tile icon-tile--hero icon-tile--${tone}" aria-hidden="true"><span class="icon">${esc(structure.icon)}</span></span>
        <h2 class="model-intro__headline">${esc(structure.name)}</h2>
        <p class="model-intro__supporting">${esc([structure.model.replace(/\/.*/, ""), price !== undefined ? `a partir de US$ ${price.toFixed(2)}/s` : null, "nenhum vídeo ainda"].filter(Boolean).join(" · "))}</p>
        <p class="model-intro__text">${esc(structure.summary)}</p>
      </div>
      <section class="ideas" aria-labelledby="ideias">
        <h3 class="ideas__title" id="ideias">Comece por uma fala pronta</h3>
        <div class="ideas__grid">${IDEAS.map(
          (i) =>
            `<button class="idea interactive" type="button" data-fill="${esc(i.text)}"><span class="idea__label">${esc(i.label)}</span><span class="idea__text">${esc(i.text)}</span><span class="icon" aria-hidden="true">subdirectory_arrow_right</span></button>`,
        ).join("")}</div>
      </section>`;

    const body = `
<main class="workspace" id="conteudo">
  <form class="workspace__form" method="post" action="/modelo/${structure.id}" enctype="multipart/form-data" data-composer='${esc(JSON.stringify(config))}'>
    <section class="pane pane--config" aria-labelledby="configuracao" data-pane="config">
      ${paneHead("configuracao", "Configuração", "left")}
      <div class="pane__body" id="configuracao-corpo">
        ${images.map((f) => formField(f, value)).join("")}
        ${rest.map((section) => formSection(section, value)).join("")}
      </div>
    </section>
    <div class="workspace__main">
      ${banner ? `<p class="banner" role="status"><span class="icon">error</span>${esc(banner)}</p>` : ""}
      ${selected ? selectedVideo(selected, structure, showOriginal) : intro}
      ${speech ? composerBar(speech, value, seconds, cost, Boolean(model)) : ""}
    </div>
  </form>
  <section class="pane pane--videos" aria-labelledby="videos" data-pane="videos">
    ${paneHead("videos", `Vídeos <span class="pane__count">${videos.length}</span>`, "right")}
    <div class="pane__body" id="videos-corpo">
    ${
      videos.length
        ? `<nav class="pane-list" aria-label="Vídeos de ${esc(structure.name)}">${videos
            .map((v) => {
              const status = cardStatus(v);
              const current = v === selected ? ' aria-current="true"' : "";
              return `<a class="pane-list__item interactive" href="/modelo/${structure.id}?video=${v.id}"${current}>${statusTile(status)}<span class="pane-list__text"><span class="pane-list__headline">${esc(v.prompt)}</span><span class="pane-list__supporting">${esc([status.label, formatDate(v.created_at), durationLabel(v, structure)].join(" · "))}</span></span></a>`;
            })
            .join("")}</nav>`
        : `<div class="pane-empty"><span class="icon">videocam</span><p class="pane-empty__title">Os vídeos gerados aparecem aqui.</p><p>Escolha a foto e os ajustes, escreva a fala embaixo e toque na seta para gerar.</p></div>`
    }
    </div>
  </section>
</main>
${selected ? videoDialog(selected, structure) : ""}
${selected && canQuickEdit(selected, structure) ? `<form id="edicao-rapida" method="post" action="/videos/${selected.id}/edicao-rapida" hidden></form>` : ""}
${error ? snackbar(error) : ""}`;
    return html(page(`${structure.name} · ${SITE_NAME}`, body, { refresh: waiting, footer: false, bar: { user, back: "/", title: structure.name } }), error ? 400 : 200);
  }

  /** "Gerar vídeo editado", na prévia da edição rápida: põe o vídeo na fila do contêiner e volta para ele. */
  private async quickEdit(request: Request, user: User, id: string): Promise<Response> {
    const video = await this.db.videoById(id);
    const structure = video ? structureById(video.structure) : undefined;
    if (!video || !structure) return new Response("não encontrado", { status: 404 });
    const form = await request.formData();
    const field = (name: string) => String(form.get(name) ?? "");
    try {
      const plan = parsePlan(field("pausa") || DEFAULT_PAUSE, field("camera") || DEFAULT_CAMERA, field("trechos"));
      await this.studio.requestQuickEdit(video, user, plan);
    } catch (err) {
      if (err instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
      if (!(err instanceof InputError)) throw err;
      return this.modelPage(user, structure, video.id, undefined, err.message);
    }
    return redirect(`/modelo/${structure.id}?video=${video.id}`);
  }

  private async tryModel(structure: Structure): Promise<{ model: VideoModel | null; error: string | null }> {
    if (!this.studio.canGenerate) return { model: null, error: null };
    try {
      return { model: await this.studio.model(structure.model), error: null };
    } catch (err) {
      return { model: null, error: `Não deu para ler o modelo ${structure.model}: ${err instanceof Error ? err.message : err}` };
    }
  }

  private async createVideo(request: Request, user: User, structure: Structure): Promise<Response> {
    const form = await request.formData();
    const image = form.get("imagem");
    const { model } = await this.tryModel(structure);
    const values = formValues(form, structure.sections(model, this.config.defaults));
    let video: Video;
    try {
      video = await this.studio.create({ structure, values, image: image instanceof File ? image : null, user });
    } catch (err) {
      if (err instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
      if (!(err instanceof InputError)) throw err;
      return this.modelPage(user, structure, null, values, err.message);
    }
    return redirect(`/modelo/${structure.id}?video=${video.id}`);
  }

  private async login(request: Request): Promise<Response> {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const result = await this.accounts.login(email, String(form.get("senha") ?? ""));
    if (result.ok) return redirect("/", sessionCookie(result.token));
    if (result.reason === "locked") {
      return html(loginPage(`Muitas tentativas erradas. A conta fica bloqueada até ${formatDate(result.until)}.`, email), 400);
    }
    return html(loginPage("E-mail ou senha não conferem.", email), 400);
  }

  private async signupPage(error?: string, values: { name?: string; email?: string } = {}): Promise<Response> {
    if (!(await this.accounts.signupOpen())) return html(closedPage(), 403);
    return html(signupPage(error, values), error ? 400 : 200);
  }

  private async signup(request: Request): Promise<Response> {
    const form = await request.formData();
    const name = String(form.get("nome") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("senha") ?? "");
    if (password !== String(form.get("confirmar") ?? "")) return this.signupPage("As senhas não são iguais.", { name, email });
    const result = await this.accounts.signupFirst(name, email, password);
    if ("error" in result) return this.signupPage(result.error, { name, email });
    return redirect("/", sessionCookie(result.token));
  }

  /** Arquivo do R2, com suporte a Range (o player de vídeo pede pedaços). */
  private async object(request: Request, key: string, cache: string, downloadName?: string): Promise<Response> {
    const object = await this.media.get(key, { range: request.headers, onlyIf: request.headers });
    if (!object) return new Response("não encontrado", { status: 404 });
    const headers = new Headers({ "cache-control": cache, "accept-ranges": "bytes", etag: object.httpEtag });
    object.writeHttpMetadata(headers);
    if (downloadName) headers.set("content-disposition", `attachment; filename="${downloadName}"`);
    if (!("body" in object)) return new Response(null, { status: 304, headers });
    const r = object.range as { offset?: number; length?: number } | undefined;
    if (request.headers.has("range") && r) {
      const offset = r.offset ?? 0;
      const length = r.length ?? object.size - offset;
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      return new Response(object.body, { status: 206, headers });
    }
    return new Response(object.body, { headers });
  }
}

/** O que o cartão mostra: o status do vídeo e, depois de pronto, o do tratamento do áudio e o da edição rápida. */
function cardStatus(v: Video, now = Date.now()): { label: string; icon: string; kind: "busy" | "done" | "error" } {
  const minutes = (iso: string | null) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0);
  if (v.status === "completed" && (v.audio_status === "pending" || v.audio_status === "processing")) {
    const since = minutes(v.audio_status === "processing" ? v.audio_started_at : v.updated_at);
    return { label: `Tratando áudio · ${since} min`, icon: "graphic_eq", kind: "busy" };
  }
  if (v.status === "completed" && (v.edit_status === "pending" || v.edit_status === "processing")) {
    const since = minutes(v.edit_status === "processing" ? v.edit_started_at : v.updated_at);
    return { label: `Editando · ${since} min`, icon: "content_cut", kind: "busy" };
  }
  const status = STATUS[v.status];
  // Na fila: quanto tempo já passou, para não parecer travado (720p leva uns 10 min).
  return status.kind === "busy" ? { ...status, label: `${status.label} · ${minutes(v.created_at)} min` } : status;
}

/** Cor do ícone de cada modelo, na ordem dos cards. */
const MODEL_TONES = ["primary", "tertiary", "secondary"] as const;

/** Ícone num contêiner tonal, na cor do grupo de status: pronto, na fila, áudio ou edição, ou erro. */
function statusTile(status: ReturnType<typeof cardStatus>, large = false): string {
  const tone = status.kind === "done" ? "primary" : status.kind === "error" ? "error" : status.icon === "graphic_eq" || status.icon === "content_cut" ? "tertiary" : "secondary";
  return `<span class="icon-tile${large ? " icon-tile--large" : ""} icon-tile--${tone}" aria-hidden="true"><span class="icon">${status.kind === "done" ? "play_arrow" : status.icon}</span></span>`;
}

interface MenuItem {
  label: string;
  icon: string;
  href: string;
  download?: boolean;
}

/** Menu do M3 aberto por um botão de ícone (três pontos); fecha ao escolher ou ao tocar fora (SCRIPT). */
function overflowMenu(label: string, items: MenuItem[]): string {
  return `<details class="menu" data-menu>
      <summary class="icon-button interactive" aria-label="${esc(label)}" title="Mais opções"><span class="icon">more_vert</span></summary>
      <div class="menu__list">${items
        .map((i) => `<a class="menu__item interactive" href="${esc(i.href)}"${i.download ? " download" : ""}><span class="icon">${i.icon}</span>${esc(i.label)}</a>`)
        .join("")}</div>
    </details>`;
}

/**
 * Card da grade (modelos e vídeos): o ícone em cima, à esquerda, com o menu à
 * direita, e o título e a linha de apoio embaixo. O card inteiro é o link; o
 * menu fica por cima dele.
 */
function tileCard(c: { href: string; tile: string; headline: string; supporting: string; hidden?: string; badge?: { label: string; title: string }; menu: MenuItem[] }): string {
  return `
    <article class="tile-card">
      <div class="tile-card__top">
        ${c.tile}
        ${c.badge ? `<span class="badge-chip" title="${esc(c.badge.title)}">${esc(c.badge.label)}</span>` : ""}
        ${overflowMenu(`Mais opções: ${c.headline}`, c.menu)}
      </div>
      <a class="tile-card__link" href="${c.href}"><span class="tile-card__headline">${esc(c.headline)}</span></a>
      <p class="tile-card__supporting">${c.hidden ? `<span class="visually-hidden">${esc(c.hidden)}</span>` : ""}${esc(c.supporting)}</p>
    </article>`;
}

/** Título do painel lateral com o botão de recolher (o painel da esquerda recolhe para a esquerda, o da direita para a direita). */
function paneHead(id: string, title: string, side: "left" | "right"): string {
  return `<div class="pane__head">
        <h2 class="pane__headline" id="${id}">${title}</h2>
        <button class="icon-button interactive pane__toggle" type="button" data-pane-toggle="${side}" aria-controls="${id}-corpo" aria-expanded="true" aria-label="Recolher o painel" title="Recolher o painel"><span class="icon">${side}_panel_close</span></button>
      </div>`;
}

/** O vídeo escolhido, no centro da página do modelo: o player (ou o andamento, ou o erro), a fala e as ações. */
function selectedVideo(v: Video, structure: Structure, showOriginal: boolean): string {
  const status = cardStatus(v);
  // Com a edição rápida pronta, o player mostra a editada; "Ver original" troca.
  const edited = Boolean(v.edited_key) && !showOriginal;
  const src = edited ? `/videos/${v.id}.editado.mp4` : videoSrc(v);
  const quick = canQuickEdit(v, structure);
  const media = v.video_key
    ? `<div class="player" style="--ratio:${esc(v.aspect_ratio.replace(":", " / "))}"${quick ? " data-player" : ""}><div class="player__frame"><video controls preload="metadata" playsinline src="${src}"></video>${
        quick
          ? `<div class="player__controls" data-qe-controls hidden><button class="icon-button interactive" type="button" data-qe-play aria-label="Tocar a prévia" title="Tocar a prévia"><span class="icon">play_arrow</span></button><span class="player__time" data-qe-time></span></div>`
          : ""
      }</div></div>`
    : status.kind === "error"
      ? `<div class="stage stage--error"><span class="icon">error</span><p class="stage__title">${esc(status.label)}</p>${v.error ? `<p class="stage__text">${esc(v.error)}</p>` : ""}</div>`
      : `<div class="stage"><span class="icon">${status.icon}</span><p class="stage__title">${esc(status.label)}</p><div class="linear-progress" role="progressbar" aria-label="${esc(status.label)}"></div><p class="stage__text">Leva alguns minutos. A página se atualiza sozinha.</p></div>`;
  const meta = [status.label, formatDate(v.created_at), durationLabel(v, structure), v.resolution, v.aspect_ratio].join(" · ");
  return `
      <section class="selected" aria-label="Vídeo escolhido">
        ${media}
        <div class="selected__body">
          <p class="selected__meta">${esc(meta)}</p>
          <p class="selected__text">${esc(v.prompt)}</p>
        </div>
        <div class="selected__actions">
          ${v.video_key ? `<a class="button button--text interactive" href="${edited ? `/videos/${v.id}.editado.mp4` : `/videos/${v.id}.mp4`}?baixar" download><span class="icon">download</span>Baixar MP4</a>` : ""}
          ${quick ? `<button class="button button--text interactive" type="button" data-qe-open><span class="icon">content_cut</span>Edição rápida</button>` : ""}
          ${v.edited_key ? `<a class="button button--text interactive" href="/modelo/${structure.id}?video=${v.id}${edited ? "&amp;original" : ""}"><span class="icon">movie</span>${edited ? "Ver original" : "Ver editado"}</a>` : ""}
          <button class="button button--text interactive" type="button" data-fill="${esc(v.prompt)}"><span class="icon">edit</span>Usar esta fala</button>
          <button class="button button--text interactive" type="button" data-dialog-open="detalhes-${v.id}"><span class="icon">info</span>Detalhes</button>
        </div>
        ${quick ? quickEditPreview(v) : ""}
      </section>`;
}

/**
 * Prévia da edição rápida, aberta pelo botão: o player toca o vídeo pulando as
 * pausas e com o zoom de cada trecho; pausas e câmera mudam a prévia na hora.
 * "Gerar vídeo editado" manda os trechos para o contêiner (formulário
 * #edicao-rapida, fora do formulário da fala).
 */
function quickEditPreview(v: Video): string {
  const config = {
    src: videoSrc(v),
    rules: RULES,
    pauses: Object.fromEntries(PAUSES.map((p) => [p.value, p.pad])),
    cameras: Object.fromEntries(CAMERAS.map((c) => [c.value, c.zooms])),
  };
  return `<section class="quick-edit" data-quick-edit='${esc(JSON.stringify(config))}' hidden aria-labelledby="edicao-rapida-titulo">
          <div class="quick-edit__head">
            <h2 class="quick-edit__title" id="edicao-rapida-titulo">Edição rápida</h2>
            <p class="quick-edit__summary" data-qe-summary role="status"></p>
          </div>
          <div class="quick-edit__fields">
            ${segmented("pausa", "Pausas", PAUSES, DEFAULT_PAUSE, "edicao-rapida")}
            ${segmented("camera", "Câmera", CAMERAS, DEFAULT_CAMERA, "edicao-rapida")}
          </div>
          <input type="hidden" name="trechos" form="edicao-rapida" data-qe-parts>
          <div class="quick-edit__actions">
            <button class="button button--text interactive" type="button" data-qe-close>Cancelar</button>
            <button class="button button--filled interactive" type="submit" form="edicao-rapida"><span class="icon">content_cut</span>Gerar vídeo editado</button>
          </div>
        </section>`;
}

/**
 * O botão "Edição rápida" aparece no vídeo pronto da estrutura que tem edição,
 * quando nem ela nem o tratamento do áudio estão na fila (editado, dá para refazer).
 */
function canQuickEdit(v: Video, structure: Structure): boolean {
  return (
    structure.quickEdit &&
    v.status === "completed" &&
    Boolean(v.video_key) &&
    v.edit_status !== "pending" &&
    v.edit_status !== "processing" &&
    v.audio_status !== "pending" &&
    v.audio_status !== "processing"
  );
}

/** Escolha única em botão segmentado; `form` liga os botões a um formulário de fora. */
function segmented(name: string, label: string, options: { value: string; label: string }[], selected: string, form?: string): string {
  const owner = form ? ` form="${form}"` : "";
  return `<fieldset class="segmented-field">
          <legend class="segmented-field__label">${esc(label)}</legend>
          <div class="segmented-button">${options
            .map(
              (o) => `<label class="segmented-button__segment interactive"><input type="radio" name="${name}" value="${esc(o.value)}"${owner}${o.value === selected ? " checked" : ""}><span class="icon segmented-button__check" aria-hidden="true">check</span><span>${esc(o.label)}</span></label>`,
            )
            .join("")}</div>
        </fieldset>`;
}

/** A caixa da fala, embaixo do centro: o campo, a duração e o custo estimados e o botão de gerar. */
function composerBar(f: Extract<Field, { kind: "textarea" }>, value: Values, seconds: string, cost: number | undefined, enabled: boolean): string {
  return `
      <div class="composer-bar">
        <div class="composer-bar__box">
          <textarea class="composer-bar__input" id="${f.name}" name="${f.name}" rows="2" required maxlength="${f.maxLength}" placeholder="${esc(f.placeholder)}" aria-label="${esc(f.label)}" aria-describedby="${f.name}-ajuda"${f.speech ? " data-speech" : ""}>${esc(value(f.name))}</textarea>
          <span class="composer-bar__meta"><span data-seconds>${esc(seconds)}</span> · <span data-cost>${cost !== undefined ? `US$ ${cost.toFixed(2)}` : "—"}</span></span>
          <button class="composer-bar__send interactive" type="submit"${enabled ? "" : " disabled"} aria-label="Gerar vídeo" title="Gerar vídeo"><span class="icon">arrow_upward</span></button>
        </div>
        <p class="text-field__supporting" id="${f.name}-ajuda"><span${f.speech ? ` data-words data-default="${esc(f.supporting)}"` : ""}>${esc(f.supporting)}</span><span data-count>${value(f.name).length}/${f.maxLength}</span></p>
        <p class="composer-bar__note">Vídeos gerados com inteligência artificial pelo OpenRouter. Confira antes de publicar.</p>
      </div>`;
}

function emptyState(icon: string, title: string, text: string): string {
  return `<div class="empty"><span class="icon">${icon}</span><p class="empty__title">${esc(title)}</p><p>${esc(text)}</p></div>`;
}

/**
 * "Detalhes": o vídeo maior e tudo sobre ele, organizado em seções. Diálogo
 * básico do M3 nas telas médias e maiores; diálogo de tela cheia no celular.
 */
function videoDialog(v: Video, structure: Structure): string {
  const status = cardStatus(v);
  const details = [
    ...structure.details(v),
    { term: "Duração", description: durationLabel(v, structure) },
    { term: "Resolução", description: v.resolution },
    { term: "Formato", description: v.aspect_ratio },
    { term: "Custo", description: v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : "—" },
    { term: "Criado em", description: formatDate(v.created_at) },
    { term: "Modelo", description: v.model },
  ];
  const errors = [
    v.error,
    v.audio_status === "failed" ? `Áudio não tratado: ${v.audio_error ?? "erro desconhecido"}` : null,
    v.edit_status === "failed" ? `Edição rápida falhou: ${v.edit_error ?? "erro desconhecido"}` : null,
  ].filter((e): e is string => Boolean(e));
  return `
<dialog class="dialog" id="detalhes-${v.id}" aria-labelledby="detalhes-${v.id}-titulo">
  <div class="dialog__header">
    <button class="icon-button interactive dialog__close" type="button" aria-label="Fechar" data-dialog-close><span class="icon">close</span></button>
    <h2 class="dialog__headline" id="detalhes-${v.id}-titulo">${esc(structure.name)} · ${esc(formatDate(v.created_at))}</h2>
  </div>
  <div class="dialog__content">
    ${v.video_key ? `<video class="dialog__video" controls preload="none" playsinline src="${videoSrc(v)}" style="--ratio:${esc(v.aspect_ratio.replace(":", " / "))}"></video>` : ""}
    <p class="status-line status-line--${status.kind}"><span class="icon">${status.icon}</span>${esc(status.label)}</p>
    ${errors.map((e) => `<p class="dialog__error">${esc(e)}</p>`).join("")}
    <section class="dialog__section">
      <h3 class="dialog__title">Fala</h3>
      <p class="dialog__text">${esc(v.prompt)}</p>
    </section>
    <section class="dialog__section">
      <h3 class="dialog__title">Configurações</h3>
      <dl class="details">${details.map((d) => `<div class="details__item"><dt>${esc(d.term)}</dt><dd>${esc(d.description)}</dd></div>`).join("")}</dl>
    </section>
    ${
      v.request_prompt && v.request_prompt !== v.prompt
        ? `<details class="dialog__section dialog__prompt"><summary class="dialog__title interactive">Prompt enviado ao modelo</summary><p class="dialog__text">${esc(v.request_prompt)}</p></details>`
        : ""
    }
    ${
      v.video_key
        ? `<section class="dialog__section">
      <h3 class="dialog__title">Arquivos</h3>
      <div class="dialog__files">
        <a class="button button--tonal interactive" href="/videos/${v.id}.mp4?baixar" download><span class="icon">download</span>${v.processed_key ? "Baixar com áudio tratado" : "Baixar MP4"}</a>
        ${v.edited_key ? `<a class="button button--outlined interactive" href="/videos/${v.id}.editado.mp4?baixar" download><span class="icon">download</span>Editado</a>` : ""}
        ${v.processed_key ? `<a class="button button--outlined interactive" href="/videos/${v.id}.original.mp4?baixar" download><span class="icon">download</span>Original</a>` : ""}
      </div>
    </section>`
        : ""
    }
  </div>
  <div class="dialog__actions">
    <button class="button button--text interactive" type="button" data-dialog-close>Fechar</button>
  </div>
</dialog>`;
}

function videoSrc(v: Video): string {
  return `/videos/${v.id}.mp4${v.processed_key ? "?tratado" : ""}`;
}

/** A duração do HeyGen segue a fala: até o vídeo ficar pronto, é uma estimativa. */
function durationLabel(v: Video, structure: Structure): string {
  return "field" in structure.cost.seconds ? `${v.duration} s` : `≈ ${v.duration} s`;
}

/** Uma seção do formulário: título e campos. */
function formSection(section: Section, value: Values): string {
  return `<section class="form-section">
        <h2 class="form-section__title">${esc(section.title)}</h2>
        ${section.fields.map((f) => formField(f, value)).join("")}
      </section>`;
}

function formField(f: Field, value: Values): string {
  switch (f.kind) {
    case "textarea":
      return `<div class="text-field">
          <textarea class="text-field__input" id="${f.name}" name="${f.name}" required maxlength="${f.maxLength}" placeholder="${esc(f.placeholder)}" aria-describedby="${f.name}-ajuda"${f.speech ? " data-speech" : ""}>${esc(value(f.name))}</textarea>
          <label class="text-field__label" for="${f.name}">${esc(f.label)}</label>
          <p class="text-field__supporting" id="${f.name}-ajuda"><span${f.speech ? ` data-words data-default="${esc(f.supporting)}"` : ""}>${esc(f.supporting)}</span><span data-count>${value(f.name).length}/${f.maxLength}</span></p>
        </div>`;
    case "text":
      return `<div class="text-field">
          <input class="text-field__input" id="${f.name}" name="${f.name}" type="text" maxlength="${f.maxLength}" placeholder="${esc(f.placeholder)}" aria-describedby="${f.name}-ajuda" value="${esc(value(f.name))}">
          <label class="text-field__label" for="${f.name}">${esc(f.label)}</label>
          <p class="text-field__supporting" id="${f.name}-ajuda"><span>${esc(f.supporting)}</span></p>
        </div>`;
    case "select": {
      const selected = value(f.name);
      const description = f.options.find((o) => o.value === selected)?.description;
      const supporting = description !== undefined ? `<span data-description-for="${f.name}">${esc(description)}</span>` : f.supporting ? `<span>${esc(f.supporting)}</span>` : "";
      return `<div class="text-field text-field--select">
          <select class="text-field__input" id="${f.name}" name="${f.name}"${supporting ? ` aria-describedby="${f.name}-ajuda"` : ""}>${f.options
            .map((o) => `<option value="${esc(o.value)}"${o.value === selected ? " selected" : ""}${o.description ? ` data-description="${esc(o.description)}"` : ""}>${esc(o.label)}</option>`)
            .join("")}</select>
          <label class="text-field__label" for="${f.name}">${esc(f.label)}</label>
          <span class="icon text-field__trailing" aria-hidden="true">arrow_drop_down</span>
          ${supporting ? `<p class="text-field__supporting" id="${f.name}-ajuda">${supporting}</p>` : ""}
        </div>`;
    }
    case "segmented":
      return segmented(f.name, f.label, f.options, value(f.name));
    case "image":
      return `<label class="file-picker">
          <input type="file" name="${f.name}" accept="image/jpeg,image/png,image/webp"${f.required ? " required" : ""} data-image>
          <span class="file-picker__button interactive" title="JPG, PNG ou WebP, até ${MAX_IMAGE_BYTES / 1024 / 1024} MB"><span class="icon">add_photo_alternate</span><span data-image-action>Adicionar foto</span></span>
          <span class="file-picker__row">
            <span class="file-picker__preview" data-preview><span class="icon">face</span></span>
            <span class="file-picker__text">
              <span class="file-picker__label">${esc(f.label)}</span>
              <span class="file-picker__name" data-image-name data-empty="${f.required ? "Nenhuma foto" : "Opcional"}">${f.required ? "Nenhuma foto" : "Opcional"}</span>
              <span class="file-picker__hint">${esc(f.supporting)}</span>
            </span>
          </span>
        </label>`;
  }
}

/** Os padrões dos campos com valor (listas e botões segmentados). */
function defaultValues(sections: Section[]): Values {
  const defaults = new Map(sections.flatMap((s) => s.fields).flatMap((f) => ("value" in f ? [[f.name, f.value] as const] : [])));
  return (name) => defaults.get(name) ?? "";
}

/** O que o formulário mandou; campo ausente fica com o padrão da estrutura. */
function formValues(form: FormData, sections: Section[]): Values {
  const defaults = defaultValues(sections);
  return (name) => {
    const v = form.get(name);
    return typeof v === "string" && v !== "" ? v : defaults(name);
  };
}

function loginPage(error?: string, email = ""): string {
  return authPage(
    "Entrar",
    "Estúdio de vídeos com avatar.",
    `<form class="card card--outlined login" method="post" action="/entrar">
    ${authHead("Entrar", "Estúdio de vídeos com avatar.")}
    ${textField("email", "E-mail", `type="email" autocomplete="username" required autofocus value="${esc(email)}"`)}
    ${textField("senha", "Senha", `type="password" autocomplete="current-password" required`)}
    <button class="button button--filled interactive" type="submit"><span class="icon">lock</span>Entrar</button>
  </form>`,
    error,
  );
}

function signupPage(error?: string, values: { name?: string; email?: string } = {}): string {
  return authPage(
    "Criar conta",
    "",
    `<form class="card card--outlined login" method="post" action="/cadastro">
    ${authHead("Criar conta", "A primeira conta é a do administrador. Depois dela, o cadastro fecha.")}
    ${textField("nome", "Nome", `type="text" autocomplete="name" required autofocus maxlength="80" value="${esc(values.name ?? "")}"`)}
    ${textField("email", "E-mail", `type="email" autocomplete="username" required value="${esc(values.email ?? "")}"`)}
    ${textField("senha", "Senha", `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}" maxlength="${PASSWORD_MAX}"`, `De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`)}
    ${textField("confirmar", "Repita a senha", `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}" maxlength="${PASSWORD_MAX}"`)}
    <button class="button button--filled interactive" type="submit"><span class="icon">person_add</span>Criar conta</button>
  </form>`,
    error,
  );
}

function closedPage(): string {
  return authPage(
    "Cadastro fechado",
    "",
    `<div class="card card--outlined login">
    ${authHead("Cadastro fechado", "O estúdio já tem administrador. Novas contas só por convite dele.")}
    <a class="button button--filled interactive" href="/entrar"><span class="icon">lock</span>Entrar</a>
  </div>`,
  );
}

function authHead(title: string, text: string): string {
  return `<div class="login__head">
      <span class="top-app-bar__logo"><span class="icon">videocam</span></span>
      <h1 class="login__title">${esc(title)}</h1>
      ${text ? `<p class="login__text">${esc(text)}</p>` : ""}
    </div>`;
}

function authPage(title: string, _description: string, form: string, error?: string): string {
  return page(`${title} · ${SITE_NAME}`, `<main id="conteudo">${form}</main>${error ? snackbar(error) : ""}`, { bar: false });
}

function textField(name: string, label: string, attrs: string, supporting?: string): string {
  return `<div class="text-field">
      <input class="text-field__input" id="${name}" name="${name}" ${attrs} placeholder=" ">
      <label class="text-field__label" for="${name}">${esc(label)}</label>
      ${supporting ? `<p class="text-field__supporting"><span>${esc(supporting)}</span></p>` : ""}
    </div>`;
}

function snackbar(text: string): string {
  return `<div class="snackbar" role="alert" data-snackbar>
  <span class="snackbar__text">${esc(text)}</span>
  <button type="button" class="icon-button interactive" aria-label="Fechar" data-snackbar-close style="color:inherit"><span class="icon">close</span></button>
</div>`;
}

/**
 * Barra superior, numa linha só. Na tela inicial e na de vídeos: a marca, as
 * abas Modelos e Vídeos em pílulas, a busca, o que a página acrescenta (a
 * escolha entre grade e lista), o botão de sair e a conta. Na página do modelo:
 * a marca (que volta para Modelos), o nome do modelo, o botão de sair e a conta.
 */
type Search = { action: string; label: string; q: string; keep?: Record<string, string> };
type Bar = false | { user: User; tab: "modelos" | "videos"; search: Search; extra?: string } | { user: User; back: string; title: string };

function accountActions(user: User): string {
  const initial = esc((user.name.trim()[0] ?? "?").toUpperCase());
  return `<form class="top-app-bar__action" method="post" action="/sair"><button class="icon-button interactive" type="submit" aria-label="Sair da conta de ${esc(user.name)}" title="Sair"><span class="icon">logout</span></button></form>
    <details class="menu menu--account" data-menu>
      <summary class="avatar interactive" aria-label="Sua conta: ${esc(user.name)}" title="${esc(user.name)}">${initial}</summary>
      <div class="menu__list">
        <p class="menu__header"><span class="menu__name">${esc(user.name)}</span><span class="menu__email">${esc(user.email)}</span></p>
        <hr class="menu__divider">
        <form method="post" action="/sair"><button class="menu__item interactive" type="submit"><span class="icon">logout</span>Sair</button></form>
      </div>
    </details>`;
}

function brand(href: string, label?: string): string {
  return `<a class="top-app-bar__brand interactive" href="${href}"${label ? ` aria-label="${esc(label)}" title="${esc(label)}"` : ""}>
    <span class="top-app-bar__logo"><span class="icon">videocam</span></span>
    ${label ? "" : `<span class="top-app-bar__title">${SITE_NAME}</span>`}
  </a>`;
}

function topAppBar(bar: Exclude<Bar, false>): string {
  if ("back" in bar) {
    return `<header class="top-app-bar" data-app-bar>
  ${brand(bar.back, "Voltar para Modelos")}
  <h1 class="top-app-bar__title top-app-bar__title--page">${esc(bar.title)}</h1>
  <div class="top-app-bar__actions">${accountActions(bar.user)}</div>
</header>`;
  }
  const { search } = bar;
  const keep = Object.entries(search.keep ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  const tab = (id: string, href: string, label: string) => `<a class="nav-pill interactive" href="${href}"${bar.tab === id ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="top-app-bar top-app-bar--home" data-app-bar>
  ${brand("/")}
  <nav class="nav-pills" aria-label="Seções">${tab("modelos", "/", "Modelos")}${tab("videos", "/videos", "Vídeos")}</nav>
  <div class="top-app-bar__tools">
    <form class="search-field" role="search" method="get" action="${search.action}">
      <span class="icon" aria-hidden="true">search</span>
      <input class="search-field__input" type="search" name="q" value="${esc(search.q)}" placeholder="${esc(search.label)}" aria-label="${esc(search.label)}">${keep}
    </form>
    ${bar.extra ?? ""}
  </div>
  <div class="top-app-bar__actions">${accountActions(bar.user)}</div>
</header>`;
}

function page(title: string, body: string, opts: { refresh?: boolean; bar: Bar; footer?: boolean }): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(title)}</title>
  <meta name="theme-color" content="${SURFACE_LIGHT}" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="${SURFACE_DARK}" media="(prefers-color-scheme: dark)">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${[...ICONS].sort().join(",")}&display=block">
  <style>${CSS}</style>
</head>
<body${opts.refresh ? ` data-refresh="${REFRESH_SECONDS}"` : ""}>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  ${opts.bar ? topAppBar(opts.bar) : ""}
  ${body}
  ${opts.footer === false ? "" : `<footer class="footer"><div class="footer__inner"><p class="footer__text">Vídeos gerados com inteligência artificial pelo OpenRouter.</p></div></footer>`}
  <script nonce="${NONCE}">${SCRIPT}</script>
</body>
</html>`;
}

/**
 * Barra que muda de cor ao rolar, snackbar, diálogo de detalhes do vídeo e, no
 * formulário: custo e duração estimados, contador da fala, explicação da opção
 * escolhida, prévia da foto e os botões que põem um texto na caixa da fala
 * (falas prontas e "Usar esta fala"). Menus dos cards e da conta, e os painéis
 * da página do modelo que se recolhem (lembrados no navegador). A prévia da edição
 * rápida. Com vídeo na fila, atualiza a página de tempos em tempos.
 */
const SCRIPT = `(() => {
  const bar = document.querySelector("[data-app-bar]");
  if (bar) {
    const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 0);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target : null;
    // Menu aberto: tocar fora dele, ou escolher um item, fecha.
    for (const m of document.querySelectorAll("details[data-menu][open]")) if (!m.contains(el) || (el && el.closest(".menu__item"))) m.open = false;
    const close = el && el.closest("[data-snackbar-close]");
    if (close) close.closest("[data-snackbar]").hidden = true;
    // Fala pronta ou "Usar esta fala": o texto vai para a caixa da fala.
    const fill = el && el.closest("[data-fill]");
    const speechBox = document.querySelector("[data-speech]");
    if (fill && speechBox) {
      speechBox.value = fill.dataset.fill;
      speechBox.dispatchEvent(new Event("input", { bubbles: true }));
      speechBox.focus();
    }
    // Detalhes: abre o diálogo do vídeo; fechar, ou tocar fora dele, fecha.
    const open = el && el.closest("[data-dialog-open]");
    if (open) document.getElementById(open.dataset.dialogOpen).showModal();
    if (el && (el.closest("[data-dialog-close]") || el.matches("dialog"))) el.closest("dialog").close();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") for (const m of document.querySelectorAll("details[data-menu][open]")) { m.open = false; m.querySelector("summary").focus(); }
  });

  // Painéis da página do modelo: o botão recolhe e abre; a escolha fica guardada.
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const setPane = (pane, open) => {
    const b = pane.querySelector("[data-pane-toggle]"), side = b.dataset.paneToggle;
    pane.classList.toggle("is-collapsed", !open);
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", open ? "Recolher o painel" : "Abrir o painel");
    b.title = b.getAttribute("aria-label");
    b.querySelector(".icon").textContent = side + (open ? "_panel_close" : "_panel_open");
    store.set("painel-" + pane.dataset.pane, open ? "aberto" : "fechado");
  };
  for (const pane of document.querySelectorAll("[data-pane]")) {
    if (store.get("painel-" + pane.dataset.pane) === "fechado") setPane(pane, false);
    pane.querySelector("[data-pane-toggle]").addEventListener("click", () => setPane(pane, pane.classList.contains("is-collapsed")));
  }

  // Diálogo fechado: o vídeo dele para de tocar.
  for (const d of document.querySelectorAll("dialog")) d.addEventListener("close", () => d.querySelectorAll("video").forEach((v) => v.pause()));

  const f = document.querySelector("[data-composer]");
  let dirty = false;
  if (f) {
    f.addEventListener("input", () => { dirty = true; });
    // Campo obrigatório no painel recolhido (a foto do HeyGen): abre o painel para o aviso aparecer.
    f.addEventListener("invalid", (e) => { const pane = e.target.closest("[data-pane].is-collapsed"); if (pane) setPane(pane, true); }, true);
    const cfg = JSON.parse(f.dataset.composer);
    const val = (name) => (f.elements[name] ? f.elements[name].value || "" : "");
    const speech = f.querySelector("[data-speech]");
    const words = f.querySelector("[data-words]"), count = f.querySelector("[data-count]");
    const cost = f.querySelector("[data-cost]"), seconds = f.querySelector("[data-seconds]");
    const rate = cfg.rate, mid = (rate.min + rate.max) / 2;
    const update = () => {
      const n = speech.value.split(/\\s+/).filter(Boolean).length;
      const fixed = cfg.seconds.field ? Number(val(cfg.seconds.field)) : 0;
      const s = fixed || (n ? Math.max(1, Math.round(n / mid)) : 0);
      const price = Number(cfg.prices[cfg.sku.replace(/\\{(\\w+)\\}/g, (_, k) => val(k))]);
      seconds.textContent = s ? (fixed ? "" : "≈ ") + s + " s" : "—";
      cost.textContent = price && s ? "US$ " + (price * s).toFixed(2) : "—";
      if (fixed) {
        // Duração escolhida: a faixa de palavras que cabe nela.
        const min = Math.round(fixed * rate.min), max = Math.round(fixed * rate.max);
        words.textContent = n
          ? n + " palavras" + (n < min ? " · curta para " + fixed + " s (ideal " + min + " a " + max + ")" : n > max ? " · longa para " + fixed + " s (ideal " + min + " a " + max + ")" : " · cabe em " + fixed + " s")
          : "Para " + fixed + " s: umas " + min + " a " + max + " palavras.";
        words.parentElement.classList.toggle("text-field__supporting--error", n > max);
      } else {
        words.textContent = n ? n + " palavras · ≈ " + s + " s de vídeo" : words.dataset.default;
      }
      count.textContent = speech.value.length + "/" + speech.maxLength;
      for (const d of f.querySelectorAll("[data-description-for]")) {
        const option = f.elements[d.dataset.descriptionFor].selectedOptions[0];
        d.textContent = (option && option.dataset.description) || "";
      }
    };
    f.addEventListener("change", update);
    f.addEventListener("input", update);
    update();

    const image = f.querySelector("[data-image]"), preview = f.querySelector("[data-preview]"), name = f.querySelector("[data-image-name]");
    if (image) image.addEventListener("change", () => {
      const file = image.files[0];
      name.textContent = file ? file.name : name.dataset.empty;
      f.querySelector("[data-image-action]").textContent = file ? "Trocar foto" : "Adicionar foto";
      preview.innerHTML = file ? '<img alt="">' : '<span class="icon">face</span>';
      if (file) preview.firstChild.src = URL.createObjectURL(file);
    });

    f.addEventListener("submit", () => { f.querySelector("[type=submit]").disabled = true; });
  }

  // Edição rápida: a prévia acha os silêncios no áudio (pico de cada 10 ms) e monta os
  // trechos com as regras do contêiner; o player pula as pausas e dá o zoom de cada trecho.
  const qe = document.querySelector("[data-quick-edit]");
  if (qe) {
    const cfg = JSON.parse(qe.dataset.quickEdit), R = cfg.rules;
    const player = document.querySelector("[data-player]"), v = player.querySelector("video");
    const controls = player.querySelector("[data-qe-controls]"), play = controls.querySelector("[data-qe-play]"), clock = controls.querySelector("[data-qe-time]");
    const opener = document.querySelector("[data-qe-open]"), summary = qe.querySelector("[data-qe-summary]"), input = qe.querySelector("[data-qe-parts]");
    const form = document.getElementById("edicao-rapida"), savedSrc = v.getAttribute("src");
    let silences = null, duration = 0, parts = [], total = 0, raf = 0;
    const fmt = (s) => s.toFixed(1).replace(".", ",") + " s";
    const findSilences = (buf) => {
      const win = Math.round(buf.sampleRate / 100), n = Math.ceil(buf.length / win), limit = Math.pow(10, R.noiseDb / 20);
      const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
      const out = [];
      let start = -1;
      for (let w = 0; w <= n; w++) {
        let peak = 1;
        if (w < n) { peak = 0; for (const c of chans) for (let i = w * win, e = Math.min(c.length, i + win); i < e; i++) peak = Math.max(peak, Math.abs(c[i])); }
        const t = Math.min((w * win) / buf.sampleRate, buf.duration);
        if (peak < limit) { if (start < 0) start = t; }
        else if (start >= 0) { if (t - start >= R.minSilence) out.push([start, t]); start = -1; }
      }
      return out;
    };
    const build = () => {
      const pad = cfg.pauses[form.elements.pausa.value], zooms = cfg.cameras[form.elements.camera.value];
      const speech = [];
      let end = 0;
      for (const [a, b] of silences) { if (a - end > R.minSpeech) speech.push([end, a]); end = b; }
      if (duration - end > R.minSpeech) speech.push([end, duration]);
      const out = [];
      for (const [a, b] of speech) {
        const last = out[out.length - 1], from = Math.max(0, a - pad, last ? last[1] : 0), to = Math.min(duration, b + pad);
        if (last && to - from < R.minPart) last[1] = to; else out.push([from, to]);
      }
      parts = out.map(([a, b], i) => [+a.toFixed(3), +b.toFixed(3), zooms[i % zooms.length]]);
      total = parts.reduce((s, p) => s + p[1] - p[0], 0);
      input.value = parts.length ? JSON.stringify(parts) : "";
      summary.textContent = parts.length ? fmt(duration) + " → " + fmt(total) + " · " + (parts.length - 1) + " cortes" : "Não achei fala no áudio.";
      play.disabled = !parts.length;
    };
    // Zoom z mirando no rosto: o mesmo recorte do contêiner, como origem do scale.
    const frame = (z) => {
      const y = Math.min(Math.max(0, R.faceY - R.faceInFrame / z), 1 - 1 / z);
      v.style.transform = z > 1 ? "scale(" + z + ")" : "";
      v.style.transformOrigin = z > 1 ? "50% " + ((y * z) / (z - 1)) * 100 + "%" : "";
    };
    const tick = () => {
      if (!parts.length) return;
      const t = v.currentTime;
      let i = parts.findIndex((p) => t < p[1] - 0.02);
      if (i < 0) { v.pause(); i = 0; v.currentTime = parts[0][0]; }
      else if (t < parts[i][0] - 0.02) v.currentTime = parts[i][0];
      frame(parts[i][2]);
      const done = parts.slice(0, i).reduce((s, p) => s + p[1] - p[0], 0) + Math.max(0, t - parts[i][0]);
      clock.textContent = fmt(Math.min(done, total)) + " / " + fmt(total);
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const setPlaying = (on) => {
      play.querySelector(".icon").textContent = on ? "pause" : "play_arrow";
      play.setAttribute("aria-label", on ? "Pausar a prévia" : "Tocar a prévia");
      play.title = play.getAttribute("aria-label");
    };
    const toggle = () => {
      if (!qe.hidden && parts.length) v.paused ? v.play() : v.pause();
    };
    v.addEventListener("play", () => { setPlaying(true); if (!qe.hidden) { cancelAnimationFrame(raf); tick(); } });
    v.addEventListener("pause", () => setPlaying(false));
    v.addEventListener("click", () => { if (!qe.hidden) toggle(); });
    play.addEventListener("click", toggle);
    opener.addEventListener("click", async () => {
      dirty = true;
      qe.hidden = false; opener.hidden = true; controls.hidden = false;
      player.classList.add("is-previewing");
      v.pause(); v.controls = false;
      if (v.getAttribute("src") !== cfg.src) v.src = cfg.src;
      qe.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (silences) return tick();
      summary.textContent = "Analisando o áudio…";
      play.disabled = true;
      try {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(await (await fetch(cfg.src)).arrayBuffer());
        ctx.close();
        duration = buf.duration; silences = findSilences(buf);
        build(); tick();
      } catch {
        summary.textContent = "Não deu para analisar o áudio neste navegador. O vídeo editado sai com as escolhas abaixo, sem prévia.";
      }
    });
    qe.querySelector("[data-qe-close]").addEventListener("click", () => {
      qe.hidden = true; opener.hidden = false; controls.hidden = true;
      player.classList.remove("is-previewing");
      v.pause(); frame(1); v.controls = true;
      if (v.getAttribute("src") !== savedSrc) v.src = savedSrc;
    });
    qe.addEventListener("change", () => { if (silences) { build(); tick(); } });
    form.addEventListener("submit", () => { qe.querySelector("[type=submit]").disabled = true; });
  }

  // Vídeo na fila: confere de novo de tempos em tempos, sem perder o que está sendo
  // escrito, sem fechar um diálogo aberto e sem cortar um vídeo que está tocando.
  const refresh = Number(document.body.dataset.refresh);
  if (refresh) setInterval(() => {
    const playing = [...document.querySelectorAll("video")].some((v) => !v.paused);
    if (!dirty && !playing && !document.querySelector("dialog[open]")) location.reload();
  }, refresh * 1000);
})();`;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Marca no lugar do nonce do script; html() troca por um valor novo a cada resposta. */
const NONCE = "{{nonce}}";

function html(body: string, status = 200): Response {
  const nonce = randomNonce();
  return new Response(body.replaceAll(`nonce="${NONCE}"`, `nonce="${nonce}"`), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS, "content-security-policy": csp(nonce) },
  });
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location, ...SECURITY_HEADERS });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  // Não "no-referrer": com ele, o navegador manda Origin: null nos formulários do próprio site.
  "referrer-policy": "same-origin",
};

/** Só o script da própria página (com o nonce); fotos de prévia vêm de blob:. */
function csp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' blob:",
    "media-src 'self'",
    // A prévia da edição rápida baixa o vídeo para achar os silêncios.
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join("; ");
}

function randomNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * O formulário veio de uma página do próprio estúdio? Vale o Origin igual ao
 * do site ou, quando o navegador manda Origin "null", o Sec-Fetch-Site
 * "same-origin", que só o navegador consegue pôr. (Como no estuda.mais.)
 */
function sameSite(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin === url.origin) return true;
  return (origin === null || origin === "null") && request.headers.get("sec-fetch-site") === "same-origin";
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86_400}`;
}

function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function sessionToken(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([\\w-]+)`).exec(cookies);
  return match ? match[1]! : null;
}
