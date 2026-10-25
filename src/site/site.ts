/**
 * O estúdio: páginas em HTML montado no Worker, com CSS e um script pequeno
 * embutidos (o mesmo jeito do blog do anb.bot), no Material Design 3.
 *
 *   /cadastro    cria a primeira conta, que é a do administrador; depois fecha
 *   /entrar      login (e-mail e senha)
 *   /sair        encerra a sessão (POST)
 *   /            os vídeos (precisa de sessão), com o botão de novo vídeo
 *   /novo        escolha do modelo, um cartão por estrutura (src/structures/)
 *   /novo/<id>   o formulário da estrutura; o POST gera o vídeo
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
import { canUse, type Defaults, estimate, type Field, lowestPrice, type Section, STRUCTURES, structureById, type Structure, type Values } from "../structures";
import { ForbiddenError, InputError, MAX_IMAGE_BYTES, type Studio } from "../studio";
import { CSS } from "./style";
import { DARK, LIGHT } from "./theme";

export interface SiteConfig {
  /** Padrões do formulário (wrangler.jsonc). */
  defaults: Defaults;
}

const SITE_NAME = "meu.avatar";
export const SESSION_COOKIE = "__Host-sessao";
/** Enquanto há vídeo na fila, a página confere de novo a cada tantos segundos. */
const REFRESH_SECONDS = 20;

