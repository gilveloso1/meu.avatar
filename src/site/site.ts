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
import { OpenRouterVideo, type VideoModel } from "../openrouter";
import { CAMERAS, DEFAULT_CAMERA, DEFAULT_PAUSE, PAUSES, parsePlan, planParts, RULES } from "../quickedit";
import { canUse, type Defaults, estimate, type Field, type Option, type Section, STRUCTURES, structureById, type Structure, type Values } from "../structures";
import { ForbiddenError, InputError, MAX_IMAGE_BYTES, type Studio } from "../studio";
import { CSS } from "./style";
import { DARK, LIGHT } from "./theme";

export interface SiteConfig {
  /** Padrões do formulário (wrangler.jsonc). */
  defaults: Defaults;
  /** Rodando no computador (AMBIENTE=local no .dev.vars): esconde os avisos de configuração. */
  local?: boolean;
}

const SITE_NAME = "Meu Avatar";
export const SESSION_COOKIE = "__Host-sessao";
/** Enquanto há vídeo na fila, a página confere de novo a cada tantos segundos. */
const REFRESH_SECONDS = 20;

/** Ícones usados (Material Symbols); a fonte só baixa esses. */
const ICONS = [
  "add", "apps", "arrow_back", "arrow_drop_down", "arrow_drop_up", "aspect_ratio", "calendar_today", "check", "check_circle", "chevron_left", "chevron_right",
  "close", "content_copy", "content_cut", "crop_square", "download", "edit", "error", "face", "fullscreen", "fullscreen_exit", "gesture", "graphic_eq",
  "grid_view", "hd", "hourglass_top", "info", "lock", "logout", "more_vert", "movie", "notes", "palette", "pause", "payments", "person_add", "play_arrow",
  "record_voice_over", "refresh", "schedule", "search", "send", "swap_vert", "translate", "videocam", "view_list", "volume_off", "volume_up",
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
        : this.modelPage(user, structure, await this.redoValues(structure, url.searchParams.get("refazer")));
    }

    // A página do vídeo: o player ocupa a tela, com as informações numa folha lateral.
    const watch = /^\/video\/([0-9a-f-]{36})$/.exec(path);
    if (!post && watch) return this.videoPage(user, watch[1]!, url);

    const quickEdit = /^\/videos\/([0-9a-f-]{36})\/edicao-rapida$/.exec(path);
    if (post && quickEdit) return this.quickEdit(request, user, quickEdit[1]!);
    const face = /^\/videos\/([0-9a-f-]{36})\/rosto$/.exec(path);
    if (!post && face) return this.face(user, face[1]!);

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
    // ?modelo= (do menu do card do modelo) só restringe; nunca mostra modelo que a pessoa não pode usar.
    const only = url.searchParams.get("modelo") ?? "";
    const usable = STRUCTURES.filter((s) => canUse(s, user.role) && (!only || s.id === only));
    const videos = await this.db.videosByStructures(usable.map((s) => s.id), q);
    const waiting = videos.some((v) => cardStatus(v).kind === "busy");
    // A mesma lista da página do modelo (filtro, ordem, vista e agrupamento no navegador); a busca pela fala fica no servidor.
    const from = `/videos${url.search}`;
    const body = `
<main class="page" id="conteudo">
  ${videoLibrary(videos, {
    key: only ? `videos-${only}` : "videos",
    from,
    title: only && usable[0] ? `Vídeos · ${usable[0].name}` : "Vídeos",
    heading: "h1",
    action: `<a class="fab fab--extended interactive" href="/"><span class="icon">add</span>Novo vídeo</a>`,
    empty: q || only ? emptyState("search", "Nenhum vídeo encontrado", "Tente outra busca.") : emptyState("movie", "Nenhum vídeo ainda", "Escolha um modelo para gerar o primeiro."),
    structureOf: (v) => structureById(v.structure)!,
  })}
</main>`;
    return html(
      page(`Vídeos · ${SITE_NAME}`, body, {
        refresh: waiting,
        bar: { user, tab: "videos", search: { action: "/videos", label: "Pesquisar pela fala", q, keep: { modelo: only } } },
      }),
    );
  }


  /**
   * A página do modelo: a configuração do vídeo à esquerda (com o botão de gerar no fim)
   * e, no centro, os vídeos do modelo (videoLibrary). Tocar num vídeo abre /video/<id>.
   */
  private async modelPage(user: User, structure: Structure, values?: Values, error?: string): Promise<Response> {
    const { model, error: modelError } = await this.tryModel(structure);
    // Sem a chave do OpenRouter: no computador, nenhum aviso; no ar, um aviso na língua de quem usa.
    const banner = modelError ?? (this.studio.canGenerate || this.config.local ? null : "A criação de vídeos está pausada no momento. Seus vídeos continuam aqui para ver e baixar.");
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
    const waiting = videos.some((v) => cardStatus(v).kind === "busy");

    // A foto abre o painel; o resto (a fala inclusive) segue as seções da estrutura.
    const fields = sections.flatMap((s) => s.fields);
    const speech = fields.some((f) => f.kind === "textarea");
    const images = fields.filter((f) => f.kind === "image");
    const rest = sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f.kind !== "image") })).filter((s) => s.fields.length);

    const body = `
<main class="workspace" id="conteudo">
  <form class="workspace__form" method="post" action="/modelo/${structure.id}" enctype="multipart/form-data" data-composer='${esc(JSON.stringify(config))}'>
    <section class="pane pane--config" aria-labelledby="configuracao">
      <div class="pane__head"><h2 class="pane__headline" id="configuracao">Configuração</h2></div>
      <div class="pane__body" id="configuracao-corpo">
        ${images.map((f) => formField(f, value)).join("")}
        ${rest.map((section) => formSection(section, value)).join("")}
      </div>
      ${speech ? generateBar(seconds, cost, Boolean(model) && (this.studio.canGenerate || Boolean(this.config.local))) : ""}
    </section>
    <div class="workspace__main">
      ${banner ? `<p class="banner" role="status"><span class="icon">error</span>${esc(banner)}</p>` : ""}
      ${videoLibrary(videos, {
        key: structure.id,
        from: `/modelo/${structure.id}`,
        title: "Vídeos",
        empty: emptyState("videocam", "Os vídeos gerados aparecem aqui.", "Escolha a foto e os ajustes, escreva a fala e toque em Gerar vídeo."),
        structureOf: () => structure,
      })}
    </div>
  </form>
</main>
${error ? snackbar(error) : ""}`;
    return html(page(`${structure.name} · ${SITE_NAME}`, body, { refresh: waiting, bar: { user, back: "/", title: structure.name } }), error ? 400 : 200);
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
      return this.videoPage(user, video.id, new URL(request.url), err.message);
    }
    return redirect(`/video/${video.id}`);
  }

  /** Onde está o rosto (JSON), para a prévia da edição rápida mirar o zoom. */
  private async face(user: User, id: string): Promise<Response> {
    const video = await this.db.videoById(id);
    if (!video) return new Response("não encontrado", { status: 404 });
    try {
      const face = await this.studio.face(video, user);
      return new Response(JSON.stringify(face ?? {}), { headers: { "content-type": "application/json", ...SECURITY_HEADERS } });
    } catch (err) {
      if (err instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
      if (err instanceof InputError) return new Response(err.message, { status: 400 });
      throw err;
    }
  }

  /**
   * "Refazer": os valores do formulário tirados de um vídeo já feito (texto e ajustes).
   * Só os campos que existem na estrutura usam esses valores; o resto fica no padrão.
   */
  private async redoValues(structure: Structure, id: string | null): Promise<Values | undefined> {
    const v = id ? await this.db.videoById(id) : null;
    if (!v || v.structure !== structure.id) return undefined;
    const { model } = await this.tryModel(structure);
    const base = defaultValues(structure.sections(model, this.config.defaults));
    let settings: Record<string, string> = {};
    try { settings = JSON.parse(v.settings ?? "{}"); } catch {}
    const from: Record<string, string | null | undefined> = {
      fala: v.prompt, resolucao: v.resolution, formato: v.aspect_ratio, duracao: String(v.duration),
      estilo: v.style, idioma: v.language, instrucoes: v.extra, movimento: settings.motion_prompt ?? v.extra,
      voz: settings.voice_id, expressividade: settings.expressiveness,
    };
    return (name) => from[name] || base(name);
  }

  /** A página do vídeo: o vídeo centralizado sobre ele mesmo desfocado e, ao lado, a folha com as informações. */
  private async videoPage(user: User, id: string, url: URL, error?: string): Promise<Response> {
    const v = await this.db.videoById(id);
    const structure = v && structureById(v.structure);
    if (!v || !structure || !canUse(structure, user.role)) return new Response("não encontrado", { status: 404 });
    // De onde a pessoa veio (só caminhos do próprio site): a seta e o X voltam para lá.
    const from = url.searchParams.get("de") ?? "";
    const back = /^\/(?!\/)/.test(from) ? from : `/modelo/${structure.id}`;
    const showOriginal = url.searchParams.has("original");
    const status = cardStatus(v);
    const quick = canQuickEdit(v, structure);
    const edited = Boolean(v.edited_key) && !showOriginal;
    const src = edited ? `/videos/${v.id}.editado.mp4` : videoSrc(v);
    const ratio = esc(v.aspect_ratio.replace(":", " / "));
    const media = v.video_key
      ? `<div class="player viewer__player" style="--ratio:${ratio}"${quick ? " data-player" : ""}><div class="player__frame"><video autoplay preload="metadata" playsinline src="${src}"></video>${
          quick ? `<div class="player__controls" data-qe-controls hidden><button class="icon-button interactive" type="button" data-qe-play aria-label="Tocar a prévia" title="Tocar a prévia"><span class="icon">play_arrow</span></button><span class="player__time" data-qe-time></span></div>` : ""
        }</div></div>`
      : status.kind === "error"
        ? `<div class="stage stage--error"><span class="icon">error</span><p class="stage__title">${esc(status.label)}</p>${v.error ? `<p class="stage__text">${esc(v.error)}</p>` : ""}</div>`
        : `<div class="stage"><span class="icon">${status.icon}</span><p class="stage__title">${esc(status.label)}</p><div class="linear-progress" role="progressbar" aria-label="${esc(status.label)}"></div><p class="stage__text">Leva alguns minutos. A página se atualiza sozinha.</p></div>`;
    // Campos de texto livre (movimento, instruções) ganham um bloco próprio, como o Texto; vazios não aparecem.
    const all = [{ term: "Modelo", description: structure.name }, ...structure.details(v)];
    const notes = all.filter((d) => FREE_TEXT.has(d.term) && d.description !== "—");
    const details = [
      ...all.filter((d) => !FREE_TEXT.has(d.term)),
      { term: "Duração", description: durationLabel(v, structure) },
      { term: "Resolução", description: v.resolution },
      { term: "Formato", description: v.aspect_ratio },
      { term: "Custo", description: v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : "—" },
      { term: "Criado em", description: formatDate(v.created_at) },
    ];
    const errors = [
      v.error,
      v.audio_status === "failed" ? `Áudio não tratado: ${v.audio_error ?? "erro desconhecido"}` : null,
      v.edit_status === "failed" ? `Edição rápida falhou: ${v.edit_error ?? "erro desconhecido"}` : null,
    ].filter((e): e is string => Boolean(e));
    const downloads: MenuItem[] = v.video_key
      ? [
          { label: v.processed_key ? "Com áudio tratado" : "MP4", icon: "download", href: `/videos/${v.id}.mp4?baixar`, download: true },
          ...(v.edited_key ? [{ label: "Editado", icon: "content_cut", href: `/videos/${v.id}.editado.mp4?baixar`, download: true }] : []),
          ...(v.processed_key ? [{ label: "Original", icon: "movie", href: `/videos/${v.id}.original.mp4?baixar`, download: true }] : []),
        ]
      : [];
    const avatar = v.image_key?.startsWith("avatares/") ? `<img class="viewer__avatar" src="/midia/${esc(v.image_key)}" alt="Foto do avatar">` : "";
    const toggle = new URLSearchParams(from ? { de: from } : {});
    if (edited) toggle.set("original", "");
    const info = `
        <div class="viewer__panel" data-tab-panel="info">
          ${errors.map((e) => `<p class="dialog__error">${esc(e)}</p>`).join("")}
          <section class="viewer__section">
            <div class="viewer__section-head"><h2 class="viewer__title">Texto</h2><button class="button button--text interactive" type="button" data-copy="${esc(v.prompt)}"><span class="icon">content_copy</span><span>Copiar</span></button></div>
            <div class="viewer__card">${avatar}<p class="viewer__text">${esc(v.prompt)}</p></div>
          </section>
          ${notes
            .map((d) => `<section class="viewer__section"><h2 class="viewer__title">${esc(d.term)}</h2><div class="viewer__card"><p class="viewer__text">${esc(d.description)}</p></div></section>`)
            .join("")}
          <section class="viewer__card viewer__details" aria-labelledby="detalhes-titulo">
            <h2 class="qe-result__title" id="detalhes-titulo">Detalhes</h2>
            <dl>${details.map((d) => `<div class="qe-result__row"><span class="icon" aria-hidden="true">${DETAIL_ICONS[d.term] ?? "info"}</span><dt class="qe-result__label">${esc(d.term)}</dt><dd class="qe-result__value">${esc(d.description)}</dd></div>`).join("")}</dl>
          </section>
          ${v.edited_key ? `<a class="button button--text interactive" href="/video/${v.id}?${esc(toggle.toString())}"><span class="icon">movie</span>${edited ? "Ver o original" : "Ver o editado"}</a>` : ""}
        </div>`;
    const body = `
<main class="viewer" id="conteudo">
  <section class="viewer__stage" aria-label="Vídeo">
    <a class="viewer__nav viewer__nav--prev icon-button interactive" data-nav="prev" hidden aria-label="Vídeo anterior" title="Vídeo anterior"><span class="icon">chevron_left</span></a>
    ${media}
    ${
      v.video_key
        ? `<div class="vbar" data-vbar role="group" aria-label="Controles do vídeo">
      <button class="vbar__play interactive" type="button" data-vbar-play aria-label="Tocar" title="Tocar"><span class="icon">play_arrow</span></button>
      <span class="vbar__time" data-vbar-time>0:00 / 0:00</span>
      <input class="vbar__seek" type="range" min="0" max="1000" step="1" value="0" data-vbar-seek aria-label="Posição no vídeo">
      <button class="icon-button interactive" type="button" data-vbar-mute aria-label="Tirar o som" title="Tirar o som"><span class="icon">volume_up</span></button>
      <button class="icon-button interactive" type="button" data-vbar-full aria-label="Tela cheia" title="Tela cheia"><span class="icon">fullscreen</span></button>
    </div>`
        : ""
    }
    <a class="viewer__nav viewer__nav--next icon-button interactive" data-nav="next" hidden aria-label="Próximo vídeo" title="Próximo vídeo"><span class="icon">chevron_right</span></a>
  </section>
  <aside class="viewer__sheet" aria-label="Informações do vídeo" data-viewer="${v.id}" data-back="${esc(back)}">
    <div class="viewer__head">
      <p class="status-line status-line--${status.kind}"><span class="icon">${status.kind === "done" ? "check_circle" : status.icon}</span>${esc(status.label)}</p>
      <a class="icon-button interactive" href="${esc(back)}" aria-label="Fechar" title="Fechar"><span class="icon">close</span></a>
    </div>
    ${
      quick
        ? `<div class="tabs" role="tablist">
      <button class="tabs__tab interactive" type="button" role="tab" data-tab="info" aria-selected="true"><span class="icon">info</span>Informações</button>
      <button class="tabs__tab interactive" type="button" role="tab" data-tab="qe" aria-selected="false"><span class="icon">content_cut</span>Edição rápida</button>
    </div>
    <button type="button" data-qe-open hidden></button>`
        : ""
    }
    <div class="viewer__body">
      ${info}
      ${quick ? quickEditPreview(v) : ""}
    </div>
    <div class="viewer__actions">
      <a class="button button--filled interactive" href="/modelo/${structure.id}?refazer=${v.id}"><span class="icon">refresh</span>Refazer</a>
      ${downloads.length === 1 ? `<a class="button button--outlined interactive" href="${downloads[0]!.href}" download><span class="icon">download</span>Baixar</a>` : downloads.length ? downloadMenu(downloads) : ""}
    </div>
  </aside>
</main>
${quick ? `<form id="edicao-rapida" method="post" action="/videos/${v.id}/edicao-rapida" hidden></form><script nonce="${NONCE}">${PREVIEW_SCRIPT}</script>` : ""}
${error ? snackbar(error) : ""}`;
    return html(page(`Vídeo · ${structure.name} · ${SITE_NAME}`, body, { refresh: status.kind === "busy", bar: { user, back, title: structure.name } }), error ? 400 : 200);
  }

  private async tryModel(structure: Structure): Promise<{ model: VideoModel | null; error: string | null }> {
    try {
      // Sem a chave: no computador, a lista pública de modelos (o formulário mostra todas as opções);
      // no ar, nada (o aviso diz que a criação está pausada). Assim os testes não vão à rede.
      if (!this.studio.canGenerate) {
        if (!this.config.local) return { model: null, error: null };
        const model = (await OpenRouterVideo.listModels()).find((m) => m.id === structure.model);
        return { model: model ?? null, error: null };
      }
      return { model: await this.studio.model(structure.model), error: null };
    } catch (err) {
      console.error(`Não deu para ler o modelo ${structure.model}:`, err);
      return { model: null, error: "Não foi possível carregar as opções deste modelo agora. Atualize a página em instantes." };
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
      return this.modelPage(user, structure, values, err.message);
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
    return { label: `Editando o vídeo · ${since} min`, icon: "content_cut", kind: "busy" };
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

/**
 * Prévia da edição rápida, aberta pelo botão: o player toca o vídeo pulando as
 * pausas e com o zoom de cada trecho; pausas e câmera mudam a prévia na hora.
 * "Gerar vídeo editado" manda os trechos para o contêiner (formulário
 * #edicao-rapida, fora do formulário da fala).
 */
function quickEditPreview(v: Video): string {
  const config = {
    src: videoSrc(v),
    face: `/videos/${v.id}/rosto`,
    rules: RULES,
    pauses: Object.fromEntries(PAUSES.map((p) => [p.value, p.pause])),
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
          <button class="button button--tonal interactive quick-edit__preview" type="button" data-qe-preview disabled><span class="icon">play_arrow</span><span>Tocar prévia</span></button>
          <input type="hidden" name="trechos" form="edicao-rapida" data-qe-parts>
          <div class="quick-edit__actions">
            <button class="button button--outlined interactive" type="button" data-qe-close>Cancelar</button>
            <button class="button button--filled interactive" type="submit" form="edicao-rapida"><span class="icon">content_cut</span>Gerar editado</button>
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
function segmented(name: string, label: string, options: Option[], selected: string, form?: string): string {
  const owner = form ? ` form="${form}"` : "";
  // Opções com explicação: a da escolhida aparece embaixo (o script troca ao mudar).
  const help = options.find((o) => o.value === selected)?.description;
  return `<fieldset class="segmented-field">
          <legend class="segmented-field__label">${esc(label)}</legend>
          <div class="segmented-button">${options
            .map(
              (o) =>
                `<label class="segmented-button__segment interactive"><input type="radio" name="${name}" value="${esc(o.value)}"${owner}${o.description ? ` data-description="${esc(o.description)}"` : ""}${o.value === selected ? " checked" : ""}><span class="icon segmented-button__check" aria-hidden="true">check</span><span>${esc(o.label)}</span></label>`,
            )
            .join("")}</div>
          ${help !== undefined ? `<p class="segmented-field__help" data-help-for="${name}">${esc(help)}</p>` : ""}
        </fieldset>`;
}

/** A caixa da fala, embaixo do centro: o campo, a duração e o custo estimados e o botão de gerar. */
/** Detalhes que são texto livre: saem da lista e viram um bloco próprio na página do vídeo. */
const FREE_TEXT = new Set(["Movimento", "Instruções extras"]);

/** Ícone de cada linha dos detalhes do vídeo (precisa estar em ICONS); o que faltar usa "info". */
const DETAIL_ICONS: Record<string, string> = {
  Modelo: "movie", Voz: "record_voice_over", Expressividade: "face", Movimento: "gesture",
  Estilo: "palette", "Idioma da fala": "translate", "Instruções extras": "notes",
  Duração: "schedule", Resolução: "hd", Formato: "aspect_ratio", Custo: "payments", "Criado em": "calendar_today",
};

/** Botão "Baixar" com menu das versões do vídeo (original, áudio tratado, editado). */
function downloadMenu(items: MenuItem[]): string {
  return `<details class="menu menu--up" data-menu>
        <summary class="button button--outlined interactive"><span class="icon">download</span>Baixar<span class="icon">arrow_drop_down</span></summary>
        <div class="menu__list" role="menu">${items.map((i) => `<a class="menu__item interactive" role="menuitem" href="${i.href}" download><span class="icon">${i.icon}</span>${esc(i.label)}</a>`).join("")}</div>
      </details>`;
}

/** Dia no fuso de São Paulo (AAAA-MM-DD), para agrupar por data. */
function dayKey(iso: string | number): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Grupo de data do vídeo: Hoje, Ontem, Últimos 7 dias, Últimos 30 dias e, antes disso, o mês. */
function dateGroup(iso: string, now = Date.now()): string {
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(iso))) / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return "Últimos 7 dias";
  if (days < 30) return "Últimos 30 dias";
  const month = new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });
  return month.charAt(0).toUpperCase() + month.slice(1);
}

/**
 * A área central: os vídeos do modelo agrupados por data, em cards quadrados numa moldura
 * (três tamanhos) ou em detalhes (uma linha por vídeo, com as colunas). Filtro, ordem e
 * vista trocam no navegador, sem recarregar: o que está no formulário não se perde.
 */
interface LibraryOptions {
  /** Onde a escolha de vista, filtro, ordem e agrupamento fica guardada no navegador ("lista-<key>"). */
  key: string;
  /** Página de onde o vídeo é aberto: a seta e o X da página do vídeo voltam para ela. */
  from: string;
  /** Título da lista e o nível dele (h1 na aba Vídeos, h2 na página do modelo). */
  title: string;
  heading?: "h1" | "h2";
  /** Ação ao lado do título (o "Novo vídeo" da aba Vídeos). */
  action?: string;
  /** O que mostrar sem vídeos. */
  empty: string;
  structureOf: (v: Video) => Structure;
}

function videoLibrary(videos: Video[], o: LibraryOptions): string {
  const h = o.heading ?? "h2";
  const head = (count: string) => `<${h} class="library__title">${esc(o.title)} <span class="pane__count"${count === "" ? "" : " data-library-count"}>${count || 0}</span></${h}>`;
  if (!videos.length) return `<div class="library"><div class="library__head">${head("")}${o.action ?? ""}</div>${o.empty}</div>`;
  const chips = FILTERS.map(
    (f, i) => `<button class="chip interactive" type="button" data-filter="${f.kind ?? ""}" aria-pressed="${i === 0}"><span class="icon chip__check">check</span>${esc(f.label)}</button>`,
  ).join("");
  const views = [
    { id: "p", label: "Cards pequenos", icon: "apps" },
    { id: "m", label: "Cards médios", icon: "grid_view" },
    { id: "g", label: "Cards grandes", icon: "crop_square" },
    { id: "d", label: "Detalhes", icon: "view_list" },
  ]
    .map((z) => `<button class="segmented-button__segment interactive" type="button" data-view="${z.id}"${z.id === "m" ? ' aria-current="true"' : ""} aria-label="${z.label}" title="${z.label}"><span class="icon">${z.icon}</span></button>`)
    .join("");
  const groups = new Map<string, Video[]>();
  for (const v of videos) {
    const g = dateGroup(v.created_at);
    groups.set(g, [...(groups.get(g) ?? []), v]);
  }
  const thumb = (v: Video, status: ReturnType<typeof cardStatus>) =>
    v.video_key ? `<video data-src="${videoSrc(v)}" preload="metadata" muted playsinline tabindex="-1"></video>` : `<span class="frame__placeholder">${statusTile(status, true)}</span>`;
  const section = ([title, list]: [string, Video[]]) => {
    const frames = list
      .map((v) => {
        const status = cardStatus(v);
        const structure = o.structureOf(v);
        const label = esc([v.prompt, status.kind === "done" ? null : status.label, formatDate(v.created_at), structure.name, durationLabel(v, structure)].filter(Boolean).join(" · "));
        return `<a class="frame interactive" href="/video/${v.id}?de=${encodeURIComponent(o.from)}" data-video="${v.id}" data-kind="${status.kind}" aria-label="${label}" title="${label}">${thumb(v, status)}</a>`;
      })
      .join("");
    const rows = list
      .map((v) => {
        const status = cardStatus(v), structure = o.structureOf(v);
        return `<a class="vrow interactive" href="/video/${v.id}?de=${encodeURIComponent(o.from)}" role="row" data-video="${v.id}" data-kind="${status.kind}">
          <span class="vrow__thumb" role="cell">${thumb(v, status)}</span>
          <span class="vrow__text" role="cell">${esc(v.prompt)}</span>
          <span class="vrow__status vrow__status--${status.kind}" role="cell"><span class="icon">${status.kind === "done" ? "check_circle" : status.icon}</span>${esc(status.label.replace(/ · .*/, ""))}</span>
          <span role="cell">${esc(durationLabel(v, structure))}</span>
          <span class="vrow__wide" role="cell">${esc(`${v.aspect_ratio} · ${v.resolution}`)}</span>
          <span class="vrow__wide" role="cell">${v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : "—"}</span>
          <span role="cell">${esc(formatDate(v.created_at))}</span>
        </a>`;
      })
      .join("");
    return `<section class="vgroup" data-group>
        <h3 class="vgroup__title">${esc(title)}</h3>
        <div class="frames" data-items>${frames}</div>
        <div class="vrows" role="rowgroup" data-items>${rows}</div>
      </section>`;
  };
  return `<div class="library" data-library="${esc(o.key)}" data-view="m" data-grouped="false">
      <div class="library__head">
        ${head(String(videos.length))}
        <div class="library__end"><div class="segmented-button library__sizes" role="group" aria-label="Vista">${views}</div>${o.action ?? ""}</div>
      </div>
      <div class="chip-set library__tools" role="toolbar" aria-label="Filtrar e ordenar">
        ${chips}
        <span class="library__divider" aria-hidden="true"></span>
        <button class="chip interactive" type="button" data-sort aria-label="Ordem: mais recentes primeiro"><span class="icon">swap_vert</span><span data-sort-label>Mais recentes</span></button>
        <button class="chip interactive" type="button" data-group-toggle aria-pressed="false"><span class="icon chip__check">check</span>Agrupar por data</button>
      </div>
      <div class="vrows__head" role="row" aria-hidden="true"><span></span><span>Texto</span><span>Status</span><span>Duração</span><span class="vrow__wide">Formato</span><span class="vrow__wide">Custo</span><span>Criado em</span></div>
      <p class="library__empty" data-library-empty hidden>Nenhum vídeo com esse filtro.</p>
      <div class="library__groups" data-groups>${[...groups].map(section).join("")}</div>
    </div>`;
}

/** Fim do painel de configuração: duração e custo estimados e o botão de gerar, na largura toda. */
function generateBar(seconds: string, cost: number | undefined, enabled: boolean): string {
  const costLabel = cost !== undefined ? `US$ ${cost.toFixed(2)}` : "—";
  return `
      <div class="pane__footer">
        <div class="estimate-list">
          <div class="estimate-list__item"><span class="icon">schedule</span><span class="estimate-list__label">Duração</span><span class="estimate-list__value" data-seconds>${esc(seconds)}</span></div>
          <div class="estimate-list__item"><span class="icon">payments</span><span class="estimate-list__label">Custo estimado</span><span class="estimate-list__value" data-cost>${costLabel}</span></div>
        </div>
        <button class="button button--filled interactive" type="submit"${enabled ? "" : " disabled"}><span class="icon">send</span>Gerar vídeo</button>
      </div>`;
}

function emptyState(icon: string, title: string, text: string): string {
  return `<div class="empty"><span class="icon">${icon}</span><p class="empty__title">${esc(title)}</p><p>${esc(text)}</p></div>`;
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
          <textarea class="text-field__input" id="${f.name}" name="${f.name}" rows="1" required maxlength="${f.maxLength}" placeholder="${esc(f.placeholder)}" aria-describedby="${f.name}-ajuda"${f.speech ? " data-speech" : ""}>${esc(value(f.name))}</textarea>
          <label class="text-field__label" for="${f.name}">${esc(f.label)}</label>
          <p class="text-field__supporting" id="${f.name}-ajuda"><span${f.speech ? ` data-words data-default="${esc(f.supporting)}"` : ""}>${esc(f.supporting)}</span><span data-count>${value(f.name).length}/${f.maxLength}</span></p>
        </div>`;
    case "text":
      return `<div class="text-field">
          <textarea class="text-field__input" id="${f.name}" name="${f.name}" rows="1" maxlength="${f.maxLength}" placeholder="${esc(f.placeholder)}" aria-describedby="${f.name}-ajuda">${esc(value(f.name))}</textarea>
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
      return `<label class="file-picker interactive" title="JPG, PNG ou WebP, até ${MAX_IMAGE_BYTES / 1024 / 1024} MB">
          <input type="file" name="${f.name}" accept="image/jpeg,image/png,image/webp" aria-label="${esc(f.label)}"${f.required ? " required" : ""} data-image>
          <span class="file-picker__preview" data-preview><span class="icon">face</span></span>
          <span class="file-picker__text">
            <span class="file-picker__name" data-image-name data-empty="Adicionar ${esc(f.label.toLowerCase())}">Adicionar ${esc(f.label.toLowerCase())}</span>
            <span class="file-picker__hint" data-image-hint data-empty="${esc(f.supporting)}">${esc(f.supporting)}</span>
          </span>
          <span class="icon file-picker__trailing" data-image-trailing hidden>edit</span>
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
      <span class="top-app-bar__logo"><span class="icon">face</span></span>
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
type Bar = false | { user: User; tab: "modelos" | "videos"; search: Search } | { user: User; back: string; title: string };

function accountActions(user: User): string {
  const initial = esc((user.name.trim()[0] ?? "?").toUpperCase());
  // Sair fica só no menu do perfil.
  return `<details class="menu menu--account" data-menu>
      <summary class="avatar interactive" aria-label="Sua conta: ${esc(user.name)}" title="${esc(user.name)}">${initial}</summary>
      <div class="menu__list">
        <p class="menu__header"><span class="menu__name">${esc(user.name)}</span><span class="menu__email">${esc(user.email)}</span></p>
        <hr class="menu__divider">
        <form method="post" action="/sair"><button class="menu__item interactive" type="submit"><span class="icon">logout</span>Sair</button></form>
      </div>
    </details>`;
}

function brand(href: string, label?: string): string {
  // No M3 a marca da barra superior não é botão: sem camada de estado, só o foco do teclado.
  return `<a class="top-app-bar__brand" href="${href}"${label ? ` aria-label="${esc(label)}" title="${esc(label)}"` : ""}>
    <span class="top-app-bar__logo"><span class="icon">face</span></span>
    ${label ? "" : `<span class="top-app-bar__title">${SITE_NAME}</span>`}
  </a>`;
}

function topAppBar(bar: Exclude<Bar, false>): string {
  if ("back" in bar) {
    return `<header class="top-app-bar" data-app-bar>
  <a class="icon-button interactive" href="${bar.back}" aria-label="Voltar para Modelos" title="Voltar para Modelos"><span class="icon">arrow_back</span></a>
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
  </div>
  <div class="top-app-bar__actions">${accountActions(bar.user)}</div>
</header>`;
}

function page(title: string, body: string, opts: { refresh?: boolean; bar: Bar }): string {
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
  <script nonce="${NONCE}">${SCRIPT}</script>
</body>
</html>`;
}

/**
 * Barra que muda de cor ao rolar, snackbar, diálogo de detalhes do vídeo e, no
 * formulário: custo e duração estimados, contador da fala, explicação da opção
 * escolhida, prévia da foto e os botões que põem um texto na caixa da fala
 * (falas prontas e "Usar esta fala"). Menus dos cards e da conta, e os painéis
 * da página do modelo que se recolhem (lembrados no navegador). Com vídeo na fila,
 * atualiza a página de tempos em tempos (a prévia da edição rápida tem o seu, PREVIEW_SCRIPT).
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
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") for (const m of document.querySelectorAll("details[data-menu][open]")) { m.open = false; m.querySelector("summary").focus(); }
  });

  // Guardar escolhas no navegador (pode falhar: janela anônima, armazenamento bloqueado).
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  // Campos de seleção: o select fica escondido (é ele que vai no formulário) e um
  // botão abre um menu do M3 com as opções, igual em todos os navegadores.
  let selectN = 0;
  for (const sel of document.querySelectorAll(".text-field--select select")) {
    const n = ++selectN, label = sel.parentElement.querySelector(".text-field__label"), arrow = sel.parentElement.querySelector(".text-field__trailing");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "text-field__input"; btn.id = "selecao-" + n;
    btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    if (sel.hasAttribute("aria-describedby")) btn.setAttribute("aria-describedby", sel.getAttribute("aria-describedby"));
    const list = document.createElement("div");
    list.className = "select-menu"; list.id = "selecao-" + n + "-lista"; list.setAttribute("role", "listbox"); list.popover = "auto";
    list.setAttribute("aria-labelledby", btn.id);
    btn.setAttribute("aria-controls", list.id);
    for (const o of sel.options) {
      const item = document.createElement("div");
      item.className = "select-menu__item interactive"; item.setAttribute("role", "option"); item.tabIndex = -1;
      item.dataset.value = o.value; item.textContent = o.textContent;
      list.append(item);
    }
    sel.classList.add("visually-hidden"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    sel.after(btn); document.body.append(list);
    if (label) { label.htmlFor = btn.id; label.id = btn.id + "-rotulo"; btn.setAttribute("aria-labelledby", label.id + " " + btn.id); }
    const items = [...list.children];
    const sync = () => {
      btn.textContent = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : "";
      for (const i of items) i.setAttribute("aria-selected", String(i.dataset.value === sel.value));
    };
    const place = () => {
      const r = btn.getBoundingClientRect(), h = list.offsetHeight, below = innerHeight - r.bottom - 8;
      list.style.left = r.left + "px"; list.style.width = r.width + "px";
      list.style.top = (below < h && r.top > below ? Math.max(8, r.top - 4 - h) : r.bottom + 4) + "px";
    };
    const open = (focusLast) => {
      list.showPopover(); place();
      const cur = items.find((i) => i.dataset.value === sel.value) || items[0];
      (focusLast ? items[items.length - 1] : cur).focus();
    };
    const choose = (item) => {
      if (sel.value !== item.dataset.value) { sel.value = item.dataset.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
      sync(); list.hidePopover(); btn.focus();
    };
    btn.addEventListener("click", () => (list.matches(":popover-open") ? list.hidePopover() : open(false)));
    btn.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); open(e.key === "ArrowUp"); }
    });
    list.addEventListener("click", (e) => { const item = e.target.closest("[role=option]"); if (item) choose(item); });
    list.addEventListener("keydown", (e) => {
      const at = items.indexOf(document.activeElement);
      const go = { ArrowDown: Math.min(at + 1, items.length - 1), ArrowUp: Math.max(at - 1, 0), Home: 0, End: items.length - 1 }[e.key];
      if (go !== undefined) { e.preventDefault(); items[go].focus(); }
      else if ((e.key === "Enter" || e.key === " ") && at >= 0) { e.preventDefault(); choose(items[at]); }
      else if (e.key === "Escape") { e.preventDefault(); list.hidePopover(); btn.focus(); }
      else if (e.key === "Tab") list.hidePopover();
    });
    list.addEventListener("toggle", (e) => {
      const isOpen = e.newState === "open";
      btn.setAttribute("aria-expanded", String(isOpen)); btn.classList.toggle("is-open", isOpen);
      if (arrow) arrow.textContent = isOpen ? "arrow_drop_up" : "arrow_drop_down";
    });
    // Rolar a página ou o painel com o menu aberto: fecha, para ele não ficar solto.
    addEventListener("scroll", (e) => { if (list.matches(":popover-open") && !list.contains(e.target)) list.hidePopover(); }, true);
    addEventListener("resize", () => { if (list.matches(":popover-open")) list.hidePopover(); });
    sel.addEventListener("change", sync);
    sync();
  }

  // Campos de texto que crescem com o texto (a fala, o movimento): a altura acompanha o conteúdo.
  for (const t of document.querySelectorAll("textarea.text-field__input")) {
    const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + (t.offsetHeight - t.clientHeight) + "px"; };
    t.addEventListener("input", fit);
    fit();
  }

  // Miniaturas: o vídeo só baixa quando aparece na tela (a vista escondida não baixa nada).
  const thumbs = document.querySelectorAll("video[data-src]");
  if (thumbs.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        const v = e.target;
        // Com o src posto depois, o navegador decodifica o quadro mas nem sempre o desenha: ir ao quadro garante.
        v.addEventListener("loadeddata", () => { v.currentTime = 0.5; }, { once: true });
        v.src = v.dataset.src; v.removeAttribute("data-src"); io.unobserve(v);
      }
    }, { rootMargin: "200px" });
    thumbs.forEach((t) => io.observe(t));
  }

  // Lista de vídeos do modelo: filtro por status, ordem (grupos e itens) e vista (cards ou detalhes).
  const lib = document.querySelector("[data-library]");
  if (lib && lib.querySelector("[data-groups]")) {
    const groups = lib.querySelector("[data-groups]"), count = lib.querySelector("[data-library-count]"), empty = lib.querySelector("[data-library-empty]");
    const apply = () => {
      const kind = lib.querySelector("[data-filter][aria-pressed=true]").dataset.filter;
      let total = 0;
      for (const g of groups.children) {
        let n = 0;
        for (const list of g.querySelectorAll("[data-items]")) for (const it of list.children) { const show = !kind || it.dataset.kind === kind; it.hidden = !show; if (show) n++; }
        g.hidden = n === 0; total += n / 2;
      }
      count.textContent = total; empty.hidden = total > 0;
    };
    for (const c of lib.querySelectorAll("[data-filter]")) c.addEventListener("click", () => {
      for (const o of lib.querySelectorAll("[data-filter]")) o.setAttribute("aria-pressed", String(o === c));
      apply();
    });
    const sort = lib.querySelector("[data-sort]");
    sort.addEventListener("click", () => {
      groups.append(...[...groups.children].reverse());
      for (const list of groups.querySelectorAll("[data-items]")) list.append(...[...list.children].reverse());
      const label = sort.querySelector("[data-sort-label]"), recent = label.textContent === "Mais recentes";
      label.textContent = recent ? "Mais antigos" : "Mais recentes";
      sort.setAttribute("aria-label", recent ? "Ordem: mais antigos primeiro" : "Ordem: mais recentes primeiro");
    });
    const grouping = lib.querySelector("[data-group-toggle]");
    grouping.addEventListener("click", () => {
      const on = grouping.getAttribute("aria-pressed") !== "true";
      grouping.setAttribute("aria-pressed", String(on));
      lib.dataset.grouped = String(on);
    });
    for (const b of lib.querySelectorAll("button[data-view]")) b.addEventListener("click", () => {
      for (const o of lib.querySelectorAll("button[data-view]")) o.toggleAttribute("aria-current", o === b);
      lib.dataset.view = b.dataset.view;
    });
    // Guarda a escolha a cada toque e a refaz ao abrir a página (do mesmo modelo, neste navegador).
    const key = "lista-" + lib.dataset.library;
    const save = () => store.set(key, JSON.stringify({
      view: lib.dataset.view,
      filter: lib.querySelector("[data-filter][aria-pressed=true]").dataset.filter,
      old: sort.querySelector("[data-sort-label]").textContent !== "Mais recentes",
      grouped: lib.dataset.grouped === "true",
    }));
    let saved = null;
    try { saved = JSON.parse(store.get(key) || "null"); } catch {}
    if (saved) {
      const pick = (sel) => { const b = lib.querySelector(sel); if (b) b.click(); };
      pick('button[data-view="' + saved.view + '"]');
      pick('[data-filter="' + saved.filter + '"]');
      if (saved.old) sort.click();
      if (saved.grouped) grouping.click();
    }
    lib.addEventListener("click", (e) => { if (e.target.closest("[data-view], [data-filter], [data-sort], [data-group-toggle]")) save(); });
  }

  // Abrir um vídeo da lista: guarda a ordem que está na tela (com filtro e ordem) para o anterior e o próximo.
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element && e.target.closest("a[data-video]");
    if (!a) return;
    const list = [...document.querySelectorAll("a[data-video]")].filter((x) => x.offsetParent && x.className === a.className);
    try { sessionStorage.setItem("videos-abertos", JSON.stringify({ ids: list.map((x) => x.dataset.video), de: new URL(a.href).searchParams.get("de") || "" })); } catch {}
  });

  // Página do vídeo: anterior e próximo (setas e teclado), abas da folha e copiar o texto.
  const viewer = document.querySelector("[data-viewer]");
  if (viewer) {
    let opened = null;
    try { opened = JSON.parse(sessionStorage.getItem("videos-abertos") || "null"); } catch {}
    const ids = opened ? opened.ids : [], at = ids.indexOf(viewer.dataset.viewer);
    const link = (id) => "/video/" + id + (opened && opened.de ? "?de=" + encodeURIComponent(opened.de) : "");
    const prev = document.querySelector('[data-nav="prev"]'), next = document.querySelector('[data-nav="next"]');
    if (at > 0) { prev.href = link(ids[at - 1]); prev.hidden = false; }
    if (at >= 0 && at < ids.length - 1) { next.href = link(ids[at + 1]); next.hidden = false; }
    addEventListener("keydown", (e) => {
      if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft" && !prev.hidden) location.href = prev.href;
      if (e.key === "ArrowRight" && !next.hidden) location.href = next.href;
      if (e.key === "Escape" && !document.querySelector("details[data-menu][open]")) location.href = viewer.dataset.back;
    });
    const tabs = viewer.querySelectorAll("[data-tab]"), info = viewer.querySelector('[data-tab-panel="info"]'), qe = viewer.querySelector("[data-quick-edit]");
    for (const t of tabs) t.addEventListener("click", () => {
      const isQe = t.dataset.tab === "qe";
      for (const o of tabs) o.setAttribute("aria-selected", String(o === t));
      info.hidden = isQe;
      if (isQe && qe.hidden) viewer.querySelector("[data-qe-open]").click();
      if (!isQe && !qe.hidden) qe.querySelector("[data-qe-close]").click();
    });
    if (qe) qe.querySelector("[data-qe-close]").addEventListener("click", () => { for (const o of tabs) o.setAttribute("aria-selected", String(o.dataset.tab === "info")); info.hidden = false; });
    // "Tocar prévia" na folha: o mesmo botão de tocar do player, espelhado (ícone, texto e se está ligado).
    const preview = viewer.querySelector("[data-qe-preview]"), play = document.querySelector("[data-qe-play]");
    if (preview && play) {
      const mirror = () => {
        const on = play.querySelector(".icon").textContent === "pause";
        preview.disabled = play.disabled;
        preview.firstElementChild.textContent = on ? "pause" : "play_arrow";
        preview.lastElementChild.textContent = on ? "Pausar prévia" : "Tocar prévia";
      };
      new MutationObserver(mirror).observe(play, { attributes: true, subtree: true, childList: true, characterData: true });
      preview.addEventListener("click", () => play.click());
      mirror();
    }
    // Barra do player (peças do M3: botão de ícone cheio, slider, tempo e botões de ícone).
    // Na prévia da edição rápida, o tocar comanda a prévia e o tempo é o dela; o slider fica parado.
    const bar = document.querySelector("[data-vbar]"), video = document.querySelector(".viewer__player video");
    if (bar && video) {
      const stage = document.querySelector(".viewer__player"), frame = stage.querySelector(".player__frame");
      const playBtn = bar.querySelector("[data-vbar-play]"), time = bar.querySelector("[data-vbar-time]"), seek = bar.querySelector("[data-vbar-seek]");
      const mute = bar.querySelector("[data-vbar-mute]"), full = bar.querySelector("[data-vbar-full]");
      const qePlay = document.querySelector("[data-qe-play]"), qeTime = document.querySelector("[data-qe-time]");
      const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
      const previewing = () => stage.classList.contains("is-previewing");
      const setIcon = (b, icon, label) => { b.querySelector(".icon").textContent = icon; b.setAttribute("aria-label", label); b.title = label; };
      const sync = () => {
        if (previewing()) {
          const on = qePlay && qePlay.querySelector(".icon").textContent === "pause";
          setIcon(playBtn, on ? "pause" : "play_arrow", on ? "Pausar a prévia" : "Tocar a prévia");
          // O tempo da prévia vem como "0,5 s / 6,0 s": vira o mesmo formato do vídeo (0:00 / 0:06).
          const n = qeTime ? (qeTime.textContent.match(/[\\d,]+/g) || []).map((x) => Number(x.replace(",", "."))) : [];
          time.textContent = n.length === 2 ? clock(n[0]) + " / " + clock(n[1]) : "";
          seek.disabled = true; bar.classList.add("is-preview");
          return;
        }
        bar.classList.remove("is-preview"); seek.disabled = false;
        setIcon(playBtn, video.paused ? "play_arrow" : "pause", video.paused ? "Tocar" : "Pausar");
        const d = video.duration || 0, p = d ? video.currentTime / d : 0;
        if (document.activeElement !== seek) seek.value = String(Math.round(p * 1000));
        seek.style.setProperty("--p", (Number(seek.value) / 10) + "%");
        time.textContent = clock(video.currentTime) + " / " + clock(d);
      };
      const toggle = () => { if (previewing()) { if (qePlay) qePlay.click(); } else if (video.paused) video.play().catch(() => {}); else video.pause(); };
      playBtn.addEventListener("click", toggle);
      video.addEventListener("click", toggle);
      for (const ev of ["play", "pause", "timeupdate", "loadedmetadata", "ended", "seeked"]) video.addEventListener(ev, sync);
      seek.addEventListener("input", () => { if (video.duration) video.currentTime = (Number(seek.value) / 1000) * video.duration; seek.style.setProperty("--p", (Number(seek.value) / 10) + "%"); });
      mute.addEventListener("click", () => { video.muted = !video.muted; setIcon(mute, video.muted ? "volume_off" : "volume_up", video.muted ? "Ligar o som" : "Tirar o som"); });
      full.addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen() : frame.requestFullscreen && frame.requestFullscreen()).catch?.(() => {}));
      document.addEventListener("fullscreenchange", () => setIcon(full, document.fullscreenElement ? "fullscreen_exit" : "fullscreen", document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia"));
      addEventListener("keydown", (e) => { if (e.key === " " && !(e.target.closest && e.target.closest("input, textarea, select, button, a, summary"))) { e.preventDefault(); toggle(); } });
      new MutationObserver(sync).observe(stage, { attributes: true, attributeFilter: ["class"] });
      if (qePlay) new MutationObserver(sync).observe(qePlay, { subtree: true, childList: true, characterData: true });
      if (qeTime) new MutationObserver(sync).observe(qeTime, { subtree: true, childList: true, characterData: true });
      sync();
    }

    for (const c of viewer.querySelectorAll("[data-copy]")) c.addEventListener("click", async () => {
      const label = c.lastElementChild;
      try { await navigator.clipboard.writeText(c.dataset.copy); label.textContent = "Copiado"; setTimeout(() => (label.textContent = "Copiar"), 2000); } catch {}
    });
  }

  const f = document.querySelector("[data-composer]");
  let dirty = false;
  if (f) {
    f.addEventListener("input", () => { dirty = true; });
    const cfg = JSON.parse(f.dataset.composer);
    const val = (name) => (f.elements[name] ? f.elements[name].value || "" : "");
    const speech = f.querySelector("[data-speech]");
    const words = f.querySelector("[data-words]"), count = f.querySelector("[data-count]");
    const rate = cfg.rate, mid = (rate.min + rate.max) / 2;
    const update = () => {
      const n = speech.value.split(/\\s+/).filter(Boolean).length;
      const fixed = cfg.seconds.field ? Number(val(cfg.seconds.field)) : 0;
      const s = fixed || (n ? Math.max(1, Math.round(n / mid)) : 0);
      const price = Number(cfg.prices[cfg.sku.replace(/\\{(\\w+)\\}/g, (_, k) => val(k))]);
      for (const e of f.querySelectorAll("[data-seconds]")) e.textContent = s ? (fixed ? "" : "≈ ") + s + " s" : "—";
      for (const e of f.querySelectorAll("[data-cost]")) e.textContent = price && s ? "US$ " + (price * s).toFixed(2) : "—";
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

    const image = f.querySelector("[data-image]"), preview = f.querySelector("[data-preview]"), name = f.querySelector("[data-image-name]"), hint = f.querySelector("[data-image-hint]");
    if (image) image.addEventListener("change", () => {
      const file = image.files[0];
      name.textContent = file ? file.name : name.dataset.empty;
      hint.textContent = file ? "Trocar foto" : hint.dataset.empty;
      f.querySelector("[data-image-trailing]").hidden = !file;
      preview.innerHTML = file ? '<img alt="">' : '<span class="icon">face</span>';
      if (file) preview.firstChild.src = URL.createObjectURL(file);
    });

    f.addEventListener("submit", () => { f.querySelector("[type=submit]").disabled = true; });
  }

  // Vídeo na fila: confere de novo de tempos em tempos, sem perder o que está sendo
  // escrito, sem fechar um diálogo aberto e sem cortar um vídeo que está tocando.
  const refresh = Number(document.body.dataset.refresh);
  // Confere a página em segundo plano e só recarrega quando o status de algum vídeo mudou:
  // sem a página piscando a cada rodada e sem perder o filtro e a vista escolhidos.
  const signature = (doc) => [...doc.querySelectorAll("[data-kind][data-video], .status-line")].map((e) => (e.dataset.video || "") + ":" + (e.dataset.kind || e.textContent)).join(",");
  if (refresh) setInterval(async () => {
    const playing = [...document.querySelectorAll("video")].some((v) => !v.paused);
    if (dirty || playing || document.querySelector(".is-previewing")) return;
    try {
      const res = await fetch(location.href, { headers: { accept: "text/html" } });
      const next = new DOMParser().parseFromString(await res.text(), "text/html");
      if (signature(next) !== signature(document)) location.reload();
    } catch {}
  }, refresh * 1000);
})();`;

/**
 * Prévia da edição rápida (só nas páginas com o botão). O navegador baixa o MP4
 * uma vez: o áudio vira um AudioBuffer (para achar os silêncios e tocar os
 * trechos emendados) e o vídeo é decodificado em ordem, do começo, pelo
 * WebCodecs: um leitor de MP4 pequeno tira as amostras H.264 e o VideoDecoder
 * devolve os quadros; os das pausas cortadas são descartados logo, os outros
 * vão para um canvas no tempo do relógio do som, com o mesmo recorte de zoom
 * do contêiner. Nada de pular o vídeo de um ponto a outro (o HeyGen tem um
 * quadro-chave a cada 10 s): é o que deixa a prévia fluida também no iPhone.
 */
const PREVIEW_SCRIPT = `(() => {
  const planParts = ${String(planParts)};
  const qe = document.querySelector("[data-quick-edit]");
  if (!qe) return;
  const cfg = JSON.parse(qe.dataset.quickEdit), R = cfg.rules;
  const player = document.querySelector("[data-player]"), main = player.querySelector("video");
  const controls = player.querySelector("[data-qe-controls]"), play = controls.querySelector("[data-qe-play]"), clock = controls.querySelector("[data-qe-time]");
  const opener = document.querySelector("[data-qe-open]"), summary = qe.querySelector("[data-qe-summary]"), input = qe.querySelector("[data-qe-parts]");
  const form = document.getElementById("edicao-rapida");
  const fmt = (s) => s.toFixed(1).replace(".", ",") + " s";
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };

  // --- MP4: a faixa de vídeo H.264 (avc1), com as amostras na ordem de decodificação.
  const demux = (bytes) => {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const boxes = (s, e) => {
      const out = {};
      for (let o = s; o + 8 <= e;) {
        let size = dv.getUint32(o), h = 8;
        const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
        if (size === 1) { size = Number(dv.getBigUint64(o + 8)); h = 16; } else if (size === 0) size = e - o;
        if (size < h) break;
        (out[type] = out[type] || []).push({ s: o + h, e: o + size });
        o += size;
      }
      return out;
    };
    const one = (b, path) => path.split(".").reduce((x, t) => x && (boxes(x.s, x.e)[t] || [])[0], b);
    const moov = boxes(0, bytes.byteLength).moov[0];
    for (const trak of boxes(moov.s, moov.e).trak) {
      const hdlr = one(trak, "mdia.hdlr");
      if (String.fromCharCode(...bytes.subarray(hdlr.s + 8, hdlr.s + 12)) !== "vide") continue;
      const mdhd = one(trak, "mdia.mdhd"), scale = dv.getUint32(mdhd.s + (bytes[mdhd.s] === 1 ? 20 : 12));
      // Lista de edição: o primeiro trecho com mídia diz onde a exibição começa.
      let shift = 0;
      const elst = one(trak, "edts.elst");
      if (elst) {
        const v1 = bytes[elst.s] === 1;
        for (let i = 0, n = dv.getUint32(elst.s + 4); i < n; i++) {
          const at = elst.s + 8 + i * (v1 ? 20 : 12), t = v1 ? Number(dv.getBigInt64(at + 8)) : dv.getInt32(at + 4);
          if (t >= 0) { shift = t; break; }
        }
      }
      const stbl = one(trak, "mdia.minf.stbl"), k = boxes(stbl.s, stbl.e);
      const entry = k.stsd[0].s + 8, avcC = boxes(entry + 86, entry + dv.getUint32(entry)).avcC;
      if (String.fromCharCode(...bytes.subarray(entry + 4, entry + 8)) !== "avc1" || !avcC) return null;
      const desc = bytes.slice(avcC[0].s, avcC[0].e);
      const hex = (n) => n.toString(16).padStart(2, "0");
      const table = (b, w) => { const n = dv.getUint32(b.s + 4), out = []; for (let i = 0; i < n; i++) out.push(w(b.s + 8 + i)); return out; };
      const n = dv.getUint32(k.stsz[0].s + 8), fixed = dv.getUint32(k.stsz[0].s + 4);
      const sizes = Array.from({ length: n }, (_, i) => fixed || dv.getUint32(k.stsz[0].s + 12 + i * 4));
      const dts = [], dur = [];
      let t = 0;
      for (const [c, d] of table(k.stts[0], (o) => o).map((_, i) => [dv.getUint32(k.stts[0].s + 8 + i * 8), dv.getUint32(k.stts[0].s + 12 + i * 8)])) for (let j = 0; j < c; j++) { dts.push(t); dur.push(d); t += d; }
      const cts = new Array(n).fill(0);
      if (k.ctts) { let i = 0; const b = k.ctts[0]; for (let e = 0, m = dv.getUint32(b.s + 4); e < m; e++) { const c = dv.getUint32(b.s + 8 + e * 8), off = dv.getInt32(b.s + 12 + e * 8); for (let j = 0; j < c; j++) cts[i++] = off; } }
      const keys = k.stss ? new Set(Array.from({ length: dv.getUint32(k.stss[0].s + 4) }, (_, i) => dv.getUint32(k.stss[0].s + 8 + i * 4) - 1)) : null;
      const co64 = !k.stco, cob = (k.stco || k.co64)[0], chunks = Array.from({ length: dv.getUint32(cob.s + 4) }, (_, i) => co64 ? Number(dv.getBigUint64(cob.s + 8 + i * 8)) : dv.getUint32(cob.s + 8 + i * 4));
      const stsc = k.stsc[0], runs = Array.from({ length: dv.getUint32(stsc.s + 4) }, (_, i) => [dv.getUint32(stsc.s + 8 + i * 12), dv.getUint32(stsc.s + 12 + i * 12)]);
      const samples = [];
      let s = 0;
      chunks.forEach((off, c) => {
        let per = 0;
        for (const [first, count] of runs) if (first - 1 <= c) per = count;
        for (let j = 0; j < per && s < n; j++, s++) {
          samples.push({ data: bytes.subarray(off, off + sizes[s]), key: keys ? keys.has(s) : true, ts: Math.round(((dts[s] + cts[s] - shift) / scale) * 1e6), dur: Math.round((dur[s] / scale) * 1e6) });
          off += sizes[s];
        }
      });
      return { codec: "avc1." + hex(desc[1]) + hex(desc[2]) + hex(desc[3]), description: desc, width: dv.getUint16(entry + 32), height: dv.getUint16(entry + 34), samples };
    }
    return null;
  };

  // --- Estado: o áudio, o vídeo lido, os trechos e a reprodução.
  let actx = null, buf = null, silences = null, track = null, canvas = null, g2d = null, face = { x: R.eyesX, y: R.eyesY };
  let parts = [], starts = [], total = 0, run = null, raf = 0;
  let decoder = null, next = 0, flushed = false, frames = [], drawn = false;

  const findSilences = () => {
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
  // O trecho (índice) que tem o instante t do original, ou -1 se ele foi cortado.
  const partAt = (t) => { for (let i = 0; i < parts.length; i++) if (t >= parts[i][0] - 0.02 && t < parts[i][1] + 0.02) return i; return -1; };

  // Decodifica em ordem; os quadros das pausas cortadas saem e já são fechados. Ficam
  // poucos quadros prontos na frente: o decodificador do celular tem poucos para emprestar
  // e para se muitos ficam abertos (por isso o desenhado também é fechado na hora).
  const feed = () => {
    while (decoder && decoder.state === "configured" && next < track.samples.length && decoder.decodeQueueSize < 4 && frames.length < 6) {
      const s = track.samples[next++];
      decoder.decode(new EncodedVideoChunk({ type: s.key ? "key" : "delta", timestamp: s.ts, duration: s.dur, data: s.data }));
    }
    if (decoder && next >= track.samples.length && !flushed) { flushed = true; quiet(decoder.flush()); }
  };
  // O zoom amplia em torno do ponto entre os olhos (achado no contêiner): ele fica no mesmo
  // lugar da tela no aberto e com zoom, o mesmo recorte do editar.py. É uma transformação
  // do canvas sobre o quadro inteiro, não um recorte no drawImage: o Safari (e todo
  // navegador do iPhone) ignora o recorte com VideoFrame.
  const draw = (f) => {
    drawn = true;
    const z = f.z, w = canvas.width, h = canvas.height, cw = w / z, ch = h / z;
    const x = face.x * (w - cw), y = face.y * (h - ch);
    g2d.setTransform(z, 0, 0, z, -x * z, -y * z);
    g2d.drawImage(f.frame, 0, 0, w, h);
    g2d.setTransform(1, 0, 0, 1, 0, 0);
  };
  const restart = () => {
    if (decoder && decoder.state !== "closed") decoder.close();
    for (const f of frames) f.frame.close();
    frames = []; drawn = false; next = 0; flushed = false;
    decoder = new VideoDecoder({
      output: (frame) => {
        const t = frame.timestamp / 1e6, i = partAt(t);
        if (i < 0) frame.close();
        else {
          frames.push({ frame, t, z: parts[i][2] });
          if (!run && !drawn) draw(frames[0]);
        }
        feed();
      },
      error: () => { summary.textContent = "A prévia falhou neste navegador. O vídeo editado sai com as escolhas abaixo."; },
    });
    decoder.configure({ codec: track.codec, description: track.description, codedWidth: track.width, codedHeight: track.height });
    feed();
  };

  const setPlaying = (on) => {
    play.querySelector(".icon").textContent = on ? "pause" : "play_arrow";
    play.setAttribute("aria-label", on ? "Pausar a prévia" : "Tocar a prévia");
    play.title = play.getAttribute("aria-label");
  };
  const help = () => {
    for (const p of qe.querySelectorAll("[data-help-for]")) {
      const checked = [...form.elements[p.dataset.helpFor]].find((r) => r.checked);
      p.textContent = (checked && checked.dataset.description) || "";
    }
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    if (run) for (const s of run.sources) try { s.stop(); } catch {}
    run = null;
    setPlaying(false);
  };
  const build = () => {
    stop();
    const duration = buf.duration;
    parts = planParts(silences, duration, cfg.pauses[form.elements.pausa.value], cfg.cameras[form.elements.camera.value], R);
    const shots = parts.filter((p, i) => i > 0 && p[2] !== parts[i - 1][2]).length;
    starts = []; total = 0;
    for (const p of parts) { starts.push(total); total += p[1] - p[0]; }
    input.value = parts.length ? JSON.stringify(parts) : "";
    if (parts.length) {
      // O resultado num card: título e uma linha por número (ícone, rótulo e valor).
      const cuts = parts.length - 1, saved = duration - total;
      const row = (icon, label, value) => {
        const el = document.createElement("div"); el.className = "qe-result__row";
        const i = document.createElement("span"); i.className = "icon"; i.textContent = icon;
        const l = document.createElement("span"); l.className = "qe-result__label"; l.textContent = label;
        const v = document.createElement("span"); v.className = "qe-result__value"; v.textContent = value;
        el.append(i, l, v); return el;
      };
      const title = document.createElement("p"); title.className = "qe-result__title"; title.textContent = "Resultado da edição";
      summary.replaceChildren(
        title,
        row("content_cut", "Cortes nas pausas", cuts ? String(cuts) : "Nenhum"),
        row("videocam", "Trocas de câmera", shots ? String(shots) : "Nenhuma"),
        row("schedule", "Duração", fmt(total) + (saved >= 0.05 ? " · " + fmt(saved) + " a menos" : " · sem mudança")),
      );
    } else summary.textContent = "Não encontramos fala no áudio deste vídeo, então não há pausas para cortar.";
    play.disabled = !parts.length || !track;
    clock.textContent = fmt(0) + " / " + fmt(total);
    help();
    if (track && parts.length) restart();
  };

  // Toca do começo: os trechos do áudio emendados, com 5 ms de fade nas pontas (o corte não estala).
  const start = () => {
    const t0 = actx.currentTime + 0.1, sources = [];
    parts.forEach((p, i) => {
      const at = t0 + starts[i], d = p[1] - p[0], src = actx.createBufferSource(), g = actx.createGain();
      src.buffer = buf; src.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.005);
      g.gain.setValueAtTime(1, at + d - 0.005); g.gain.linearRampToValueAtTime(0, at + d);
      src.start(at, p[0], d);
      sources.push(src);
    });
    run = { t0, sources, paused: false };
    setPlaying(true);
    raf = requestAnimationFrame(tick);
  };
  const tick = () => {
    if (!run || run.paused) return;
    const t = actx.currentTime - run.t0;
    if (t >= total) { stop(); restart(); clock.textContent = fmt(0) + " / " + fmt(total); return; }
    if (t >= 0) {
      let k = 0;
      while (k + 1 < parts.length && t >= starts[k + 1]) k++;
      const at = parts[k][0] + (t - starts[k]);
      // O quadro da vez: o mais novo que já devia aparecer; vai para o canvas e é fechado.
      let due = null;
      while (frames.length && frames[0].t <= at + 0.02) { if (due) due.frame.close(); due = frames.shift(); }
      if (due) { draw(due); due.frame.close(); }
      clock.textContent = fmt(Math.min(t, total)) + " / " + fmt(total);
    }
    feed();
    raf = requestAnimationFrame(tick);
  };
  const toggle = () => {
    if (qe.hidden || !parts.length || !track) return;
    quiet(actx.resume());
    if (!run) return start();
    run.paused = !run.paused;
    if (run.paused) { quiet(actx.suspend()); cancelAnimationFrame(raf); }
    else raf = requestAnimationFrame(tick);
    setPlaying(!run.paused);
  };
  player.addEventListener("click", (e) => { if (!qe.hidden && e.target === canvas) toggle(); });
  play.addEventListener("click", toggle);

  opener.addEventListener("click", async () => {
    qe.hidden = false; opener.hidden = true; controls.hidden = false;
    player.classList.add("is-previewing");
    // O som da prévia sai pelo Web Audio: no iPhone, assim ele toca mesmo com o modo silencioso.
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
    main.pause();
    if (canvas) canvas.hidden = false;
    help();
    qe.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (silences) return build();
    summary.textContent = "Analisando o vídeo…";
    play.disabled = true;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      // O rosto vem junto (o contêiner acha na primeira vez); sem ele, o padrão.
      const found = fetch(cfg.face).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      const bytes = new Uint8Array(await (await fetch(cfg.src)).arrayBuffer());
      // Na primeira vez o contêiner pode estar subindo: espera o rosto até 6 s e segue
      // com o padrão; se ele chegar depois, o zoom passa a mirar nele.
      const useFace = (f) => { if (f && typeof f.x === "number" && typeof f.y === "number") face = { x: f.x, y: f.y }; };
      found.then(useFace);
      await Promise.race([found, new Promise((ok) => setTimeout(ok, 6000))]);
      // decodeAudioData fica com o buffer: vai uma cópia.
      buf = await actx.decodeAudioData(bytes.slice().buffer);
      silences = findSilences();
      try {
        const t = typeof VideoDecoder === "function" ? demux(bytes) : null;
        const ok = t && (await VideoDecoder.isConfigSupported({ codec: t.codec, description: t.description, codedWidth: t.width, codedHeight: t.height })).supported;
        if (ok) {
          track = t;
          canvas = document.createElement("canvas");
          canvas.className = "player__canvas";
          canvas.width = t.width; canvas.height = t.height;
          g2d = canvas.getContext("2d");
          main.after(canvas);
        }
      } catch {}
      build();
      if (!track) { const note = document.createElement("p"); note.className = "qe-result__note"; note.textContent = "Este navegador não mostra a prévia, mas o vídeo editado sai com as escolhas abaixo."; summary.append(note); }
    } catch {
      summary.textContent = "Não deu para analisar o vídeo neste navegador. O vídeo editado sai com as escolhas abaixo, sem prévia.";
    }
  });
  qe.querySelector("[data-qe-close]").addEventListener("click", () => {
    stop();
    if (decoder && decoder.state !== "closed") decoder.close();
    for (const f of frames) f.frame.close();
    frames = []; drawn = false; decoder = null;
    if (canvas) canvas.hidden = true;
    qe.hidden = true; opener.hidden = false; controls.hidden = true;
    player.classList.remove("is-previewing");
  });
  qe.addEventListener("change", () => { help(); if (silences) build(); });
  form.addEventListener("submit", () => { qe.querySelector("[type=submit]").disabled = true; });
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