/** Ícones usados (Material Symbols); a fonte só baixa esses. */
const ICONS = [
  "add", "add_photo_alternate", "arrow_back", "arrow_drop_down", "check", "check_circle", "close", "download", "error", "face", "graphic_eq", "hourglass_top", "lock", "logout", "person_add",
  "movie", "schedule", "send", "videocam",
];

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

    if (!post && path === "/") return this.home(user);
    if (!post && path === "/novo") return this.chooser(user);
    const form = /^\/novo\/([a-z0-9-]+)$/.exec(path);
    if (form) {
      // Estrutura que não existe ou que a pessoa não pode usar: a página nem aparece.
      const structure = structureById(form[1]);
      if (!structure || !canUse(structure, user.role)) return new Response("não encontrado", { status: 404 });
      return post ? this.createVideo(request, user, structure) : this.formPage(structure);
    }

    // /videos/<id>.mp4: o áudio tratado, se já houver; /videos/<id>.original.mp4: como veio do modelo.
    const file = /^\/videos\/([0-9a-f-]{36})(\.original)?\.mp4$/.exec(path);
    if (request.method === "GET" && file) {
      const video = await this.db.videoById(file[1]!);
      const original = Boolean(file[2]);
      const key = original ? video?.video_key : (video?.processed_key ?? video?.video_key);
      if (!video || !key) return new Response("não encontrado", { status: 404 });
      const name = `meu-avatar-${video.id.slice(0, 8)}${original ? "-original" : ""}.mp4`;
      return this.object(request, key, "private, max-age=86400", url.searchParams.has("baixar") ? name : undefined);
    }

    return new Response("não encontrado", { status: 404 });
  }

  private async home(user: User): Promise<Response> {
    const videos = await this.db.recentVideos();
    const waiting = videos.some((v) => cardStatus(v).kind === "busy");
    const body = `
<main class="page page--feed" id="conteudo">
  <h1 class="page__headline">Vídeos</h1>
  ${
    videos.length
      ? `<div class="feed">${videos.map(videoCard).join("")}</div>`
      : `<div class="empty"><span class="icon">movie</span><p class="empty__title">Nenhum vídeo ainda</p><p>Toque em Novo vídeo, escolha o modelo e gere o primeiro.</p></div>`
  }
</main>
<a class="extended-fab interactive" href="/novo"><span class="icon">add</span>Novo vídeo</a>`;
    return html(page(SITE_NAME, body, { refresh: waiting, bar: { user } }));
  }

  /** Escolha do modelo: um cartão por estrutura que a pessoa pode usar. */
  private async chooser(user: User): Promise<Response> {
    const structures = STRUCTURES.filter((s) => canUse(s, user.role));
    const cards = await Promise.all(
      structures.map(async (s) => {
        const model = await this.tryModel(s);
        const price = model.model ? lowestPrice(model.model) : undefined;
        const subhead = [s.model, price !== undefined ? `a partir de US$ ${price.toFixed(2)}/s` : null].filter(Boolean).join(" · ");
        return `
  <a class="card card--outlined card--action model-card interactive" href="/novo/${s.id}">
    <h2 class="model-card__headline">${esc(s.name)}</h2>
    <p class="model-card__subhead">${esc(subhead)}</p>
    <p class="model-card__text">${esc(s.summary)}</p>
    ${s.access === "admin" ? `<p class="model-card__subhead">Em teste: só o administrador vê</p>` : ""}
  </a>`;
      }),
    );
    const body = `
<main class="page" id="conteudo">
  <p class="page__intro">Escolha o modelo. Cada um tem o seu formulário.</p>
  <div class="model-grid">${cards.join("")}</div>
</main>`;
    return html(page(`Novo vídeo · ${SITE_NAME}`, body, { bar: { back: "/", title: "Novo vídeo" } }));
  }

  private async formPage(structure: Structure, values?: Values, error?: string): Promise<Response> {
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
    const body = `
<main class="page" id="conteudo">
  <form class="form-layout" method="post" action="/novo/${structure.id}" enctype="multipart/form-data" data-composer='${esc(JSON.stringify(config))}'>
    <div class="form-layout__focus">
      ${banner ? `<p class="banner" role="status"><span class="icon">error</span>${esc(banner)}</p>` : ""}
      ${sections.map((section) => formSection(section, value)).join("")}
    </div>
    <aside class="card card--outlined summary" aria-labelledby="resumo">
      <h2 class="summary__title" id="resumo">Resumo</h2>
      <dl class="summary__list">
        <div class="summary__item"><dt>Modelo</dt><dd>${esc(structure.model)}</dd></div>
        <div class="summary__item"><dt>Duração</dt><dd data-seconds>${esc(seconds)}</dd></div>
        <div class="summary__item"><dt>Custo estimado</dt><dd data-cost>${cost !== undefined ? `US$ ${cost.toFixed(2)}` : "—"}</dd></div>
      </dl>
      <div class="summary__actions">
        <button class="button button--filled interactive" type="submit"${model ? "" : " disabled"}><span class="icon">videocam</span>Gerar vídeo</button>
      </div>
    </aside>
  </form>
</main>
${error ? snackbar(error) : ""}`;
    return html(page(`${structure.name} · ${SITE_NAME}`, body, { bar: { back: "/novo", title: structure.name } }), error ? 400 : 200);
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
    try {
      await this.studio.create({ structure, values, image: image instanceof File ? image : null, user });
    } catch (err) {
      if (err instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
      if (!(err instanceof InputError)) throw err;
      return this.formPage(structure, values, err.message);
    }
    return redirect("/");
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

/** O que o cartão mostra: o status do vídeo e, depois de pronto, o do tratamento do áudio. */
function cardStatus(v: Video, now = Date.now()): { label: string; icon: string; kind: "busy" | "done" | "error" } {
  const minutes = (iso: string | null) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0);
  if (v.status === "completed" && (v.audio_status === "pending" || v.audio_status === "processing")) {
    const since = minutes(v.audio_status === "processing" ? v.audio_started_at : v.updated_at);
    return { label: `Tratando áudio · ${since} min`, icon: "graphic_eq", kind: "busy" };
  }
  const status = STATUS[v.status];
  // Na fila: quanto tempo já passou, para não parecer travado (720p leva uns 10 min).
  return status.kind === "busy" ? { ...status, label: `${status.label} · ${minutes(v.created_at)} min` } : status;
}

function videoCard(v: Video): string {
  const status = cardStatus(v);
  const structure = structureById(v.structure);
  const ratio = /^(\d+):(\d+)$/.exec(v.aspect_ratio);
  const style = [
    ratio ? `--ratio:${ratio[1]} / ${ratio[2]}` : "",
    !v.video_key && v.image_key ? `background-image:url('/midia/${esc(v.image_key)}')` : "",
  ].filter(Boolean).join(";");
  const progress = status.kind === "busy" ? `<div class="linear-progress" role="progressbar" aria-label="${esc(status.label)}"></div>` : "";
  const media = v.video_key
    ? `<video controls preload="metadata" playsinline src="/videos/${v.id}.mp4${v.processed_key ? "?tratado" : ""}"></video>${progress}`
    : `${v.image_key ? "" : `<span class="icon">${status.kind === "error" ? "error" : "movie"}</span>`}${progress}`;
  const headline = [structure?.name ?? v.model.replace(/^[^/]+\//, ""), v.style ? (styleById(v.style)?.label ?? v.style) : null].filter(Boolean).join(" · ");
  // A duração do HeyGen segue a fala: até o vídeo ficar pronto, é uma estimativa.
  const duration = structure && !("field" in structure.cost.seconds) ? `≈ ${v.duration} s` : `${v.duration} s`;
  const meta = [formatDate(v.created_at), duration, v.resolution, v.aspect_ratio, v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : null].filter(
    (m): m is string => Boolean(m),
  );
  return `
<article class="card card--elevated video-card">
  <div class="video-card__media"${style ? ` style="${style}"` : ""}>${media}</div>
  <div class="video-card__body">
    <p class="video-card__status video-card__status--${status.kind}"><span class="icon">${status.icon}</span>${esc(status.label)}</p>
    <h2 class="video-card__headline">${esc(headline)}</h2>
    <p class="video-card__subhead">${meta.map(esc).join(" · ")}</p>
    <details class="video-card__prompt"><summary class="interactive">${esc(v.prompt)}</summary>${v.extra ? `<p class="video-card__extra">${esc(v.extra)}</p>` : ""}</details>
    ${v.error ? `<p class="video-card__error">${esc(v.error)}</p>` : ""}
    ${v.audio_status === "failed" ? `<p class="video-card__error">Áudio não tratado: ${esc(v.audio_error ?? "erro desconhecido")}</p>` : ""}
  </div>
  ${
    v.video_key
      ? `<div class="video-card__actions">
    ${v.processed_key ? `<a class="button button--text interactive" href="/videos/${v.id}.original.mp4?baixar" download>Original</a>` : ""}
    <a class="button button--text interactive" href="/videos/${v.id}.mp4?baixar" download><span class="icon">download</span>Baixar MP4</a>
  </div>`
      : ""
  }
</article>`;
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
    case "segmented": {
      const selected = value(f.name);
      return `<fieldset class="segmented-field">
          <legend class="segmented-field__label">${esc(f.label)}</legend>
          <div class="segmented-button">${f.options
            .map(
              (o) => `<label class="segmented-button__segment interactive"><input type="radio" name="${f.name}" value="${esc(o.value)}"${o.value === selected ? " checked" : ""}><span class="icon segmented-button__check" aria-hidden="true">check</span><span>${esc(o.label)}</span></label>`,
            )
            .join("")}</div>
        </fieldset>`;
    }
    case "image":
      return `<label class="file-picker">
          <input type="file" name="${f.name}" accept="image/jpeg,image/png,image/webp"${f.required ? " required" : ""} data-image>
          <span class="button button--tonal interactive"><span class="icon">add_photo_alternate</span>${esc(f.label)}</span>
          <span class="file-picker__preview" data-preview><span class="icon">face</span></span>
          <span class="file-picker__text">
            <span class="file-picker__name" data-image-name data-empty="${f.required ? "Nenhuma foto" : "Opcional"}">${f.required ? "Nenhuma foto" : "Opcional"}</span>
            <span class="file-picker__hint">${esc(f.supporting)} JPG, PNG ou WebP, até ${MAX_IMAGE_BYTES / 1024 / 1024} MB.</span>
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
 * Barra superior pequena do M3: na página inicial, a marca e o botão de sair;
 * nas outras, o botão de voltar e o título da página.
 */
type Bar = false | { user: User } | { back: string; title: string };

function topAppBar(bar: Exclude<Bar, false>): string {
  if ("back" in bar) {
    return `<header class="top-app-bar top-app-bar--leading" data-app-bar>
  <a class="icon-button interactive" href="${esc(bar.back)}" aria-label="Voltar" title="Voltar"><span class="icon">arrow_back</span></a>
  <h1 class="top-app-bar__title">${esc(bar.title)}</h1>
</header>`;
  }
  return `<header class="top-app-bar" data-app-bar>
  <a class="top-app-bar__brand" href="/">
    <span class="top-app-bar__logo"><span class="icon">videocam</span></span>
    <span class="top-app-bar__title">${SITE_NAME}</span>
  </a>
  <form method="post" action="/sair"><button class="icon-button interactive" type="submit" aria-label="Sair da conta de ${esc(bar.user.name)}" title="Sair (${esc(bar.user.email)})"><span class="icon">logout</span></button></form>
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
  <footer class="footer"><div class="footer__inner"><p class="footer__text">Vídeos gerados com inteligência artificial pelo OpenRouter.</p></div></footer>
  <script nonce="${NONCE}">${SCRIPT}</script>
</body>
</html>`;
}

/**
 * Barra que muda de cor ao rolar, snackbar, e no formulário: custo e duração
 * estimados, contador da fala, explicação da opção escolhida e prévia da foto.
 * Na lista de vídeos, atualiza a fila de tempos em tempos.
 */
const SCRIPT = `(() => {
  const bar = document.querySelector("[data-app-bar]");
  if (bar) {
    const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 0);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  document.addEventListener("click", (e) => {
    const close = e.target instanceof Element && e.target.closest("[data-snackbar-close]");
    if (close) close.closest("[data-snackbar]").hidden = true;
  });

  const f = document.querySelector("[data-composer]");
  if (f) {
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
    image.addEventListener("change", () => {
      const file = image.files[0];
      name.textContent = file ? file.name : name.dataset.empty;
      preview.innerHTML = file ? '<img alt="">' : '<span class="icon">face</span>';
      if (file) preview.firstChild.src = URL.createObjectURL(file);
    });

    f.addEventListener("submit", () => { f.querySelector("[type=submit]").disabled = true; });
  }

  // Vídeo na fila: confere de novo de tempos em tempos, sem cortar um vídeo que está tocando.
  const refresh = Number(document.body.dataset.refresh);
  if (refresh) setInterval(() => {
    if (![...document.querySelectorAll("video")].some((v) => !v.paused)) location.reload();
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
