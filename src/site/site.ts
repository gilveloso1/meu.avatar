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
 * Tudo pede sessão, menos /midia/avatares/..., /midia/origens/... e
 * /midia/quadros/... (a foto, o vídeo de origem e os quadros-chave do Aleph 2),
 * que o provedor de vídeo precisa baixar. Segurança como no painel do estuda.mais: cookie __Host- (HttpOnly,
 * Secure, SameSite=Strict), todo POST precisa vir do próprio site (cabeçalho
 * Origin), páginas sem cache e sem abrir dentro de outros sites, e o script
 * da página só roda com o nonce da CSP.
 */
import { Api, API_PATH, bearerToken, PROJECT_API_PATH } from "../api";
import { handleMcp } from "../mcp";
import { type Accounts, INVITE_HOURS, PASSWORD_MAX, PASSWORD_MIN, SESSION_DAYS } from "../auth";
import type { AccountRow, AssetKind, Avatar, AvatarAsset, Db, PanelFailure, PanelStats, PanelToken, Project, User, Video, VideoStatus } from "../db";
import { type CustosExternos, type CustosApi, FRANQUIA, type Limite, type Valor } from "../custos";
import { ERROS, PARTES } from "../erros";
import { pode } from "../permissoes";
import { MAQUINAS, type MaquinasApi } from "../maquinas";
import { OpenRouterVideo, type VideoModel } from "../openrouter";
import { CAMERAS, DEFAULT_CAMERA, DEFAULT_PAUSE, PAUSES, parsePlan, planParts, RULES } from "../quickedit";
import { canUse, type Defaults, estimate, familyOf, type Field, fixedCost, makesImage, type Option, prices, type Section, STRUCTURES, structureById, type Structure, type Values, videoPlatform, videoStructure, type VoiceOption } from "../structures";
import { HEYGEN_MODEL } from "../structures/heygen-direta";
import { temSom } from "../som";
import { type Alarme, CHAVE as ALARME, LIMITE_MS } from "../vigia";
import { ForbiddenError, InputError, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, type Studio } from "../studio";
import { CANVAS_ANIMACAO, CANVAS_BODY, CANVAS_SCRIPT, CANVAS_STYLE } from "./canvas";
import { MAX_VERSOES } from "../canvas/modelo.js";
import { type ExportPlan, type Exports, fileName, zipFits } from "../exportar";
import { CSS } from "./style";
import { DARK, LIGHT } from "./theme";

export interface SiteConfig {
  /** Padrões do formulário (wrangler.jsonc). */
  defaults: Defaults;
  /** Rodando no computador (AMBIENTE=local no .dev.vars): esconde os avisos de configuração. */
  local?: boolean;
  /** O endereço do site (SITE_URL), para montar o link de convite. */
  siteUrl?: string;
}

const SITE_NAME = "Meu Avatar";
export const SESSION_COOKIE = "__Host-sessao";
/** Enquanto há vídeo na fila, a página confere de novo a cada tantos segundos. */
const REFRESH_SECONDS = 20;

/** Ícones usados (Material Symbols); a fonte só baixa esses. */
const ICONS = [
  "account_balance_wallet", "add", "animation", "apps", "arrow_back", "arrow_drop_down", "arrow_drop_up", "aspect_ratio", "auto_awesome", "bookmark_add", "calendar_today",
  "check", "check_circle", "checkroom", "chevron_left", "chevron_right", "close", "cloud", "content_copy", "content_cut", "content_paste", "control_point_duplicate",
  "crop_square", "date_range", "delete", "download", "drag_indicator", "edit", "error", "face", "fit_screen", "flag", "flowchart", "folder_open", "fullscreen", "fullscreen_exit",
  "gesture", "graphic_eq", "grid_view", "group", "hd", "history", "hourglass_top", "image", "info", "key", "layers", "link", "link_off", "lock", "logout", "memory", "mic", "monitor_heart",
  "monitoring", "more_horiz", "more_vert", "movie", "music_note", "notes", "palette", "pause", "payments", "person", "person_add", "photo_library", "play_arrow", "play_circle",
  "record_voice_over", "redo", "refresh", "remove", "replay", "schedule", "search", "send", "space_dashboard", "speed", "star", "sticky_note_2", "swap_vert", "switch_account",
  "translate", "tune", "undo", "upload", "video_library", "videocam", "view_list", "volume_off", "volume_up",
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
const PRIMARY_LIGHT = /--md-sys-color-primary: (#\w+)/.exec(LIGHT)![1];

/** Ícone da aba: o logo da barra (o símbolo "face" num quadrado primary de cantos medium), em SVG. */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="${PRIMARY_LIGHT}"/><svg x="8" y="8" width="24" height="24" viewBox="0 -960 960 960"><path fill="#fff" d="M324.5-404.5Q310-419 310-440t14.5-35.5Q339-490 360-490t35.5 14.5Q410-461 410-440t-14.5 35.5Q381-390 360-390t-35.5-14.5Zm240 0Q550-419 550-440t14.5-35.5Q579-490 600-490t35.5 14.5Q650-461 650-440t-14.5 35.5Q621-390 600-390t-35.5-14.5ZM480-160q134 0 227-93t93-227q0-24-3-46.5T786-570q-21 5-42 7.5t-44 2.5q-91 0-172-39T390-708q-32 78-91.5 135.5T160-486v6q0 134 93 227t227 93Zm0 80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-54-715q42 70 114 112.5T700-640q14 0 27-1.5t27-3.5q-42-70-114-112.5T480-800q-14 0-27 1.5t-27 3.5ZM177-581q51-29 89-75t57-103q-51 29-89 75t-57 103Zm249-214Zm-103 36Z"/></svg></svg>`;

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
    private readonly exports: Exports,
    private readonly accounts: Accounts,
    private readonly costs: CustosApi | null,
    private readonly machines: MaquinasApi | null,
    private readonly config: SiteConfig,
  ) {}

  /** O vídeo que a pessoa vê: o dela ou, com "ler:video:outros", o de outra conta (o painel leva às falhas de todos). */
  private async visibleVideo(user: User, id: string): Promise<Video | null> {
    const video = await this.db.videoById(id);
    return video && pode(user, "ler:video", video) ? video : null;
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const post = request.method === "POST";
    if (!post && request.method !== "GET" && request.method !== "HEAD") return new Response("método não permitido", { status: 405 });

    // A foto do avatar, o vídeo de origem e os quadros-chave são baixados pelo provedor de vídeo, sem login.
    if (!post && (path.startsWith("/midia/avatares/") || path.startsWith("/midia/origens/") || path.startsWith("/midia/quadros/"))) {
      return this.object(request, path.slice("/midia/".length), "public, max-age=86400");
    }

    // Ícone da aba, sem login (o navegador também pede /favicon.ico por conta própria).
    if (!post && (path === "/favicon.svg" || path === "/favicon.ico")) {
      return new Response(FAVICON, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
    }

    // Formulário de outro site tentando agir em nome de quem está logado.
    // O token fica fora do navegador (nenhum site consegue usá-lo sem ter o código), mas só abre a API.
    const bearer = bearerToken(request);
    if (bearer || API_PATH.test(path) || path === "/mcp") {
      const caller = bearer ? await this.accounts.tokenUser(bearer) : null;
      if (!caller) return Response.json({ erro: "token_invalido" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
      // Em teste, como os projetos: para os outros, nada existe.
      if (!pode(caller, "usar:api")) return Response.json({ erro: "nao_encontrado" }, { status: 404 });
      // Cada ferramenta do MCP é um pedido às rotas abaixo, com o mesmo token.
      if (path === "/mcp") return handleMcp(request, (method, to, body, headers) => this.handle(new Request(new URL(to, url), { method, body, headers: { ...headers, authorization: `Bearer ${bearer}` } })));
      if (API_PATH.test(path)) return new Api(this.db, this.media, this.exports, this.studio).handle(request, caller, path, url);
      if (PROJECT_API_PATH.test(path)) return this.projects(request, caller, path, url);
      return Response.json({ erro: "nao_encontrado" }, { status: 404 });
    }

    if (post && !sameSite(request, url)) return new Response("forbidden", { status: 403 });

    if (path === "/cadastro") return post ? this.signup(request) : this.signupPage();
    // O link de convite (ou de troca de senha), aberto sem login.
    const invite = /^\/convite\/([\w-]{20,})$/.exec(path);
    if (invite) return post ? this.acceptInvite(request, invite[1]!) : this.invitePage(invite[1]!);
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
    const res = await this.signedIn(request, user, url);
    // Página aberta no navegador que não existe (ou é de outra conta): a página de não encontrado,
    // a mesma para os dois casos. Os pedidos do script e dos arquivos continuam com o texto curto.
    return res.status === 404 && opensPage(request) && res.headers.get("content-type")?.startsWith("text/plain") ? this.notFoundPage(user) : res;
  }

  /** As páginas de quem está logado. */
  private async signedIn(request: Request, user: User, url: URL): Promise<Response> {
    const path = url.pathname;
    const post = request.method === "POST";

    if (!post && path === "/") return this.home(user, url);
    if (!post && path === "/videos") return this.videosPage(user, url);
    // O painel do administrador: para os outros, a página nem existe.
    const panel = /^\/painel(?:\/(custos|atividade|contas))?$/.exec(path);
    if (!post && panel) {
      const tab = (panel[1] as PanelTab | undefined) ?? "geral";
      const allowed = pode(user, "ver:painel") && (tab !== "contas" || pode(user, "gerenciar:contas"));
      return allowed ? this.panelPage(user, url, tab) : new Response("não encontrado", { status: 404 });
    }
    // Contas: convidar, link de senha, suspender, reativar e os ajustes de permissão.
    const account = /^\/painel\/contas(?:\/(\d+)\/(link|suspender|reativar|testador|canvas))?$/.exec(path);
    if (post && account) return pode(user, "ver:painel") && pode(user, "gerenciar:contas") ? this.accountAction(request, user, url, account[1], account[2]) : new Response("não encontrado", { status: 404 });
    // Endereços da versão anterior.
    if (!post && path === "/novo") return redirect("/");
    const old = /^\/novo\/([a-z0-9-]+)$/.exec(path);
    if (!post && old) return redirect(`/modelo/${old[1]}`);

    if (!post && path === "/vozes/lista") return this.voiceList(user, url);
    // "Mostrar mais" do "Adicionar ativo": a página seguinte do que a pessoa gerou.
    if (!post && path === "/gerados") {
      const kind = url.searchParams.get("tipo");
      if (kind !== "imagem" && kind !== "video") return new Response("não encontrado", { status: 404 });
      return html(await this.generatedFrames(user, kind, Math.max(0, Number(url.searchParams.get("de")) || 0)));
    }
    const preview = /^\/vozes\/previa\/([\w-]+)$/.exec(path);
    if (!post && preview) return this.voicePreview(user, preview[1]!);

    const model = /^\/modelo\/([a-z0-9-]+)$/.exec(path);
    if (model) {
      // Estrutura que não existe ou que a pessoa não pode usar: a página nem aparece.
      const found = structureById(model[1]);
      if (!found || !canUse(found, user)) return new Response("não encontrado", { status: 404 });
      // O HeyGen pode estar na API direta (config do banco): o formulário mostra só o que ela aceita.
      const structure = await this.studio.resolve(found);
      if (post) return this.createVideo(request, user, structure);
      // "Refazer" volta com os ajustes, o avatar e os arquivos do vídeo; "Usar para gerar" traz um resultado pronto.
      const redo = await this.redo(structure, url.searchParams.get("refazer"), user);
      const use = url.searchParams.get("usar");
      return this.modelPage(user, structure, redo?.values, undefined, redo?.picks ?? (use ? { avatar: "", assets: [use] } : undefined));
    }

    // A página do vídeo: o player ocupa a tela, com as informações numa folha lateral.
    const watch = /^\/video\/([0-9a-f-]{36})$/.exec(path);
    if (!post && watch) return this.videoPage(user, watch[1]!, url);

    // Avatares: os ativos de cada avatar, sem depender de nenhum modelo.
    if (/^\/avatares(\/|$)/.test(path)) return this.avatars(request, user, path, url);
    const saveToAvatar = /^\/videos\/([0-9a-f-]{36})\/salvar-avatar$/.exec(path);
    if (post && saveToAvatar) return this.saveVideoToAvatar(request, user, saveToAvatar[1]!);

    // Projetos do canvas de edição: em teste, só o administrador (para os outros, as páginas nem existem).
    if (/^\/(canvas|projetos)(\/|$)/.test(path)) return pode(user, "usar:canvas") ? this.projects(request, user, path, url) : new Response("não encontrado", { status: 404 });

    const quickEdit = /^\/videos\/([0-9a-f-]{36})\/edicao-rapida$/.exec(path);
    if (post && quickEdit) return this.quickEdit(request, user, quickEdit[1]!);
    const face = /^\/videos\/([0-9a-f-]{36})\/rosto$/.exec(path);
    if (!post && face) return this.face(user, face[1]!);
    // Os arquivos que a pessoa usou para gerar o vídeo (a prévia do Refazer): só quem gerou vê.
    const reference = /^\/videos\/([0-9a-f-]{36})\/referencia\/(imagem|video|audio)$/.exec(path);
    if (!post && reference) {
      const found = await this.pickFile(`origem:${reference[1]}:${reference[2]}`, user);
      return found ? this.object(request, found.key, "private, max-age=86400") : new Response("não encontrado", { status: 404 });
    }

    // /videos/<id>.mp4: o áudio tratado, se já houver; /videos/<id>.original.mp4: como veio do modelo;
    // /videos/<id>.editado.mp4: a edição rápida.
    const file = /^\/videos\/([0-9a-f-]{36})(?:\.(original|editado))?\.(mp4|png|jpg|webp)$/.exec(path);
    if (request.method === "GET" && file) {
      // Só de quem gerou (e o administrador); de outra pessoa, o arquivo nem existe.
      const video = await this.visibleVideo(user, file[1]!);
      const version = file[2];
      const key = version === "original" ? video?.video_key : version === "editado" ? video?.edited_key : (video?.processed_key ?? video?.video_key);
      if (!video || !key) return new Response("não encontrado", { status: 404 });
      const name = `meu-avatar-${video.id.slice(0, 8)}${version ? `-${version}` : ""}.${file[3]}`;
      return this.object(request, key, "private, max-age=86400", url.searchParams.has("baixar") ? name : undefined);
    }

    return new Response("não encontrado", { status: 404 });
  }

  /** Não encontrado: o endereço não existe ou é de outra conta (a mesma página, para não dizer qual). */
  private notFoundPage(user: User): Response {
    const [houve, fazer] = PARTES.get(ERROS.naoEncontrado)!;
    const body = `
<main class="page" id="conteudo">
  ${emptyState("404", houve!, fazer!, `<a class="button button--filled interactive" href="/">Voltar ao início</a>`)}
</main>`;
    // A barra de sempre, sem seção marcada: dali a pessoa vai para onde quiser.
    return html(page(`Não encontrado · ${SITE_NAME}`, body, { bar: { user, search: { action: "/", label: "Pesquisar modelos", q: "" } } }), 404);
  }

  /**
   * Avatares: a lista em /avatares, a página de cada um em /avatares/<id> e os
   * ativos dele. Cada avatar é só de quem o criou.
   */
  private async avatars(request: Request, user: User, path: string, url: URL): Promise<Response> {
    const post = request.method === "POST";
    if (path === "/avatares") return post ? this.saveAvatar(request, user, null) : this.avatarsPage(user, url);
    // O avatar novo só passa a existir quando a pessoa toca em Salvar.
    if (path === "/avatares/novo" && !post) {
      // Vindo de "Salvar no avatar", o vídeo vai junto: aparece como ativo e é salvo com o avatar.
      const pending = await this.savableVideo(url.searchParams.get("video"), user);
      return this.avatarPage(user, null, undefined, undefined, pending);
    }
    const m = /^\/avatares\/([0-9a-f-]{36})(?:\/(salvar|apagar|arquivos)(?:\/([0-9a-f-]{36})(\/ver|\/apagar)?)?)?$/.exec(path);
    const avatar = m ? await this.db.avatarById(m[1]!) : null;
    // Avatar de outra pessoa (ou que não existe): a página nem existe.
    if (!m || !avatar || avatar.user_id !== user.id) return new Response("não encontrado", { status: 404 });
    const [, , action, assetId, assetAction] = m;
    if (!action && !post) return this.avatarPage(user, avatar);
    if (action === "salvar" && post) return this.saveAvatar(request, user, avatar);
    if (action === "apagar") {
      if (!post) return this.deleteAvatarPage(user, avatar);
      const keys = await this.db.deleteAvatar(avatar.id);
      if (keys.length) await this.media.delete(keys);
      return redirect("/avatares");
    }
    if (action === "arquivos" && !assetId && post) return this.uploadAsset(request, user, avatar);
    if (action === "arquivos" && assetId) {
      const asset = await this.db.asset(avatar.id, assetId);
      if (!asset) return new Response("não encontrado", { status: 404 });
      if (assetAction === "/ver" && !post) return this.assetPage(user, avatar, asset);
      if (assetAction === "/apagar" && !post) return this.deleteAssetPage(user, avatar, asset);
      if (assetAction === "/apagar" && post) {
        // O ativo gerado só some da lista: o vídeo continua nos Vídeos.
        if (!asset.source_video) await this.media.delete(asset.key);
        await this.db.deleteAsset(asset.id);
        return redirect(`/avatares/${avatar.id}`);
      }
      if (!assetAction && !post) return this.object(request, await this.db.assetKey(asset), "private, max-age=86400", url.searchParams.has("baixar") ? asset.name.replace(/[^\w.-]+/g, "-") : undefined);
    }
    return new Response("não encontrado", { status: 404 });
  }

  /** A lista dos avatares da pessoa, com a capa (a primeira foto) e a busca pelo nome. */
  private async avatarsPage(user: User, url: URL): Promise<Response> {
    const q = (url.searchParams.get("q") ?? "").trim();
    const avatars = await this.db.avatarsByUser(user.id, q);
    const cards = avatars.map((a, i) =>
      tileCard({
        href: `/avatares/${a.id}`,
        tile: a.cover
          ? faceImage(`/avatares/${a.id}/arquivos/${esc(a.cover)}`, a.cover_face, "avatar-cover")
          : `<span class="icon-tile icon-tile--large icon-tile--${MODEL_TONES[i % MODEL_TONES.length]}" aria-hidden="true"><span class="icon">face</span></span>`,
        headline: a.name,
        supporting: a.assets === 1 ? "1 ativo" : `${a.assets ?? 0} ativos`,
        menu: [
          { label: "Abrir", icon: "face", href: `/avatares/${a.id}` },
          { label: "Apagar", icon: "delete", href: `/avatares/${a.id}/apagar` },
        ],
      }),
    );
    const body = `
<main class="page" id="conteudo">
  ${pageHead("Avatares", cards.length, "Guarde as fotos, os vídeos e as vozes de cada avatar.", fab("add", "Novo avatar", { href: "/avatares/novo" }))}
  ${cards.length ? `<div class="tile-grid">${cards.join("")}</div>` : q ? emptyState("search", "Nenhum avatar encontrado", `Nada com “${q}” no nome.`) : emptyState("face", "Nenhum avatar ainda", "Toque em Novo avatar para começar.")}
</main>`;
    return html(page(`Avatares · ${SITE_NAME}`, body, { bar: { user, tab: "avatares", search: { action: "/avatares", label: "Pesquisar avatares", q } } }));
  }

  /**
   * A página do avatar, no molde da página do modelo: à esquerda o painel com o nome, a
   * descrição, a foto principal e a voz para clonagem; no centro, a lista dos ativos.
   */
  private async avatarPage(user: User, avatar: Avatar | null, error?: string, typed?: { name: string; description: string }, pending?: SavableVideo | null): Promise<Response> {
    const assets = avatar ? await this.db.assetsByAvatar(avatar.id) : [];
    const fileName = (id: string | null) => assets.find((a) => a.id === id)?.name ?? null;
    const value: Values = (name) => (name === "nome" ? (typed?.name ?? avatar?.name ?? "") : name === "descricao" ? (typed?.description ?? avatar?.description ?? "") : "");
    // O script do formulário (data-composer) cuida das prévias da foto e do áudio; aqui não há custo.
    const config = { prices: {}, sku: "", seconds: {}, rate: { min: 2, max: 3 }, durations: null, extra: 0 };
    const photo = avatar?.photo_asset ? `/avatares/${avatar.id}/arquivos/${avatar.photo_asset}` : null;
    const voiceName = fileName(avatar?.voice_asset ?? null);
    const body = `
<main class="workspace" id="conteudo">
  <form class="workspace__form" method="post" action="${avatar ? `/avatares/${avatar.id}/salvar` : "/avatares"}" enctype="multipart/form-data" data-composer='${esc(JSON.stringify(config))}'>
  ${pending ? `<input type="hidden" name="video" value="${pending.video.id}">` : ""}
  <section class="pane pane--config" aria-labelledby="configuracao">
    <div class="pane__head"><h2 class="pane__headline" id="configuracao">Configuração</h2></div>
    <div class="pane__body" id="configuracao-corpo">
      ${formField({ kind: "text", name: "nome", label: "Nome", maxLength: 120, placeholder: "Ex.: Camila", supporting: "Como o avatar aparece na lista." }, value)}
      ${formField({ kind: "text", name: "descricao", label: "Descrição", maxLength: MAX_AVATAR_DESCRIPTION, placeholder: "Ex.: 30 anos, jeito simpático, fala de beleza", supporting: "Opcional. Quem é este avatar." }, value)}
      ${filePicker("image", {
        name: "imagem",
        label: "Foto principal",
        title: `JPG, PNG ou WebP, até ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
        accept: "image/jpeg,image/png,image/webp",
        icon: "face",
        empty: "Adicionar foto principal",
        hint: "",
        current: photo ? { name: "Foto principal", hint: "Trocar foto", preview: `<img src="${photo}" alt="">` } : undefined,
      })}
      ${filePicker("audio", {
        name: "voz",
        label: "Voz para clonagem",
        title: `MP3, WAV, M4A ou OGG, até ${MAX_VIDEO_BYTES / 1024 / 1024} MB`,
        accept: "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg",
        icon: "mic",
        empty: "Adicionar voz para clonagem",
        hint: "1 a 3 min de fala limpa.",
        current: voiceName ? { name: voiceName, hint: "Trocar voz" } : undefined,
      })}
    </div>
    <div class="pane__footer"><button class="button button--filled interactive" type="submit"><span class="icon">check</span>Salvar</button></div>
  </section>
  </form>
  <div class="workspace__main">
    ${
      avatar
        ? assetLibrary(assets, { key: `avatar-${avatar.id}`, avatar })
        : pending
          ? assetLibrary([{ id: "", avatar_id: "", ...savedKind(pending), key: pending.key, name: videoAssetName(pending), size: pending.size, face: null, source_video: pending.video.id, created_at: new Date().toISOString() }], {
              key: "avatar-novo",
              src: () => mediaSrc(pending.video),
              href: () => `/video/${pending.video.id}`,
            })
          : `<div class="library"><div class="library__head"><h2 class="library__title">Ativos <span class="pane__count">0</span></h2></div>${emptyState("face", "Nenhum ativo ainda", "Toque em Salvar para criar o avatar e adicionar arquivos.")}</div>`
    }
  </div>
</main>
${error ? snackbar(error) : ""}`;
    const title = avatar?.name ?? "Novo avatar";
    return html(page(`${title} · ${SITE_NAME}`, body, { bar: { user, back: "/avatares", title } }), error ? 400 : 200);
  }

  /** "Salvar", no painel do avatar: cria (sem `avatar`) ou atualiza; a foto principal e a voz viram ativos. */
  private async saveAvatar(request: Request, user: User, current: Avatar | null): Promise<Response> {
    const form = await request.formData();
    const name = String(form.get("nome") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const description = String(form.get("descricao") ?? "").trim().slice(0, MAX_AVATAR_DESCRIPTION);
    // O vídeo que veio junto de "Salvar no avatar" (só ao criar).
    const pending = current ? null : await this.savableVideo(String(form.get("video") ?? ""), user);
    if (!name) return this.avatarPage(user, current, ERROS.avatarNome, { name, description }, pending);
    const photo = form.get("imagem"), voice = form.get("voz");
    const invalid = (file: unknown, kind: AssetKind): string | null => {
      if (!(file instanceof File) || !file.size) return null;
      if (assetKind(file.type) !== kind) return ERROS.canvasArquivo;
      const max = kind === "imagem" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      return file.size > max ? ERROS.canvasArquivoGrande(max / 1024 / 1024) : null;
    };
    // Confere os arquivos antes de criar: com arquivo errado, o avatar novo não nasce.
    const problem = invalid(photo, "imagem") ?? invalid(voice, "audio");
    if (problem) return this.avatarPage(user, current, problem, { name, description }, pending);
    const avatar = current ?? (await this.db.insertAvatar({ id: crypto.randomUUID(), user_id: user.id, name, description }));
    const take = (file: unknown, kind: AssetKind) => (file instanceof File && file.size ? this.storeAsset(avatar.id, file, kind) : Promise.resolve(null));
    const photoId = await take(photo, "imagem");
    const voiceId = await take(voice, "audio");
    await this.db.updateAvatar(avatar.id, { name, description, photo_asset: photoId ?? avatar.photo_asset, voice_asset: voiceId ?? avatar.voice_asset });
    if (pending) await this.linkVideo(pending, avatar.id);
    return redirect(`/avatares/${avatar.id}`);
  }

  /** A página de um ativo, no molde da página do vídeo: o arquivo à esquerda e a folha com os detalhes. */
  private async assetPage(user: User, avatar: Avatar, asset: AvatarAsset): Promise<Response> {
    const src = `/avatares/${avatar.id}/arquivos/${asset.id}`;
    const back = `/avatares/${avatar.id}`;
    const media = asset.kind === "imagem" ? `<img class="viewer__video" src="${src}" alt="${esc(asset.name)}">` : asset.kind === "video" ? `<video class="viewer__video" src="${src}" controls playsinline></video>` : `<audio src="${src}" controls></audio>`;
    const role = asset.id === avatar.photo_asset ? "Foto principal" : asset.id === avatar.voice_asset ? "Voz para clonagem" : null;
    const details = [
      { icon: "folder_open", term: "Tipo", value: ASSET_LABELS[asset.kind] },
      ...(role ? [{ icon: "star", term: "Uso", value: role }] : []),
      { icon: "download", term: "Tamanho", value: formatBytes(asset.size) },
      { icon: "schedule", term: "Origem", value: assetOrigin(asset) },
      { icon: "calendar_today", term: "Criado em", value: formatDate(asset.created_at) },
    ];
    const body = `
<main class="viewer" id="conteudo">
  <section class="viewer__stage viewer__stage--asset" aria-label="Ativo">${media}</section>
  <aside class="viewer__sheet" aria-label="Informações do ativo">
    <div class="viewer__head">
      <p class="status-line status-line--done"><span class="icon">check_circle</span>${esc(ASSET_LABELS[asset.kind])}</p>
      <a class="icon-button interactive" href="${back}" aria-label="Fechar" title="Fechar"><span class="icon">close</span></a>
    </div>
    <div class="viewer__body"><div class="viewer__panel">
      <section class="viewer__section"><h2 class="viewer__title">Nome</h2><div class="viewer__card"><p class="viewer__text">${esc(asset.name)}</p></div></section>
      ${detailsCard("Detalhes", details)}
    </div></div>
    <div class="viewer__actions">
      <a class="button button--outlined interactive" href="${src}/apagar"><span class="icon">delete</span>Apagar</a>
      <a class="button button--filled interactive" href="${src}?baixar" download><span class="icon">download</span>Baixar</a>
    </div>
  </aside>
</main>`;
    return html(page(`${asset.name} · ${SITE_NAME}`, body, { bar: { user, back, title: avatar.name } }));
  }

  private deleteAssetPage(user: User, avatar: Avatar, asset: AvatarAsset): Response {
    const back = `/avatares/${avatar.id}/arquivos/${asset.id}/ver`;
    const body = `
<main class="page" id="conteudo">
  <div class="confirm">
    <h1 class="confirm__title">Apagar “${esc(asset.name)}”?</h1>
    <p class="confirm__text">O arquivo sai deste avatar. Os seus vídeos continuam.</p>
    <form class="confirm__actions" method="post" action="/avatares/${avatar.id}/arquivos/${asset.id}/apagar">
      <a class="button button--text interactive" href="${back}">Cancelar</a>
      <button class="button button--filled interactive" type="submit"><span class="icon">delete</span>Apagar</button>
    </form>
  </div>
</main>`;
    return html(page(`Apagar arquivo · ${SITE_NAME}`, body, { bar: { user, back, title: "Apagar arquivo" } }));
  }

  private deleteAvatarPage(user: User, avatar: Avatar): Response {
    const body = `
<main class="page" id="conteudo">
  <div class="confirm">
    <h1 class="confirm__title">Apagar “${esc(avatar.name)}”?</h1>
    <p class="confirm__text">O avatar e os ativos dele somem. Os seus vídeos continuam.</p>
    <form class="confirm__actions" method="post" action="/avatares/${avatar.id}/apagar">
      <a class="button button--text interactive" href="/avatares/${avatar.id}">Cancelar</a>
      <button class="button button--filled interactive" type="submit"><span class="icon">delete</span>Apagar</button>
    </form>
  </div>
</main>`;
    return html(page(`Apagar avatar · ${SITE_NAME}`, body, { bar: { user, back: `/avatares/${avatar.id}`, title: "Apagar avatar" } }));
  }

  /** Recebe um arquivo do computador e guarda como ativo do avatar. */
  private async uploadAsset(request: Request, user: User, avatar: Avatar): Promise<Response> {
    const file = (await request.formData()).get("arquivo");
    if (!(file instanceof File) || !file.size) return this.avatarPage(user, avatar, ERROS.canvasArquivo);
    const kind = assetKind(file.type);
    if (!kind) return this.avatarPage(user, avatar, ERROS.canvasArquivo);
    const max = kind === "imagem" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > max) return this.avatarPage(user, avatar, ERROS.canvasArquivoGrande(max / 1024 / 1024));
    await this.storeAsset(avatar.id, file, kind);
    return redirect(`/avatares/${avatar.id}`);
  }

  /** Guarda o arquivo no R2 como ativo do avatar e devolve o id. */
  private async storeAsset(avatarId: string, file: File, kind: AssetKind): Promise<string> {
    const id = crypto.randomUUID();
    const key = `avatares-ativos/${avatarId}/${id}`;
    await this.media.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    await this.db.insertAsset({ id, avatar_id: avatarId, kind, key, name: file.name.slice(0, 200) || "arquivo", type: file.type, size: file.size, source_video: null });
    return id;
  }

  /** "Salvar no avatar", na página do vídeo: copia o vídeo pronto para os ativos do avatar escolhido. */
  private async saveVideoToAvatar(request: Request, user: User, videoId: string): Promise<Response> {
    const saving = await this.savableVideo(videoId, user);
    if (!saving) return new Response("não encontrado", { status: 404 });
    const avatar = await this.db.avatarById(String((await request.formData()).get("avatar") ?? ""));
    if (!avatar || avatar.user_id !== user.id) return new Response("não encontrado", { status: 404 });
    await this.linkVideo(saving, avatar.id);
    return redirect(`/avatares/${avatar.id}`);
  }

  /** O vídeo pronto que a pessoa pode salvar num avatar, com a versão que vale (editada, tratada ou original). */
  private async savableVideo(id: string | null, user: User): Promise<SavableVideo | null> {
    const video = id ? await this.db.conta(user.id).video(id) : null;
    const structure = video ? videoStructure(video) : undefined;
    if (!video || !structure || !canUse(structure, user)) return null;
    const key = video.edited_key ?? video.processed_key ?? video.video_key;
    const head = key ? await this.media.head(key) : null;
    return key && head ? { video, structure, key, size: head.size } : null;
  }

  /** Liga o vídeo aos ativos do avatar, sem copiar o arquivo. */
  private async linkVideo(saving: SavableVideo, avatarId: string): Promise<void> {
    await this.db.insertAsset({ id: crypto.randomUUID(), avatar_id: avatarId, ...savedKind(saving), key: saving.key, name: videoAssetName(saving), size: saving.size, source_video: saving.video.id });
  }

  /**
   * O painel do administrador: uso e gasto do site inteiro. Abas (Visão geral e Custos), cada
   * uma com o seu endereço; os chips de período valem para as duas (30 dias por padrão).
   */
  private async panelPage(user: User, url: URL, tab: PanelTab, accounts?: AccountsView): Promise<Response> {
    const period = PANEL_PERIODS.find((p) => p.id === url.searchParams.get("periodo")) ?? PANEL_PERIODS[1]!;
    const since = period.days ? new Date(Date.now() - period.days * 86_400_000).toISOString() : null;
    const activity = tab === "atividade";
    // A página da lista de falhas (?pagina=), de 1 em diante.
    const pageNumber = Math.max(1, Math.floor(Number(url.searchParams.get("pagina")) || 1));
    const [stats, external, failures, tokens, alarm] = await Promise.all([
      this.db.panelStats(since),
      tab === "custos" && this.costs ? this.costs.custos(period.days || null) : Promise.resolve(null),
      activity ? this.db.panelFailures(since, PANEL_PAGE, (pageNumber - 1) * PANEL_PAGE) : Promise.resolve({ items: [], total: 0 }),
      activity ? this.db.panelTokens() : Promise.resolve([]),
      activity ? this.db.alarm<Alarme>(ALARME) : Promise.resolve(null),
    ]);
    const machines = activity && this.machines ? await this.machines.estados() : [];
    const list = tab === "contas" ? await this.db.accounts() : [];
    const query = `?periodo=${period.id}`;
    const tabs = PANEL_TABS.filter((t) => t.id !== "contas" || pode(user, "gerenciar:contas")).map(
      (t) => `<a class="tabs__tab interactive" href="${t.href}${query}"${t.id === tab ? ' aria-current="page"' : ""}><span class="tabs__content"><span class="icon">${t.icon}</span>${esc(t.label)}</span></a>`,
    ).join("");
    const here = PANEL_TABS.find((t) => t.id === tab)!.href;
    const chips = PANEL_PERIODS.map(
      (p) => `<a class="chip interactive" href="${here}?periodo=${p.id}"${p === period ? ' aria-current="true"' : ""}>${p === period ? '<span class="icon">check</span>' : ""}${esc(p.label)}</a>`,
    ).join("");
    const body = `
<main class="page page--dash" id="conteudo">
  <nav class="tabs tabs--start" aria-label="Seções do painel">${tabs}</nav>
  ${tab === "contas" ? "" : `<nav class="chip-set library__tools" aria-label="Período">${chips}</nav>`}
  ${
    tab === "contas"
      ? panelAccounts(list, user, accounts ?? {})
      : tab === "custos"
      ? panelCosts(stats, external, !!this.config.local)
      : activity
        ? panelActivity(stats, { failures, page: pageNumber, tokens, alarm, machines, since, local: !!this.config.local, from: `/painel/atividade${query}`, userId: user.id })
        : panelOverview(stats, query)
  }
</main>`;
    return html(page(`Painel · ${SITE_NAME}`, body, { bar: { user, back: "/", title: "Painel" } }), accounts?.error ? 400 : 200);
  }

  /**
   * As ações da aba Contas. Sem conta: convidar (cria a conta comum e mostra o link uma vez). Com
   * conta (só as comuns): novo link de senha, suspender, reativar e os ajustes de testador e Canvas.
   */
  private async accountAction(request: Request, user: User, url: URL, id: string | undefined, action: string | undefined): Promise<Response> {
    if (!id) {
      const form = await request.formData();
      const name = String(form.get("nome") ?? "");
      const email = String(form.get("email") ?? "");
      const result = await this.accounts.addMember(email, name);
      if ("error" in result) return this.panelPage(user, url, "contas", { error: result.error, values: { name, email } });
      return this.panelPage(user, url, "contas", { link: { name: result.user.name, url: `${this.origin(url)}/convite/${result.token}` } });
    }
    const target = await this.db.userById(Number(id));
    // Só as contas comuns: o administrador não suspende nem ajusta a si mesmo por aqui.
    if (!target || target.role !== "member") return new Response("não encontrado", { status: 404 });
    if (action === "link") return this.panelPage(user, url, "contas", { link: { name: target.name, url: `${this.origin(url)}/convite/${await this.accounts.invite(target.id)}` } });
    const toggle = (perm: string, on: boolean) => [...target.permissoes.filter((p) => p !== perm), ...(on ? [perm] : [])];
    const has = (perm: string) => target.permissoes.includes(perm);
    if (action === "suspender") {
      await this.db.setPermissoes(target.id, toggle("suspensa", true));
      await this.db.endSessions(target.id);
    }
    if (action === "reativar") await this.db.setPermissoes(target.id, toggle("suspensa", false));
    if (action === "testador") await this.db.setPermissoes(target.id, toggle("usar:modelo:teste", !has("usar:modelo:teste")));
    if (action === "canvas") await this.db.setPermissoes(target.id, toggle("usar:canvas", !has("usar:canvas")));
    return redirect("/painel/contas");
  }

  /** O endereço do site para os links (o oficial, SITE_URL; sem ele, o do pedido). */
  private origin(url: URL): string {
    return this.config.siteUrl ? new URL(this.config.siteUrl).origin : url.origin;
  }

  /** A página do link de convite: criar (ou trocar) a senha. Link que não vale: o aviso e o Entrar. */
  private async invitePage(token: string, error?: string): Promise<Response> {
    const user = await this.accounts.inviteUser(token);
    if (!user) return html(invalidInvitePage(), 404);
    return html(invitePageHtml(token, user.name, user.email, Boolean(user.passwordHash), error), error ? 400 : 200);
  }

  private async acceptInvite(request: Request, token: string): Promise<Response> {
    const form = await request.formData();
    const password = String(form.get("senha") ?? "");
    if (password !== String(form.get("confirmar") ?? "")) return this.invitePage(token, ERROS.senhasDiferentes);
    const result = await this.accounts.acceptInvite(token, password);
    if ("error" in result) return result.error === ERROS.conviteInvalido ? html(invalidInvitePage(), 404) : this.invitePage(token, result.error);
    return redirect("/", sessionCookie(result.token));
  }

  /** Tela inicial: um card por estrutura que a pessoa pode usar; a busca filtra pelo nome. */
  private async home(user: User, url: URL): Promise<Response> {
    const q = (url.searchParams.get("q") ?? "").trim();
    const counts = await this.db.conta(user.id).countByStructure();
    // As versões de um modelo ficam no card da principal (o seletor Versão fica na página).
    const structures = STRUCTURES.filter((s) => !s.family && canUse(s, user) && s.name.toLowerCase().includes(q.toLowerCase()));
    const cards = structures.map((s, i) => {
      const n = familyOf(s).reduce((sum, v) => sum + (counts.get(v.id) ?? 0), 0);
      return tileCard({
        href: `/modelo/${s.id}`,
        tile: `<span class="icon-tile icon-tile--large icon-tile--${MODEL_TONES[i % MODEL_TONES.length]}" aria-hidden="true"><span class="icon">${esc(s.icon)}</span></span>`,
        badge: s.access === "admin" ? { label: "Em teste", title: "Em teste: só quem testa vê" } : undefined,
        headline: s.name,
        // O modelo de imagem não tem os vídeos na aba Vídeos: as imagens ficam na página dele.
        supporting: makesImage(s) ? plural(n, "imagem", "imagens") : plural(n, "vídeo", "vídeos"),
        menu: makesImage(s)
          ? [{ label: "Criar imagem", icon: "add", href: `/modelo/${s.id}` }]
          : [
              { label: "Criar vídeo", icon: "add", href: `/modelo/${s.id}` },
              { label: "Ver os vídeos", icon: "movie", href: `/videos?modelo=${s.id}` },
            ],
      });
    });
    // Só o administrador vê o alarme de contêiner ligado sem trabalho (src/vigia.ts).
    const alarm = pode(user, "ver:painel") && !this.config.local ? await this.db.alarm<Alarme>(ALARME) : null;
    const banners = [...(alarm?.ligados.length ? [ERROS.servicoLigado] : []), ...(alarm?.semPainel ? [ERROS.alarmeSemPainel] : [])];
    const body = `
<main class="page" id="conteudo">
  ${banners.map((b) => `<p class="banner" role="status"><span class="icon">error</span>${esc(b)}</p>`).join("")}
  ${pageHead("Modelos", cards.length, "Escolha um modelo para criar imagens ou vídeos.")}
  ${cards.length ? `<div class="tile-grid">${cards.join("")}</div>` : emptyState("search", "Nenhum modelo encontrado", `Nada com “${q}” no nome.`)}
</main>`;
    return html(page(SITE_NAME, body, { bar: { user, tab: "modelos", search: { action: "/", label: "Pesquisar modelos", q } } }));
  }

  /**
   * Projetos do canvas de edição (src/canvas/, gerado em canvas.ts): a lista em
   * /projetos, o canvas em /canvas/<id> (salvo enquanto a pessoa edita) e os
   * arquivos enviados do computador. Cada projeto é só de quem o criou.
   */
  private async projects(request: Request, user: User, path: string, url: URL): Promise<Response> {
    const post = request.method === "POST";
    if (path === "/canvas") return redirect("/projetos");
    if (path === "/canvas/animacao" && !post) return animationFrame();
    if (path === "/projetos") {
      if (!post) return this.projectsPage(user, url);
      const project = await this.db.insertProject({ id: crypto.randomUUID(), user_id: user.id, name: "Projeto sem nome", data: EMPTY_PROJECT });
      return redirect(`/canvas/${project.id}`);
    }
    const m = /^\/(?:canvas|projetos)\/([0-9a-f-]{36})(?:\/(salvar|estado|arquivos|apagar|exportar|exportacoes)(?:\/([0-9a-f-]{36})(?:\/(\d+\.mp4|todas\.zip))?)?)?$/.exec(path);
    const project = m ? await this.db.projectById(m[1]!) : null;
    // Projeto de outra pessoa (ou que não existe): a página nem existe.
    if (!m || !project || project.user_id !== user.id) return new Response("não encontrado", { status: 404 });
    const [, , action, fileId, download] = m;
    if (action === "exportar" && post && !fileId) return this.startExport(request, user, project);
    if (action === "exportacoes" && fileId) return this.exportRoute(request, project, fileId, download);
    if (download) return new Response("não encontrado", { status: 404 });
    if (!action && !post && path.startsWith("/canvas/")) return this.canvasPage(user, project);
    if (action === "salvar" && post) return this.saveProject(request, project);
    if (action === "estado" && !post) return this.projectState(project, url);
    if (action === "arquivos" && post && !fileId) return this.uploadProjectFile(request, project);
    if (action === "arquivos" && !post && fileId) {
      const file = await this.db.projectFile(project.id, fileId);
      return file ? this.object(request, file.key, "private, max-age=86400") : new Response("não encontrado", { status: 404 });
    }
    if (action === "apagar") {
      if (!post) return this.deleteProjectPage(user, project);
      const keys = await this.db.deleteProject(project.id);
      if (keys.length) await this.media.delete(keys);
      return redirect("/projetos");
    }
    return new Response("não encontrado", { status: 404 });
  }

  /** A lista dos projetos da pessoa (o editado por último primeiro), com a busca pelo nome. */
  private async projectsPage(user: User, url: URL): Promise<Response> {
    const q = (url.searchParams.get("q") ?? "").trim();
    const projects = await this.db.projectsByUser(user.id, q);
    const cards = projects.map((p, i) => {
      const blocks = (() => {
        try {
          return (JSON.parse(p.data) as { blocks?: unknown[] }).blocks?.length ?? 0;
        } catch {
          return 0;
        }
      })();
      return tileCard({
        href: `/canvas/${p.id}`,
        tile: `<span class="icon-tile icon-tile--large icon-tile--${MODEL_TONES[i % MODEL_TONES.length]}" aria-hidden="true"><span class="icon">video_library</span></span>`,
        headline: p.name,
        supporting: `${blocks === 1 ? "1 bloco" : `${blocks} blocos`} · editado em ${formatDate(p.updated_at)}`,
        menu: [
          { label: "Abrir", icon: "video_library", href: `/canvas/${p.id}` },
          { label: "Apagar", icon: "delete", href: `/projetos/${p.id}/apagar` },
        ],
      });
    });
    const body = `
<main class="page" id="conteudo">
  ${pageHead("Projetos", cards.length, "Monte várias variações dos seus vídeos num canvas.", fab("add", "Novo projeto", { post: "/projetos" }))}
  ${cards.length ? `<div class="tile-grid">${cards.join("")}</div>` : q ? emptyState("search", "Nenhum projeto encontrado", `Nada com “${q}” no nome.`) : emptyState("video_library", "Nenhum projeto ainda", "Toque em Novo projeto para começar.")}
</main>`;
    return html(page(`Projetos · ${SITE_NAME}`, body, { bar: { user, tab: "projetos", search: { action: "/projetos", label: "Pesquisar projetos", q } } }));
  }

  /** Confirmação antes de apagar: o projeto e os arquivos enviados para ele somem; os vídeos não. */
  private deleteProjectPage(user: User, project: Project): Response {
    const body = `
<main class="page" id="conteudo">
  <div class="confirm">
    <h1 class="confirm__title">Apagar “${esc(project.name)}”?</h1>
    <p class="confirm__text">O projeto e os arquivos enviados para ele somem. Os seus vídeos continuam.</p>
    <form class="confirm__actions" method="post" action="/projetos/${project.id}/apagar">
      <a class="button button--text interactive" href="/projetos">Cancelar</a>
      <button class="button button--filled interactive" type="submit"><span class="icon">delete</span>Apagar</button>
    </form>
  </div>
</main>`;
    return html(page(`Apagar projeto · ${SITE_NAME}`, body, { bar: { user, back: "/projetos", title: "Apagar projeto" } }));
  }

  /** O canvas de um projeto, com os vídeos prontos de quem usa e o que já estava salvo. */
  private async canvasPage(user: User, project: Project): Promise<Response> {
    const usable = STRUCTURES.filter((s) => canUse(s, user));
    const videos = (await this.db.conta(user.id).videos(usable.map((s) => s.id)))
      .filter((v) => v.status === "completed" && v.video_key)
      .map((v) => ({
        id: v.id,
        name: v.prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Vídeo",
        src: `/videos/${v.id}.mp4`,
        when: formatDate(v.created_at),
      }));
    let data: unknown = null;
    try {
      data = JSON.parse(project.data);
    } catch {}
    const latest = await this.db.latestExport(project.id);
    const config = {
      videos,
      animacao: ANIMACAO_SRC,
      projeto: { id: project.id, name: project.name, data, criado: formatDate(project.created_at), modificado: formatDate(project.updated_at), autor: user.name, revisao: project.revision, salvar: `/projetos/${project.id}/salvar`, estado: `/projetos/${project.id}/estado`, arquivos: `/projetos/${project.id}/arquivos`, exportar: `/projetos/${project.id}/exportar` },
      exportacao: latest ? this.exports.state(project, latest) : null,
      limites: { imagem: MAX_IMAGE_BYTES, video: MAX_VIDEO_BYTES },
      erros: {
        arquivo: ERROS.canvasArquivo,
        colar: ERROS.canvasColar,
        video: ERROS.canvasVideo,
        salvar: ERROS.canvasSalvar,
        conflito: ERROS.canvasConflito,
        enviar: ERROS.canvasEnviar,
        grandeImagem: ERROS.canvasArquivoGrande(MAX_IMAGE_BYTES / 1024 / 1024),
        grandeVideo: ERROS.canvasArquivoGrande(MAX_VIDEO_BYTES / 1024 / 1024),
        nome: ERROS.projetoNome,
        exportar: ERROS.exportarFalhou,
        exportarLimite: ERROS.exportarLimite(MAX_VERSOES),
        ligacaoCiclo: ERROS.ligacaoCiclo,
        ligacaoRepetida: ERROS.ligacaoRepetida,
      },
    };
    const actions = `<button class="button button--outlined interactive" type="button" id="add-final"><span class="icon">flag</span>Bloco final</button>
    <button class="button button--tonal interactive" type="button" data-open-file><span class="icon">upload</span>Do computador</button>
    <button class="button button--filled interactive" type="button" data-open-library><span class="icon">video_library</span>Seus vídeos</button>`;
    // O JSON vai num bloco de dados (não executa); "<" escapado para não fechar a tag.
    const body = `${CANVAS_STYLE}
${CANVAS_BODY}
<script type="application/json" id="canvas-config">${JSON.stringify(config).replace(/</g, "\\u003c")}</script>
<script type="module" nonce="${NONCE}">${CANVAS_SCRIPT}</script>`;
    return html(page(`${project.name} · ${SITE_NAME}`, body, { bar: { user, back: "/projetos", title: project.name, actions } }), 200, CANVAS_CSP);
  }

  /** "Exportar": começa a partir do projeto salvo; a tela chama os passos e acompanha. */
  private async startExport(request: Request, user: User, project: Project): Promise<Response> {
    let body: { final?: unknown; versoes?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response("json inválido", { status: 400 });
    }
    const pick = Array.isArray(body.versoes) && body.versoes.every((v) => Number.isInteger(v)) ? (body.versoes as number[]) : undefined;
    try {
      const row = await this.exports.start(project, user, typeof body.final === "string" ? body.final : "", pick);
      return Response.json(this.exports.state(project, row), { status: 201 });
    } catch (err) {
      if (err instanceof InputError) return new Response(err.message, { status: 400 });
      throw err;
    }
  }

  /** POST faz o próximo passo e GET só lê; os arquivos prontos ficam até expirar. */
  private async exportRoute(request: Request, project: Project, id: string, download: string | undefined): Promise<Response> {
    const row = await this.db.exportById(id);
    if (!row || row.project_id !== project.id) return new Response("não encontrado", { status: 404 });
    if (request.method === "POST" && !download) {
      const now = await this.exports.advance(id);
      return Response.json(this.exports.state(project, now ?? row));
    }
    if (request.method !== "GET") return new Response("não encontrado", { status: 404 });
    if (!download) return Response.json(this.exports.state(project, row));
    if (row.status !== "done") return new Response("não encontrado", { status: 404 });
    if (row.expires_at <= new Date().toISOString()) return new Response(ERROS.exportarExpirou, { status: 410 });
    const plan = JSON.parse(row.plan) as ExportPlan;
    if (download === "todas.zip") return zipFits(plan) ? this.exports.zip(plan) : new Response("não encontrado", { status: 404 });
    const index = parseInt(download, 10);
    const version = plan.versoes[index];
    return version ? this.object(request, version.chave, "private, no-store", fileName(index, version.nome)) : new Response("não encontrado", { status: 404 });
  }

  /** Salva o canvas (JSON) e o nome, enquanto a pessoa edita. */
  private async saveProject(request: Request, project: Project): Promise<Response> {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_PROJECT_BYTES) return new Response("grande demais", { status: 413 });
    const text = await request.text();
    if (text.length > MAX_PROJECT_BYTES) return new Response("grande demais", { status: 413 });
    let body: { name?: unknown; data?: unknown; revisao?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return new Response("json inválido", { status: 400 });
    }
    const changes: { name?: string; data?: string } = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (!name) return new Response(ERROS.projetoNome, { status: 400 });
      changes.name = name;
    }
    if (body.data !== undefined) {
      const d = body.data as { blocks?: unknown; finals?: unknown; edges?: unknown } | null;
      if (!d || !Array.isArray(d.blocks) || !Array.isArray(d.finals) || !Array.isArray(d.edges)) return new Response("projeto inválido", { status: 400 });
      changes.data = JSON.stringify(d);
    }
    const revision = await this.db.saveProject(project.id, changes, typeof body.revisao === "number" ? body.revisao : undefined);
    if (revision === null) return new Response(ERROS.canvasConflito, { status: 409 });
    return new Response(null, { status: 204, headers: { "x-revisao": String(revision) } });
  }

  /** A tela confere se o projeto mudou por fora (a API); sem mudança, responde sem o canvas. */
  private projectState(project: Project, url: URL): Response {
    if (url.searchParams.get("revisao") === String(project.revision)) return new Response(null, { status: 204 });
    return Response.json({ revisao: project.revision, nome: project.name, data: JSON.parse(project.data) });
  }

  /** Recebe um arquivo do computador (o corpo do pedido) e guarda no R2, dentro do projeto. */
  private async uploadProjectFile(request: Request, project: Project): Promise<Response> {
    const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const kind = assetKind(type);
    if (!kind) return new Response(ERROS.canvasArquivo, { status: 400 });
    const max = kind === "imagem" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    const tooBig = new Response(ERROS.canvasArquivoGrande(max / 1024 / 1024), { status: 413 });
    if (Number(request.headers.get("content-length") ?? 0) > max) return tooBig;
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return new Response(ERROS.canvasArquivo, { status: 400 });
    if (bytes.byteLength > max) return tooBig;
    let name = "arquivo";
    try {
      name = decodeURIComponent(request.headers.get("x-nome") ?? "").slice(0, 200) || name;
    } catch {}
    const { id } = await this.exports.saveFile(project.id, name, type, bytes);
    // som: false avisa a tela que o vídeo entra sem a camada de áudio (o WebM de uma animação).
    return Response.json({ src: `/projetos/${project.id}/arquivos/${id}`, ...(kind === "video" ? { som: temSom(bytes, type) } : {}) }, { status: 201 });
  }

  /** Os vídeos de todos os modelos que a pessoa pode usar, com filtro por status, busca pela fala e grade ou lista. */
  private async videosPage(user: User, url: URL): Promise<Response> {
    const q = (url.searchParams.get("q") ?? "").trim();
    // ?modelo= (do menu do card do modelo) só restringe; nunca mostra modelo que a pessoa não pode usar.
    const only = url.searchParams.get("modelo") ?? "";
    const usable = STRUCTURES.filter((s) => canUse(s, user) && !makesImage(s) && (!only || (s.family ?? s.id) === only));
    const videos = await this.db.conta(user.id).videos(usable.map((s) => s.id), q);
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
    intro: only ? "Os vídeos que você gerou com este modelo." : "Todos os vídeos que você gerou.",
    action: fab("add", "Novo vídeo", { href: "/" }),
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
  private async modelPage(user: User, structure: Structure, values?: Values, error?: string, picks?: AssetPicks): Promise<Response> {
    const { model, error: modelError } = await this.tryModel(structure);
    // Sem a chave da plataforma: no computador, nenhum aviso; no ar, um aviso na língua de quem usa.
    const canGenerate = this.studio.canGenerateWith(structure);
    const banner = modelError ?? (canGenerate || this.config.local ? null : ERROS.criacaoPausadaAviso);
    const sections = structure.sections(model, this.config.defaults, await this.studio.lists(structure, user.id));
    const value = values ?? defaultValues(sections);
    const cost = model ? estimate(structure, model, value) : undefined;
    const config = {
      prices: model ? prices(structure, model) : {},
      sku: structure.cost.sku,
      seconds: structure.cost.seconds,
      rate: structure.wordsPerSecond,
      durations: model?.supported_durations ?? null,
      extra: model ? fixedCost(structure, model) : (structure.cost.extra ?? 0),
    };
    const seconds = "field" in structure.cost.seconds ? `${value(structure.cost.seconds.field)} s` : "—";
    const image = makesImage(structure);
    // As versões do mesmo modelo dividem a lista.
    const videos = await this.db.conta(user.id).videos(familyOf(structure).filter((s) => canUse(s, user)).map((s) => s.id));
    const waiting = videos.some((v) => cardStatus(v).kind === "busy");
    // Os ativos abrem o painel, depois das seções que vêm antes (o "Uso"); o resto (a fala
    // inclusive) segue as seções da estrutura. O modelo aceita o que os campos dele pedem.
    const fields = sections.flatMap((s) => s.fields);
    const kinds = acceptedKinds(fields);
    const isFile = (f: Field) => fieldAsset(f) !== null;
    const voiceField = fields.find((f) => f.kind === "voice");
    const avatars = kinds.length ? await this.db.avatarsByUser(user.id) : [];
    // Campo que volta com o último texto usado com o avatar (as instruções do Omni, guardadas em `extra`).
    const family = familyOf(structure).filter((s) => canUse(s, user));
    const lastText = kinds.length && fields.some((f) => f.kind === "textarea" && f.perAvatar) ? await this.db.conta(user.id).lastExtraByAvatar(family.map((s) => s.id)) : undefined;
    const assets = kinds.length ? (await this.db.assetsByUser(user.id)).filter((a) => kinds.includes(a.kind)) : [];
    // "Adicionar ativo": a primeira página do que a pessoa já gerou, de todos os modelos, por tipo.
    const recent = (await Promise.all(kinds.map((k) => this.recentGenerated(user, structure, k)))).filter((r): r is PickItem => r !== null);
    const generated = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await this.generatedFrames(user, k, 0)] as const)));
    // As escolhas que não são ativo do avatar (Refazer, "Usar para gerar", geração com erro): só as que valem.
    if (picks) {
      const items: PickItem[] = [];
      for (const id of picks.assets.filter((a) => a.includes(":"))) {
        const found = await this.pickFile(id, user);
        if (found && kinds.includes(found.kind) && !items.some((i) => i.kind === found.kind)) items.push({ id, kind: found.kind, name: found.name, src: found.src, hint: found.hint });
      }
      picks = { avatar: picks.avatar, assets: picks.assets.filter((a) => !a.includes(":") || items.some((i) => i.id === a)), items };
    }
    const leads = sections.filter((s) => s.lead);
    const rest = sections.filter((s) => !s.lead).map((s) => ({ ...s, fields: s.fields.filter((f) => !isFile(f)) })).filter((s) => s.fields.length);

    const body = `
<main class="workspace" id="conteudo">
  <form class="workspace__form" method="post" action="/modelo/${structure.id}" enctype="multipart/form-data" data-composer='${esc(JSON.stringify(config))}'>
    <section class="pane pane--config" aria-labelledby="configuracao">
      <div class="pane__head"><h2 class="pane__headline" id="configuracao">Configuração</h2></div>
      <div class="pane__body" id="configuracao-corpo">
        ${family.length > 1 ? versionSwitch(family, structure) : ""}
        ${leads.map((f) => f.fields.map((field) => formField(field, value)).join("")).join("")}
        ${kinds.length ? assetList(picks, kinds, recent) : ""}
        ${rest.map((section) => formSection(section, value)).join("")}
      </div>
      ${generateBar(seconds, cost, Boolean(model) && (canGenerate || Boolean(this.config.local)), image)}
    </section>
    ${kinds.length ? assetPanel(avatars, assets, kinds, generated, voiceField ? { voices: voiceField.voices, value: value(voiceField.name) } : undefined, lastText) : ""}
    <div class="workspace__main">
      ${banner ? `<p class="banner" role="status"><span class="icon">error</span>${esc(banner)}</p>` : ""}
      ${videoLibrary(videos, {
        key: structure.id,
        from: `/modelo/${structure.id}`,
        title: image ? "Imagens" : "Vídeos",
        empty: emptyState(
          image ? "image" : "videocam",
          image ? "As imagens geradas aparecem aqui." : "Os vídeos gerados aparecem aqui.",
          image
            ? "Descreva a cena, escolha uma foto se quiser e toque em Gerar imagem."
            : fields.some((f) => f.kind === "video")
            ? "Escolha o vídeo, a foto e os ajustes e toque em Gerar vídeo."
            : fields.some((f) => f.kind === "textarea" && f.speech)
              ? "Escolha a foto e os ajustes, escreva a fala e toque em Gerar vídeo."
              : "Escolha a foto e os ajustes, descreva o movimento e toque em Gerar vídeo.",
        ),
        structureOf: () => structure,
        mine: kinds.length ? user.id : undefined,
        image,
      })}
    </div>
  </form>
</main>
${error ? snackbar(error) : ""}`;
    return html(page(`${structure.name} · ${SITE_NAME}`, body, { refresh: waiting, bar: { user, back: "/", title: structure.name } }), error ? 400 : 200);
  }

  /** Uma página do menu de vozes, só com o que os filtros pedem. */
  private async voiceList(user: User, url: URL): Promise<Response> {
    const found = structureById("heygen");
    if (!found || !canUse(found, user)) return new Response("não encontrado", { status: 404 });
    const structure = await this.studio.resolve(found);
    const lists = await this.studio.lists(structure, user.id);
    const voice = structure.sections(null, this.config.defaults, lists).flatMap((s) => s.fields).find((f) => f.kind === "voice");
    if (!voice) return new Response("não encontrado", { status: 404 });
    const q = url.searchParams, from = Math.max(0, Number(q.get("de")) || 0);
    const rows = voiceRows(voice.voices, { language: q.get("idioma") ?? "", gender: q.get("genero") ?? "", search: q.get("busca")?.trim() ?? "", from });
    return html(rows);
  }

  /** A amostra de uma voz pronta, só para quem pode usar o modelo; a HeyGen não aparece no navegador. */
  private async voicePreview(user: User, id: string): Promise<Response> {
    const structure = structureById("heygen");
    if (!structure || !canUse(structure, user)) return new Response("não encontrado", { status: 404 });
    try {
      const audio = await this.studio.voicePreview(id);
      if (audio) return new Response(audio.bytes, { headers: { ...SECURITY_HEADERS, "content-type": audio.type, "cache-control": "private, max-age=86400" } });
    } catch (err) {
      console.error("Não deu para baixar a amostra da voz", err);
    }
    return new Response("não encontrado", { status: 404 });
  }

  /** "Gerar vídeo editado", na prévia da edição rápida: põe o vídeo na fila do contêiner e volta para ele. */
  private async quickEdit(request: Request, user: User, id: string): Promise<Response> {
    const video = await this.db.conta(user.id).video(id);
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
    const video = await this.db.conta(user.id).video(id);
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
   * "Refazer": os valores do formulário tirados de um vídeo da própria pessoa (texto e ajustes), com
   * o avatar e os arquivos usados (as cópias que o vídeo guarda). Só os campos que existem
   * na estrutura usam esses valores; o resto fica no padrão.
   */
  private async redo(structure: Structure, id: string | null, user: User): Promise<{ values: Values; picks?: AssetPicks } | undefined> {
    // Só os vídeos da própria pessoa: o de outra não existe aqui.
    const v = id ? await this.db.conta(user.id).video(id) : null;
    if (!v || v.structure !== structure.id) return undefined;
    let settings: Record<string, string> = {};
    try { settings = JSON.parse(v.settings ?? "{}"); } catch {}
    const picks: AssetPicks = { avatar: "", assets: [] };
    const avatar = v.avatar_id ? await this.db.avatarById(v.avatar_id) : null;
    if (avatar?.user_id === user.id) picks.avatar = avatar.id;
    for (const kind of ASSET_ORDER) {
      // Do jeito que entrou: o ativo do avatar (se ainda existe), o vídeo gerado ou o arquivo enviado.
      const origin = settings[`ativo_${kind}`];
      const asset = origin && !origin.includes(":") && picks.avatar ? await this.db.asset(picks.avatar, origin) : null;
      if (asset?.kind === kind) picks.assets.push(asset.id);
      else if (origin?.startsWith("gerado:") && (await this.pickFile(origin, user))?.kind === kind) picks.assets.push(origin);
      else if (await this.pickFile(`origem:${v.id}:${kind}`, user)) picks.assets.push(`origem:${v.id}:${kind}`);
    }
    const { model } = await this.tryModel(structure);
    const base = defaultValues(structure.sections(model, this.config.defaults, await this.studio.lists(structure, user.id)));
    const from: Record<string, string | null | undefined> = {
      fala: v.prompt, descricao: v.prompt, resolucao: v.resolution, formato: v.aspect_ratio, duracao: String(v.duration),
      estilo: v.style, idioma: v.language, instrucoes: v.extra, movimento: settings.motion_prompt ?? v.extra,
      voz: settings.voice_id, expressividade: settings.expressiveness, roupa: settings.outfit, uso: settings.use,
      fonte: settings.source, clone: settings.voice_row,
    };
    return { values: (name) => from[name] || base(name), picks: picks.avatar || picks.assets.length ? picks : undefined };
  }

  /** A página do vídeo: o vídeo centralizado sobre ele mesmo desfocado e, ao lado, a folha com as informações. */
  private async videoPage(user: User, id: string, url: URL, error?: string): Promise<Response> {
    const v = await this.visibleVideo(user, id);
    const structure = v && videoStructure(v);
    if (!v || !structure || !canUse(structure, user)) return new Response("não encontrado", { status: 404 });
    // O vídeo de outra pessoa (o administrador, vindo do painel) só se vê: sem Refazer, Salvar, Usar nem Edição rápida.
    const mine = v.user_id === user.id;
    const avatars = await this.db.avatarsByUser(user.id);
    // De onde a pessoa veio (só caminhos do próprio site): a seta e o X voltam para lá.
    const from = url.searchParams.get("de") ?? "";
    const back = /^\/(?!\/)/.test(from) ? from : `/modelo/${structure.id}`;
    const showOriginal = url.searchParams.has("original");
    const status = cardStatus(v);
    const quick = mine && canQuickEdit(v, structure);
    const editing = v.status === "completed" && (v.edit_status === "pending" || v.edit_status === "processing");
    const edited = Boolean(v.edited_key) && !showOriginal;
    const src = edited ? editedSrc(v) : videoSrc(v);
    const ratio = esc(v.aspect_ratio.replace(":", " / "));
    // O modelo de imagem usa a mesma página, com a imagem no lugar do player (como a de um ativo).
    const image = makesImage(structure);
    const media = v.video_key && image
      ? `<img class="viewer__video" src="${mediaSrc(v)}" alt="${esc(v.prompt)}">`
      : v.video_key
      ? `<div class="player viewer__player" style="--ratio:${ratio}"${quick ? " data-player" : ""}><div class="player__frame"><video autoplay preload="metadata" playsinline src="${src}"></video>${
          quick ? `<div class="player__controls" data-qe-controls hidden><button class="icon-button interactive" type="button" data-qe-play aria-label="Tocar a prévia" title="Tocar a prévia"><span class="icon">play_arrow</span></button><span class="player__time" data-qe-time></span></div>` : ""
        }</div></div>`
      : status.kind === "error"
        ? `<div class="stage stage--error"><span class="icon">error</span><p class="stage__title">${esc(status.label)}</p><p class="stage__text">${esc(image ? ERROS.imagemFalhou : ERROS.videoFalhou)}</p></div>`
        : `<div class="stage"><span class="icon">${status.icon}</span><p class="stage__title">${esc(status.label)}</p><div class="linear-progress" role="progressbar" aria-label="${esc(status.label)}"></div><p class="stage__text">${image ? "Leva uns 20 segundos." : "Leva alguns minutos."} A página se atualiza sozinha.</p></div>`;
    // Campos de texto livre (movimento, instruções) ganham um bloco próprio, como o Texto; vazios não aparecem.
    const usedAvatar = v.avatar_id ? await this.db.avatarById(v.avatar_id) : null;
    const all = [{ term: "Modelo", description: structure.name }, ...(usedAvatar ? [{ term: "Avatar", description: usedAvatar.name }] : []), ...structure.details(v)];
    const notes = all.filter((d) => FREE_TEXT.has(d.term) && d.description !== "—");
    const details = [
      ...all.filter((d) => !FREE_TEXT.has(d.term)),
      ...(image ? [] : [{ term: "Duração", description: durationLabel(v, structure) }]),
      { term: "Resolução", description: v.resolution },
      { term: "Formato", description: v.aspect_ratio },
      { term: "Custo", description: v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : "—" },
      { term: "Criado em", description: formatDate(v.created_at) },
    ];
    // Sem MP4, o motivo da falha já está no card do vídeo: na folha ficam só os do áudio e da edição.
    const errors = [
      // O motivo técnico fica no banco e no log; a tela mostra a frase do catálogo.
      v.audio_status === "failed" ? (v.audio_error === ERROS.audioDemorou ? ERROS.audioDemorou : ERROS.audioFalhou) : null,
      v.edit_status === "failed" ? (v.edit_error === ERROS.edicaoDemorou ? ERROS.edicaoDemorou : ERROS.edicaoFalhou) : null,
    ].filter((e): e is string => Boolean(e));
    const downloads: MenuItem[] = v.video_key && image
      ? [{ label: "Original", icon: "image", href: `${mediaSrc(v)}?baixar`, download: true }]
      : v.video_key
      ? [
          // "Original" é o vídeo como aparece no player sem edição (com o áudio tratado, se houver);
          // o que veio do modelo, antes do tratamento, só aparece quando existe o tratado.
          { label: "Original", icon: "movie", href: `/videos/${v.id}.mp4?baixar`, download: true },
          ...(v.edited_key ? [{ label: "Editado", icon: "content_cut", href: `${editedSrc(v)}&baixar`, download: true }] : []),
          ...(v.processed_key ? [{ label: "Sem tratamento de áudio", icon: "graphic_eq", href: `/videos/${v.id}.original.mp4?baixar`, download: true }] : []),
        ]
      : [];
    // O avatar usado para gerar vem primeiro na lista.
    const used = avatars.find((a) => a.id === v.avatar_id);
    const ordered = used ? [used, ...avatars.filter((a) => a !== used)] : avatars;
    const saveButton = mine && v.video_key ? `<button class="button button--outlined interactive viewer__save" type="button" data-dialog-open="salvar-avatar"><span class="icon">bookmark_add</span>Salvar no avatar</button>` : "";
    // "Usar para gerar": só quando a página foi aberta de um modelo que aceita este tipo; volta para ele com o arquivo no painel.
    const useIn = mine ? await this.useTarget(v, from, user) : null;
    const useButton = useIn ? `<a class="button button--outlined interactive viewer__save" href="/modelo/${useIn}?usar=gerado:${v.id}"><span class="icon">auto_awesome</span>Usar para gerar</a>` : "";
    const saveDialog = mine && v.video_key
      ? avatarDialog({
          id: "salvar-avatar",
          title: "Salvar no avatar",
          avatars: ordered,
          item: (a, content) => `<form method="post" action="/videos/${v.id}/salvar-avatar"><button class="avatar-option interactive" type="submit" name="avatar" value="${a.id}">${content}</button></form>`,
          note: (a) => (a.id === v.avatar_id ? "Usado neste vídeo" : null),
          newHref: `/avatares/novo?video=${v.id}`,
        })
      : "";
    const avatar = v.image_key?.startsWith("avatares/") ? `<img class="viewer__avatar" src="/midia/${esc(v.image_key)}" alt="Foto do avatar">` : "";
    const info = `
        <div class="viewer__panel" data-tab-panel="info">
          ${editing ? `<section class="viewer__card qe-busy" role="status"><h2 class="qe-result__title">Editando o vídeo</h2><div class="linear-progress" role="progressbar" aria-label="Editando o vídeo"></div><p class="qe-result__note">Fica pronto em 1 a 2 min.</p></section>` : ""}
          ${errors.map((e) => `<p class="dialog__error">${esc(e)}</p>`).join("")}
          <section class="viewer__section">
            <div class="viewer__section-head"><h2 class="viewer__title">${image ? "Descrição" : "Texto"}</h2>${v.prompt ? `<button class="button button--text interactive" type="button" data-copy="${esc(v.prompt)}"><span class="icon">content_copy</span><span>Copiar</span></button>` : ""}</div>
            <div class="viewer__card">${avatar}${v.prompt ? `<p class="viewer__text">${esc(v.prompt)}</p>` : ""}</div>
          </section>
          ${notes
            .map((d) => `<section class="viewer__section"><h2 class="viewer__title">${esc(d.term)}</h2><div class="viewer__card"><p class="viewer__text">${esc(d.description)}</p></div></section>`)
            .join("")}
          ${detailsCard("Detalhes", details.map((d) => ({ icon: DETAIL_ICONS[d.term] ?? "info", term: d.term, value: d.description })))}
          ${saveButton}
          ${useButton}
        </div>`;
    const body = `
<main class="viewer" id="conteudo">
  <section class="viewer__stage${image ? " viewer__stage--asset" : ""}" aria-label="${image ? "Imagem" : "Vídeo"}" style="--ratio:${ratio}">
    <a class="viewer__nav viewer__nav--prev icon-button interactive" data-nav="prev" hidden aria-label="Vídeo anterior" title="Vídeo anterior"><span class="icon">chevron_left</span></a>
    ${media}
    ${
      v.video_key && !image
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
  <aside class="viewer__sheet" aria-label="${image ? "Informações da imagem" : "Informações do vídeo"}" data-viewer="${v.id}" data-back="${esc(back)}">
    <div class="viewer__head">
      <p class="status-line status-line--${status.kind}"><span class="icon">${status.kind === "done" ? "check_circle" : status.icon}</span>${esc(status.label)}</p>
      <a class="icon-button interactive" href="${esc(back)}" aria-label="Fechar" title="Fechar"><span class="icon">close</span></a>
    </div>
    ${
      quick
        ? `<div class="tabs" role="tablist">
      <button class="tabs__tab interactive" type="button" role="tab" data-tab="info" aria-selected="true"><span class="tabs__content"><span class="icon">info</span>Informações</span></button>
      <button class="tabs__tab interactive" type="button" role="tab" data-tab="qe" aria-selected="false"><span class="tabs__content"><span class="icon">content_cut</span>Edição rápida</span></button>
    </div>
    <button type="button" data-qe-open hidden></button>`
        : ""
    }
    <div class="viewer__body">
      ${info}
      ${quick ? quickEditPreview(v, showOriginal) : ""}
    </div>
    <div class="viewer__actions">
      ${mine ? `<a class="button button--filled interactive" href="/modelo/${structure.id}?refazer=${v.id}"><span class="icon">refresh</span>Refazer</a>` : ""}
      ${downloads.length === 1 ? `<a class="button button--outlined interactive" href="${downloads[0]!.href}" download><span class="icon">download</span>Baixar</a>` : downloads.length ? downloadMenu(downloads) : ""}
    </div>
  </aside>
</main>
${saveDialog}
${quick ? `<form id="edicao-rapida" method="post" action="/videos/${v.id}/edicao-rapida" hidden></form><script nonce="${NONCE}">${PREVIEW_SCRIPT}</script>` : ""}
${error ? snackbar(error) : ""}`;
    return html(page(`${image ? "Imagem" : "Vídeo"} · ${structure.name} · ${SITE_NAME}`, body, { refresh: status.kind === "busy", bar: { user, back, title: structure.name } }), error ? 400 : 200);
  }

  /** O modelo de onde a página do vídeo foi aberta, se ele aceita o vídeo (ou imagem) pronto da pessoa como referência. */
  private async useTarget(v: Video, back: string, user: User): Promise<string | null> {
    const id = /^\/modelo\/([a-z0-9-]+)(?:[?#]|$)/.exec(back)?.[1];
    const found = id ? structureById(id) : undefined;
    if (!found || !canUse(found, user)) return null;
    // A mesma conferência da escolha no painel (dono, pronto, arquivo no R2): o botão nunca leva a nada.
    const pick = await this.pickFile(`gerado:${v.id}`, user);
    const structure = await this.studio.resolve(found);
    return pick && acceptedKinds(structure.sections(null, this.config.defaults, {}).flatMap((s) => s.fields)).includes(pick.kind) ? structure.id : null;
  }

  private async tryModel(structure: Structure): Promise<{ model: VideoModel | null; error: string | null }> {
    // A API direta da HeyGen não tem lista de modelos: o que ela aceita fica na estrutura.
    if (structure.platform === "heygen") return { model: HEYGEN_MODEL, error: null };
    try {
      // Sem a chave: no computador, a lista pública de modelos (o formulário mostra todas as opções);
      // no ar, nada (o aviso diz que a criação está pausada). Assim os testes não vão à rede.
      if (!this.studio.canGenerate) {
        if (!this.config.local) return { model: null, error: null };
        const list = makesImage(structure) ? await OpenRouterVideo.listImageModels() : await OpenRouterVideo.listModels();
        const model = list.find((m) => m.id === structure.model);
        return { model: model ?? null, error: null };
      }
      return { model: await this.studio.modelOf(structure), error: null };
    } catch (err) {
      console.error(`Não deu para ler o modelo ${structure.model}:`, err);
      return { model: null, error: ERROS.opcoesIndisponiveis };
    }
  }

  private async createVideo(request: Request, user: User, structure: Structure): Promise<Response> {
    const form = await request.formData();
    const { model } = await this.tryModel(structure);
    const sections = structure.sections(model, this.config.defaults, await this.studio.lists(structure, user.id));
    const values = formValues(form, sections);
    const fields = sections.flatMap((s) => s.fields);
    // O mesmo tipo pode ser enviado no menu do avatar ou no "Adicionar ativo": vale o que tiver arquivo.
    const file = (name: string) => form.getAll(name).find((f): f is File => f instanceof File && f.size > 0) ?? null;
    // Cada tipo vem de um arquivo solto ou de um ativo do avatar escolhido.
    const picks: AssetPicks = { avatar: String(form.get("avatar") ?? ""), assets: form.getAll("ativo").map(String) };
    const kinds = acceptedKinds(fields);
    const chosen = await this.pickedFiles(picks, user, kinds);
    if (!chosen) return this.modelPage(user, structure, values, ERROS.ativoIndisponivel);
    // De onde veio cada arquivo (ativo do avatar, vídeo gerado ou envio solto): o "Refazer" traz igual.
    const origins: Record<string, string> = {};
    for (const kind of kinds) {
      const upload = file(ASSET_UPLOAD[kind].name);
      // O arquivo de um vídeo anterior (Refazer) é a cópia de um envio: conta como enviado, com o mesmo nome.
      const id = chosen.ids[kind], name = id?.startsWith("origem:") ? chosen.files[kind]!.name : !id && upload ? upload.name : null;
      const origin = name ? `arquivo:${name.slice(0, 200)}` : id;
      if (origin) origins[`ativo_${kind}`] = origin;
    }
    let video: Video;
    try {
      video = await this.studio.create({ structure, values, image: chosen.files.imagem ?? file("imagem"), video: chosen.files.video ?? file("video"), audio: chosen.files.audio ?? file("audio"), sample: file("amostra"), avatarId: picks.avatar || null, origins, user });
    } catch (err) {
      if (err instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
      if (!(err instanceof InputError)) throw err;
      return this.modelPage(user, structure, values, err.message, picks);
    }
    return redirect(`/modelo/${structure.id}?video=${video.id}`);
  }

  /**
   * Os ativos escolhidos, como arquivos para o modelo: do avatar da própria pessoa, de um vídeo
   * ou imagem que ela gerou ou dos arquivos de um vídeo dela (Refazer); um por tipo e só dos
   * tipos que o modelo aceita. null: a escolha não vale.
   */
  private async pickedFiles(picks: AssetPicks, user: User, kinds: AssetKind[]): Promise<{ files: Partial<Record<AssetKind, File>>; ids: Partial<Record<AssetKind, string>> } | null> {
    const avatar = picks.avatar ? await this.db.avatarById(picks.avatar) : null;
    if (picks.avatar && avatar?.user_id !== user.id) return null;
    const files: Partial<Record<AssetKind, File>> = {};
    const ids: Partial<Record<AssetKind, string>> = {};
    for (const id of picks.assets) {
      const asset = id.includes(":") ? await this.pickFile(id, user) : avatar ? await this.db.asset(avatar.id, id) : null;
      if (!asset || !kinds.includes(asset.kind) || files[asset.kind]) return null;
      const object = await this.media.get(asset.key);
      if (!object) return null;
      const type = "type" in asset ? asset.type : (object.httpMetadata?.contentType ?? "");
      files[asset.kind] = new File([await object.arrayBuffer()], asset.name, { type });
      ids[asset.kind] = id;
    }
    return { files, ids };
  }

  /**
   * "Usar … recente": o mais recente daquele tipo que a pessoa gerou no próprio modelo, se ele gera
   * esse tipo (e já gerou algum); senão, dos modelos que geram. Hoje os modelos geram imagem ou vídeo
   * (áudio, nenhum).
   */
  private async recentGenerated(user: User, structure: Structure, kind: AssetKind): Promise<PickItem | null> {
    const output = (s: Structure): AssetKind => (makesImage(s) ? "imagem" : "video");
    const all = STRUCTURES.filter((s) => output(s) === kind).map((s) => s.id);
    // O próprio modelo primeiro; sem nada gerado nele ainda, os outros que geram o tipo.
    const own = output(structure) === kind ? (await this.db.conta(user.id).ready(familyOf(structure).map((s) => s.id), 0, 1))[0] : undefined;
    const v = own ?? (await this.db.conta(user.id).ready(all, 0, 1))[0];
    const found = v ? await this.pickFile(`gerado:${v.id}`, user) : null;
    return found ? { id: found.id, kind: found.kind, src: found.src, name: found.name, hint: found.hint } : null;
  }

  /** Uma página dos vídeos ou imagens prontos da pessoa, de todos os modelos, como quadros do "Adicionar ativo". */
  private async generatedFrames(user: User, kind: AssetKind, from: number): Promise<string> {
    if (kind === "audio") return "";
    const structures = STRUCTURES.filter((s) => (makesImage(s) ? "imagem" : "video") === kind).map((s) => s.id);
    const videos = await this.db.conta(user.id).ready(structures, from, GENERATED_PAGE + 1);
    const frames = videos.slice(0, GENERATED_PAGE).map((v) => {
      const structure = videoStructure(v)!;
      return pickFrame({ ...generatedPick(v, structure), thumb: outputThumb(v, structure) });
    });
    const more = videos.length > GENERATED_PAGE ? `<div class="voice-more asset-grid__more"><button class="button button--text interactive" type="button" data-generated-more="${from + GENERATED_PAGE}" data-generated-kind="${kind}">Mostrar mais</button></div>` : "";
    return frames.join("") + more;
  }

  /**
   * Uma escolha que não é ativo de avatar, só de vídeo da própria pessoa: `gerado:<id>` é o
   * resultado pronto (a versão que vale); `origem:<id>:<tipo>` é o arquivo que ela usou para gerá-lo.
   */
  private async pickFile(id: string, user: User): Promise<PickedFile | null> {
    const m = /^(?:gerado:([0-9a-f-]{36})|origem:([0-9a-f-]{36}):(imagem|video|audio))$/.exec(id);
    const video = m ? await this.db.conta(user.id).video(m[1] ?? m[2]!) : null;
    if (!m || !video) return null;
    if (m[1]) {
      const ready = await this.savableVideo(video.id, user);
      if (!ready || video.status !== "completed") return null;
      return { ...generatedPick(video, ready.structure), key: ready.key };
    }
    const kind = m[3] as AssetKind;
    let settings: Record<string, string> = {};
    try { settings = JSON.parse(video.settings ?? "{}"); } catch {}
    const key = kind === "imagem" ? video.image_key : kind === "video" ? settings.source_key : settings.audio_key;
    if (!key || !(await this.media.head(key))) return null;
    // Enviado solto: volta com o nome e como envio. De um ativo ou vídeo que já não existe (ou de antes
    // de o vídeo guardar a origem), a cópia que o vídeo guarda.
    const sent = settings[`ativo_${kind}`]?.startsWith("arquivo:") ? settings[`ativo_${kind}`]!.slice("arquivo:".length) : null;
    return { id, kind, key, name: sent || ASSET_LABELS[kind], src: `/videos/${video.id}/referencia/${kind}`, hint: sent ? "Arquivo enviado" : "Do vídeo original" };
  }

  private async login(request: Request): Promise<Response> {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const result = await this.accounts.login(email, String(form.get("senha") ?? ""));
    if (result.ok) return redirect("/", sessionCookie(result.token));
    if (result.reason === "locked") {
      return html(loginPage(ERROS.contaBloqueada(formatDate(result.until)), email), 400);
    }
    return html(loginPage(ERROS.loginIncorreto, email), 400);
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
    if (password !== String(form.get("confirmar") ?? "")) return this.signupPage(ERROS.senhasDiferentes, { name, email });
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
    // Aberto direto no navegador, o arquivo nunca vira página que roda script com a sessão de quem está
    // logado (um SVG ou HTML guardado antes da lista fechada de tipos): sem adivinhar o tipo, sem script.
    headers.set("x-content-type-options", "nosniff");
    headers.set("content-security-policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
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
  if (v.prep_status === "compose" || v.prep_status === "composing") {
    // Voltou do Aleph: o contêiner junta a cabeça e o cabelo trocados com o resto do original.
    return { label: `Finalizando · ${minutes(v.created_at)} min`, icon: "auto_awesome", kind: "busy" };
  }
  if (v.status === "submitting" && (v.prep_status === "pending" || v.prep_status === "processing")) {
    // A troca de avatar pelo Aleph 2 prepara o vídeo e os quadros-chave antes do envio.
    return { label: `Preparando · ${minutes(v.created_at)} min`, icon: "auto_awesome", kind: "busy" };
  }
  const status = STATUS[v.status];
  // Na fila: quanto tempo já passou, para não parecer travado (720p leva uns 10 min).
  return status.kind === "busy" ? { ...status, label: `${status.label} · ${minutes(v.created_at)} min` } : status;
}

/** Cor do ícone de cada modelo, na ordem dos cards. */
const MODEL_TONES = ["primary", "tertiary", "secondary"] as const;

/** Projeto novo: só o bloco Final (src/canvas/modelo.js). */
const EMPTY_PROJECT = JSON.stringify({ blocks: [], finals: [], edges: [] });
/** O canvas salvo (JSON): até 1 MB. */
const MAX_PROJECT_BYTES = 1024 * 1024;

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
  /** A ação muda algo no servidor: vira um formulário POST para href (como o Sair). */
  post?: boolean;
}

/** Menu do M3 aberto por um botão de ícone (três pontos); fecha ao escolher ou ao tocar fora (SCRIPT). */
function overflowMenu(label: string, items: MenuItem[]): string {
  return `<details class="menu" data-menu>
      <summary class="icon-button interactive" aria-label="${esc(label)}" title="Mais opções"><span class="icon">more_vert</span></summary>
      <div class="menu__list">${items
        .map((i) =>
          i.post
            ? `<form method="post" action="${esc(i.href)}"><button class="menu__item interactive" type="submit"><span class="icon">${i.icon}</span>${esc(i.label)}</button></form>`
            : `<a class="menu__item interactive" href="${esc(i.href)}"${i.download ? " download" : ""}><span class="icon">${i.icon}</span>${esc(i.label)}</a>`,
        )
        .join("")}</div>
    </details>`;
}

/**
 * Card da grade (modelos e vídeos): o ícone em cima, à esquerda, com o menu à
 * direita, e o título e a linha de apoio embaixo. O card inteiro é o link; o
 * menu fica por cima dele.
 */
/** O tipo de ativo pelo tipo do arquivo; arquivo de outro tipo não entra. */
/**
 * Os tipos de arquivo que o site guarda (ativos do avatar, arquivos dos projetos, o envio do MCP): uma
 * lista fechada, e não qualquer image/*. SVG e HTML ficam de fora: podem levar script e o arquivo é
 * servido pelo próprio endereço do site. WebM é o vídeo das animações (render).
 */
const MEDIA_KINDS: Record<string, AssetKind> = {
  "image/jpeg": "imagem", "image/png": "imagem", "image/webp": "imagem",
  "video/mp4": "video", "video/quicktime": "video", "video/webm": "video",
  "audio/mpeg": "audio", "audio/wav": "audio", "audio/x-wav": "audio", "audio/mp4": "audio", "audio/x-m4a": "audio", "audio/ogg": "audio",
};

function assetKind(type: string): AssetKind | null {
  return MEDIA_KINDS[type.split(";")[0]!.trim().toLowerCase()] ?? null;
}

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
function quickEditPreview(v: Video, showOriginal = false): string {
  const config = {
    src: videoSrc(v),
    face: `/videos/${v.id}/rosto`,
    previaIndisponivel: ERROS.previaIndisponivel,
    rules: RULES,
    pauses: Object.fromEntries(PAUSES.map((p) => [p.value, p.pause])),
    cameras: Object.fromEntries(CAMERAS.map((c) => [c.value, c.zooms])),
  };
  // Já editado: as escolhas da edição que vale vêm marcadas, e a aba diz quando e como foi feita.
  let plan: { pause?: string; camera?: string } = {};
  // Vídeos editados antes das colunas edited_*: o último plano e o início da edição.
  try { plan = v.edited_key ? JSON.parse(v.edited_plan ?? v.edit_plan ?? "{}") : {}; } catch {}
  const pause = PAUSES.find((p) => p.value === plan.pause), camera = CAMERAS.find((c) => c.value === plan.camera);
  const editedAt = v.edited_at ?? v.edit_started_at;
  const when = v.edited_key && editedAt ? formatDate(editedAt) : null;
  const rows = [
    when ? { icon: "calendar_today", label: "Editado em", value: when } : null,
    pause ? { icon: "content_cut", label: "Pausas", value: pause.label } : null,
    camera ? { icon: "videocam", label: "Câmera", value: camera.label } : null,
  ].filter((r): r is { icon: string; label: string; value: string } => r !== null);
  const existing = v.edited_key
    ? `<div class="qe-existing" data-qe-existing>
            <div class="segmented-button qe-versions" role="group" aria-label="Versão no player">
              <button class="segmented-button__segment interactive" type="button" data-version="${videoSrc(v)}"${showOriginal ? ' aria-current="true"' : ""}>Original</button>
              <button class="segmented-button__segment interactive" type="button" data-version="${esc(editedSrc(v))}"${showOriginal ? "" : ' aria-current="true"'}><span class="icon">content_cut</span>Editado</button>
            </div>
            <section class="viewer__card qe-existing__card" aria-labelledby="ja-editado">
              <h3 class="qe-result__title" id="ja-editado">Este vídeo já foi editado</h3>
              ${rows.map((r) => `<div class="qe-result__row"><span class="icon" aria-hidden="true">${r.icon}</span><span class="qe-result__label">${esc(r.label)}</span><span class="qe-result__value">${esc(r.value)}</span></div>`).join("")}
            </section>
            <button class="button button--outlined interactive qe-existing__again" type="button" data-qe-again><span class="icon">edit</span>Editar de novo</button>
            <p class="qe-existing__warn"><span class="icon">info</span>A nova edição substitui a atual.</p>
          </div>`
    : "";
  return `<section class="quick-edit" data-quick-edit='${esc(JSON.stringify(config))}'${v.edited_key ? " data-edited" : ""} hidden aria-labelledby="edicao-rapida-titulo">
          ${existing}
          <div class="quick-edit__head">
            <h2 class="quick-edit__title" id="edicao-rapida-titulo">Edição rápida</h2>
            <p class="quick-edit__summary" data-qe-summary role="status"></p>
          </div>
          <div class="quick-edit__fields">
            ${segmented("pausa", "Pausas", PAUSES, pause?.value ?? DEFAULT_PAUSE, "edicao-rapida")}
            ${segmented("camera", "Câmera", CAMERAS, camera?.value ?? DEFAULT_CAMERA, "edicao-rapida")}
          </div>
          <button class="button button--tonal interactive quick-edit__preview" type="button" data-qe-preview><span class="icon">auto_awesome</span><span>Gerar prévia</span></button>
          <p class="quick-edit__hint" data-qe-hint hidden>Tocando no player.</p>
          <input type="hidden" name="trechos" form="edicao-rapida" data-qe-parts>
          <div class="quick-edit__actions">
            <button class="button button--outlined interactive" type="button" data-qe-close>Cancelar</button>
            <button class="button button--filled interactive" type="submit" form="edicao-rapida"><span class="icon">content_cut</span>${v.edited_key ? "Substituir editado" : "Gerar editado"}</button>
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
/**
 * O seletor Versão das estruturas com versões (o Omni 1.1 e 1.2): o mesmo grupo de botões
 * conectados, mas fora do formulário; trocar abre a página da outra versão (SCRIPT).
 */
function versionSwitch(family: Structure[], current: Structure): string {
  const options = [...family].sort((a, b) => (a.version ?? "").localeCompare(b.version ?? "")).map((s) => ({ value: s.id, label: s.version ?? s.name }));
  return segmented("versao", "Versão", options, current.id, "versao-fora").replace('<fieldset class="segmented-field">', '<fieldset class="segmented-field" data-version-switch>');
}

function segmented(name: string, label: string, options: Option[], selected: string, form?: string, hideLabel?: boolean): string {
  const owner = form ? ` form="${form}"` : "";
  // Opções com explicação: a da escolhida aparece embaixo (o script troca ao mudar).
  const help = options.find((o) => o.value === selected)?.description;
  return `<fieldset class="segmented-field">
          <legend class="${hideLabel ? "visually-hidden" : "segmented-field__label"}">${esc(label)}</legend>
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
const FREE_TEXT = new Set(["Movimento", "Instruções extras", "Instruções"]);

/** Ícone de cada linha dos detalhes do vídeo (precisa estar em ICONS); o que faltar usa "info". */
const DETAIL_ICONS: Record<string, string> = {
  Modelo: "movie", Avatar: "face", Voz: "record_voice_over", Expressividade: "face", Movimento: "gesture",
  Estilo: "palette", "Idioma da fala": "translate", "Instruções extras": "notes", Instruções: "notes", "Vídeo de origem": "videocam", Roupa: "checkroom", Uso: "auto_awesome", "Quadros-chave": "photo_library",
  Duração: "schedule", Resolução: "hd", Formato: "aspect_ratio", Custo: "payments", "Criado em": "calendar_today",
};

/** Botão "Baixar" com menu das versões do vídeo (original, áudio tratado, editado). */
function downloadMenu(items: MenuItem[]): string {
  return `<details class="menu menu--up" data-menu>
        <summary class="button button--outlined interactive"><span class="icon">download</span>Baixar<span class="icon">arrow_drop_down</span></summary>
        <div class="menu__list" role="menu">${items.map((i) => `<a class="menu__item interactive" role="menuitem" href="${i.href}" download><span class="icon">${i.icon}</span>${esc(i.label)}</a>`).join("")}</div>
      </details>`;
}

/** O ponto entre os olhos, em frações do quadro; sem rosto, o terço de cima. */
function facePoint(json: string | null | undefined): [number, number] {
  let face: { x?: number; y?: number } = {};
  try { face = JSON.parse(json ?? "{}"); } catch {}
  return [typeof face.x === "number" ? face.x : 0.5, typeof face.y === "number" ? face.y : 0.35];
}

/** A imagem cortada no rosto: o script da página põe o corte quando sabe o tamanho dela. */
function faceImage(src: string, face: string | null | undefined, cls = ""): string {
  return `<img${cls ? ` class="${cls}"` : ""} src="${src}" alt="" loading="lazy" data-face="${facePoint(face).join(",")}">`;
}

/**
 * Onde a miniatura quadrada corta o vídeo (object-position): com o rosto achado (rosto.py: o ponto
 * entre os olhos, em frações do quadro), os olhos ficam a 40% da altura e no meio da largura;
 * sem ele, o terço de cima (onde o rosto costuma estar).
 */
function thumbPosition(v: Video): string {
  const [fx, fy] = facePoint(v.face);
  const [w, h] = v.aspect_ratio.split(":").map(Number);
  const ratio = w && h ? h / w : 16 / 9;
  // Corte no eixo que sobra: a parte do vídeo fora do quadrado, de 0 a 100%.
  const pct = (r: number, f: number, target: number) => (r > 1 ? Math.min(100, Math.max(0, ((r * f - target) / (r - 1)) * 100)) : 50);
  return `${pct(1 / ratio, fx, 0.5).toFixed(1)}% ${pct(ratio, fy, 0.4).toFixed(1)}%`;
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
 * A área central: os vídeos do modelo agrupados por data, em cards quadrados só com a imagem
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
  /** Frase embaixo do título, no padrão das páginas (Modelos e Vídeos); sem ela, o título é o da lista. */
  intro?: string;
  /** Ação ao lado do título (o "Novo vídeo" da aba Vídeos). */
  action?: string;
  /** O que mostrar sem vídeos. */
  empty: string;
  structureOf: (v: Video) => Structure;
  /** Quem vê a lista: os vídeos prontos dela podem ser arrastados para o painel do modelo. */
  mine?: number;
  /** Lista de imagens (o modelo de imagem): Descrição no lugar do Texto e Resolução no da Duração. */
  image?: boolean;
}

/** Título, contagem e texto de uma tela de lista; `action` é o botão principal (fab). */
function pageHead(title: string, count: number, intro: string, action = ""): string {
  return `<div class="page__head">
    <div>
      <h1 class="page__headline">${esc(title)} <span class="pane__count">${count}</span></h1>
      <p class="page__intro">${esc(intro)}</p>
    </div>
    ${action ? `<div class="library__end">${action}</div>` : ""}
  </div>`;
}

/** O botão principal das telas, o mesmo em todas ("Novo vídeo", "Novo avatar"): link ou envio de formulário. */
function fab(icon: string, label: string, to: { href: string } | { post: string }): string {
  const content = `<span class="icon">${icon}</span>${esc(label)}`;
  return "href" in to
    ? `<a class="fab fab--extended interactive" href="${to.href}">${content}</a>`
    : `<form method="post" action="${to.post}"><button class="fab fab--extended interactive" type="submit">${content}</button></form>`;
}

/** A busca e a lista de avatares: `item` diz o que tocar faz. No diálogo e no painel de ativos. */
function avatarPicker(o: { avatars: Avatar[]; item: (a: Avatar, content: string) => string; note?: (a: Avatar) => string | null }): string {
  const row = (a: Avatar) => {
    const cover = a.cover ? faceImage(`/avatares/${a.id}/arquivos/${esc(a.cover)}`, a.cover_face, "avatar-cover") : `<span class="icon-tile icon-tile--large icon-tile--primary" aria-hidden="true"><span class="icon">face</span></span>`;
    const support = o.note?.(a) ?? (a.assets === 1 ? "1 ativo" : `${a.assets ?? 0} ativos`);
    return `<li data-avatar-item="${esc(a.name.toLowerCase())}">${o.item(a, `${cover}<span class="avatar-option__text"><span class="vrow__headline">${esc(a.name)}</span><span class="vrow__support">${esc(support)}</span></span>`)}</li>`;
  };
  return `${o.avatars.length ? `<div class="search-field"><span class="icon" aria-hidden="true">search</span><input class="search-field__input" type="search" placeholder="Pesquisar avatares" aria-label="Pesquisar avatares" data-avatar-search></div>` : ""}
    <ul class="dialog__list">${o.avatars.map(row).join("")}</ul>
    <p class="library__empty" data-avatar-none${o.avatars.length ? " hidden" : ""}>Nenhum avatar encontrado.</p>`;
}

/**
 * Diálogo para escolher um avatar (M3: diálogo básico), com busca para quando houver muitos.
 * `item` diz o que tocar faz.
 */
function avatarDialog(o: { id: string; title: string; avatars: Avatar[]; item: (a: Avatar, content: string) => string; note?: (a: Avatar) => string | null; newHref?: string }): string {
  return `<dialog class="dialog" id="${o.id}" aria-labelledby="${o.id}-titulo">
    <h2 class="dialog__title" id="${o.id}-titulo">${esc(o.title)}</h2>
    ${avatarPicker(o)}
    <form class="dialog__actions" method="dialog">
      <a class="button button--text interactive dialog__start" href="${o.newHref ?? "/avatares/novo"}"><span class="icon">add</span>Novo avatar</a>
      <button class="button button--text interactive" type="submit">Cancelar</button>
    </form>
  </dialog>`;
}

/**
 * O que o painel do modelo guarda: o avatar e, abaixo dele, os ativos escolhidos um a um. O script
 * da página monta as linhas; `picks` devolve a escolha (geração com erro, Refazer, "Usar para gerar").
 * "Adicionar ativo" vale com ou sem avatar: envio e o que a pessoa já gerou (os ativos do avatar
 * ficam no caminho do avatar).
 */
function assetList(picks: AssetPicks | undefined, kinds: AssetKind[], recent: PickItem[]): string {
  const pick = picks?.avatar || picks?.assets.length ? ` data-picks="${esc(JSON.stringify(picks))}"` : "";
  return `<section class="form-section form-section--assets"${pick} aria-labelledby="ativos-titulo">
        <h2 class="form-section__title" id="ativos-titulo">Avatar</h2>
        <input type="hidden" name="avatar" value="" data-avatar-input>
        <ul class="file-list" data-asset-list>
          <li><button class="file-picker interactive" type="button" data-panel-open="avatares" aria-expanded="false"><span class="file-picker__preview file-picker__preview--empty" data-avatar-preview><span class="icon">face</span></span><span class="file-picker__text"><span class="file-picker__name" data-avatar-name>Adicionar avatar</span></span></button></li>
          <li data-asset-add><button class="file-picker interactive" type="button" data-panel-open="referencias" aria-expanded="false"><span class="file-picker__preview file-picker__preview--empty"><span class="icon">add</span></span><span class="file-picker__text"><span class="file-picker__name">Adicionar ativo</span></span></button></li>
        </ul>
        <div class="menu__list context-menu" popover role="menu" aria-label="Adicionar ativo" data-paste-menu>${kinds.includes("imagem") ? `<button class="menu__item interactive" type="button" role="menuitem" data-paste-item><span class="icon">content_paste</span>Colar imagem</button>` : ""}${recent
          .map((r) => `<button class="menu__item interactive" type="button" role="menuitem" data-recent-item="${esc(JSON.stringify(r))}"><span class="icon">history</span>Usar ${ASSET_LABELS[r.kind].toLowerCase()} recente</button>`)
          .join("")}</div>
        <template data-asset-row><li data-asset-row><div class="file-picker"><span class="file-picker__preview" data-row-preview></span><span class="file-picker__text"><span class="file-picker__name" data-row-name></span><span class="file-picker__hint" data-row-hint></span></span><button class="icon-button interactive" type="button" data-row-remove aria-label="Remover"><span class="icon">close</span></button></div></li></template>
      </section>`;
}

/** O limite e o envio de cada tipo de ativo. Cada modelo aceita um de cada tipo. */
const ASSET_UPLOAD: Record<AssetKind, { name: string; accept: string; plural: string; one: string }> = {
  imagem: { name: "imagem", accept: "image/jpeg,image/png,image/webp", plural: "Fotos", one: "1 foto" },
  video: { name: "video", accept: "video/mp4,video/quicktime", plural: "Vídeos", one: "1 vídeo" },
  audio: { name: "audio", accept: "audio/mpeg,audio/wav,audio/x-wav", plural: "Áudios", one: "1 áudio" },
};

/**
 * O menu que se desdobra ao lado do painel: primeiro o avatar, depois os ativos dele, só dos
 * tipos que o modelo aceita. Fica dentro do formulário: enviar um arquivo aqui vai junto.
 */
function assetPanel(avatars: Avatar[], assets: AvatarAsset[], kinds: AssetKind[], generated: Partial<Record<AssetKind, string>>, voice?: { voices: VoiceOption[]; value: string }, lastText?: Map<string, string>): string {
  const src = (a: AvatarAsset) => `/avatares/${a.avatar_id}/arquivos/${a.id}`;
  const frame = (a: AvatarAsset) => pickFrame({ id: a.id, of: a.avatar_id, kind: a.kind, src: src(a), name: a.name, thumb: assetThumb(a, src(a)) });
  // Os dois menus de ativos (o do avatar e o "Adicionar ativo") têm os mesmos chips por tipo e o mesmo envio.
  const byKind = (content: (k: AssetKind) => string) => `${kinds.length > 1 ? `<div class="chip-set" role="group" aria-label="Tipo de ativo">${kinds.map((k, i) => `<button class="chip interactive" type="button" data-kind="${k}" aria-pressed="${i === 0}"><span class="icon chip__check">check</span>${ASSET_UPLOAD[k].plural}</button>`).join("")}</div>` : ""}
        ${kinds
          .map(
            (k, i) => `<div class="side-panel__kind" data-kind-view="${k}"${i ? " hidden" : ""}>
          <p class="side-panel__help">Este modelo aceita ${ASSET_UPLOAD[k].one}.</p>
          <div class="asset-grid">
            <label class="asset-upload interactive"><input class="visually-hidden" type="file" name="${ASSET_UPLOAD[k].name}" accept="${ASSET_UPLOAD[k].accept}" aria-label="Enviar arquivo" data-asset-upload="${k}"><span class="icon">upload</span>Enviar arquivo</label>
            ${k === "imagem" ? `<button class="asset-upload interactive" type="button" data-paste hidden><span class="icon">content_paste</span>Colar imagem</button>` : ""}
            ${content(k)}
          </div>
        </div>`,
          )
          .join("")}`;
  return `<aside class="side-panel" data-side-panel aria-labelledby="painel-titulo" hidden>
      <div class="side-panel__head">
        <button class="icon-button interactive" type="button" data-panel-back aria-label="Trocar avatar" hidden><span class="icon">arrow_back</span></button>
        <h2 class="side-panel__title" id="painel-titulo" data-panel-title>Escolha o avatar</h2>
        <button class="icon-button interactive" type="button" data-panel-close aria-label="Fechar"><span class="icon">close</span></button>
      </div>
      <div class="side-panel__body" data-panel-view="avatares">
        ${avatarPicker({
          avatars,
          item: (a, content) => `<button class="avatar-option interactive" type="button" data-avatar-pick="${a.id}" data-avatar-cover="${esc(a.cover ?? "")}" data-avatar-name="${esc(a.name)}"${a.voice_asset ? ` data-avatar-voice="avatar:${a.id}"` : ""}${lastText?.has(a.id) ? ` data-avatar-text="${esc(lastText.get(a.id)!)}"` : ""}>${content}</button>`,
        })}
        <a class="button button--text interactive side-panel__new" href="/avatares/novo"><span class="icon">add</span>Novo avatar</a>
      </div>
      <div class="side-panel__body" data-panel-view="ativos" hidden>
        ${byKind((k) => assets.filter((a) => a.kind === k).map(frame).join(""))}
      </div>
      <div class="side-panel__body" data-panel-view="referencias" hidden>
        ${byKind((k) => generated[k] ?? "")}
      </div>
      ${voice ? voicePanel(voice.voices, chosenVoice(voice.voices, voice.value)) : ""}
    </aside>`;
}

/** Quantos vídeos ou imagens prontos cada página do "Adicionar ativo" traz. */
const GENERATED_PAGE = 12;

/** Um quadro dos menus de ativos: tocar escolhe (ou tira) o arquivo. `of`: o avatar dono, que só aparece com ele. */
function pickFrame(o: { id: string; kind: AssetKind; src: string; name: string; hint?: string; of?: string; thumb: string }): string {
  return `<button class="frame interactive" type="button" data-asset="${esc(o.id)}"${o.of ? ` data-asset-of="${o.of}"` : ""} data-asset-type="${o.kind}" data-asset-src="${esc(o.src)}" data-asset-name="${esc(o.name)}"${o.hint ? ` data-asset-hint="${esc(o.hint)}"` : ""} aria-label="${esc(o.name)}" title="${esc(o.name)}" aria-pressed="false"${o.of ? " hidden" : ""}><span class="frame__media">${o.thumb}</span><span class="frame__check" aria-hidden="true"><span class="icon">check</span></span></button>`;
}

const GENDERS: Record<string, string> = { female: "Feminina", male: "Masculina" };
/** O que aparece abaixo do nome da voz, no painel e no menu. */
const voiceHint = (v: VoiceOption) => [v.gender ? GENDERS[v.gender] : "", v.language].filter(Boolean).join(" · ");
/** Quantas vozes cada pedido do menu traz. */
const VOICE_PAGE = 50;
/** A voz do formulário; o vídeo guarda a voz sem a marca de sotaque: "Refazer" acha a mesma voz pelo id. */
const chosenVoice = (voices: VoiceOption[], chosen: string) => voices.find((v) => v.value === chosen || v.value.split("|")[0] === chosen) ?? voices[0]!;

/** O menu de vozes prontas: busca e filtros. As vozes vêm do servidor (`voiceRows`), só as do filtro. */
function voicePanel(voices: VoiceOption[], chosen: VoiceOption): string {
  const counts = new Map<string, number>();
  for (const v of voices) counts.set(v.language, (counts.get(v.language) ?? 0) + 1);
  const number = (n: number) => n.toLocaleString("pt-BR");
  const options = [...counts]
    .map(([l, n]) => `<option value="${esc(l)}"${l === chosen.language ? " selected" : ""}>${esc(l)} (${number(n)})</option>`)
    .join("");
  return `<div class="side-panel__body" data-panel-view="vozes" hidden>
        <div class="search-field"><span class="icon" aria-hidden="true">search</span><input class="search-field__input" type="search" placeholder="Pesquisar vozes" aria-label="Pesquisar vozes" data-voice-search></div>
        <div class="text-field text-field--select">
          <select class="text-field__input" id="voz-idioma" data-voice-language>${options}<option value="">Todos os idiomas (${number(voices.length)})</option></select>
          <label class="text-field__label" for="voz-idioma">Idioma</label>
          <span class="icon text-field__trailing" aria-hidden="true">arrow_drop_down</span>
        </div>
        <div class="chip-set" role="group" aria-label="Gênero da voz">${Object.entries(GENDERS).map(([k, label]) => `<button class="chip interactive" type="button" data-voice-filter="${k}" aria-pressed="false"><span class="icon chip__check">check</span>${label}</button>`).join("")}</div>
        <div class="linear-progress" role="progressbar" aria-label="Carregando as vozes" data-voice-progress hidden></div>
        <p class="library__empty" data-voice-error hidden>${esc(ERROS.vozesIndisponiveis)}</p>
        <ul class="dialog__list" data-voice-list></ul>
      </div>`;
}

/** Uma página do menu de vozes: só as que passam nos filtros, por idioma, e "Mostrar mais" se houver. */
function voiceRows(voices: VoiceOption[], f: { language: string; gender: string; search: string; from: number }): string {
  const q = f.search.toLowerCase();
  const found = voices.filter((v) => (!f.language || v.language === f.language) && (!f.gender || v.gender === f.gender) && (!q || v.name.toLowerCase().includes(q)));
  if (!found.length) return `<li class="library__empty">Nenhuma voz encontrada.</li>`;
  const row = (v: VoiceOption) => {
    const play = v.preview
      ? `<button class="icon-button interactive" type="button" data-voice-play="/vozes/previa/${esc(v.value.split("|")[0]!)}" aria-label="Ouvir ${esc(v.name)}" title="Ouvir"><span class="icon">play_arrow</span></button>`
      : `<button class="icon-button" type="button" disabled aria-label="Sem prévia" title="Sem prévia"><span class="icon">volume_off</span></button>`;
    return `<li class="voice-row">${play}<button class="avatar-option interactive" type="button" data-voice="${esc(v.value)}" data-name="${esc(v.name)}" data-hint="${esc(voiceHint(v))}" aria-pressed="false"><span class="avatar-option__text"><span class="vrow__headline">${esc(v.name)}</span><span class="vrow__support">${esc(voiceHint(v))}</span></span></button></li>`;
  };
  const end = f.from + VOICE_PAGE;
  const rows = found.slice(f.from, end).map((v, i, page) => {
    const before = page[i - 1] ?? found[f.from - 1];
    return `${f.language || before?.language === v.language ? "" : `<li class="vgroup__title">${esc(v.language)}</li>`}${row(v)}`;
  });
  const total = found.length === 1 ? "1 voz" : `${found.length.toLocaleString("pt-BR")} vozes`;
  return `${f.from ? "" : `<li class="side-panel__help">${total}</li>`}${rows.join("")}${end < found.length ? `<li class="voice-more"><button class="button button--text interactive" type="button" data-voice-more="${end}">Mostrar mais</button></li>` : ""}`;
}

/** O mesmo botão principal, escolhendo um arquivo: enviar é escolher (data-auto-submit). */
function fabUpload(icon: string, label: string, action: string, accept: string): string {
  return `<form method="post" action="${action}" enctype="multipart/form-data">
          <label class="fab fab--extended interactive"><span class="icon">${icon}</span>${esc(label)}<input class="visually-hidden" type="file" name="arquivo" accept="${accept}" data-auto-submit aria-label="${esc(label)}"></label>
        </form>`;
}

const LIBRARY_VIEWS = [
  { id: "p", label: "Cards pequenos", icon: "apps" },
  { id: "m", label: "Cards médios", icon: "grid_view" },
  { id: "g", label: "Cards grandes", icon: "crop_square" },
  { id: "d", label: "Detalhes", icon: "view_list" },
];

/**
 * A listagem do site (vídeos e ativos): vistas de cards e Detalhes, filtros, ordem e agrupamento por
 * data, tudo no navegador. Cada lista só diz o que muda: os itens, como vira card e linha, os filtros
 * (`data-kind` do item) e as colunas de Detalhes.
 */
function library<T>(o: {
  key: string;
  /** O título já montado; `count` é "" na lista vazia (sem o contador que o script atualiza). */
  head: (count: string) => string;
  action?: string;
  empty: string;
  items: T[];
  date: (item: T) => string;
  frame: (item: T) => string;
  row: (item: T) => string;
  filters: readonly { kind: string | null; label: string }[];
  columns: string;
  noMatch: string;
}): string {
  if (!o.items.length) return `<div class="library"><div class="library__head">${o.head("")}${o.action ? `<div class="library__end">${o.action}</div>` : ""}</div>${o.empty}</div>`;
  const chips = o.filters
    .map((f, i) => `<button class="chip interactive" type="button" data-filter="${f.kind ?? ""}" aria-pressed="${i === 0}"><span class="icon chip__check">check</span>${esc(f.label)}</button>`)
    .join("");
  const views = LIBRARY_VIEWS.map(
    (z) => `<button class="segmented-button__segment interactive" type="button" data-view="${z.id}"${z.id === "m" ? ' aria-current="true"' : ""} aria-label="${z.label}" title="${z.label}"><span class="icon">${z.icon}</span></button>`,
  ).join("");
  const groups = new Map<string, T[]>();
  for (const item of o.items) {
    const g = dateGroup(o.date(item));
    groups.set(g, [...(groups.get(g) ?? []), item]);
  }
  const section = ([title, list]: [string, T[]]) => `<section class="vgroup" data-group>
        <h3 class="vgroup__title">${esc(title)}</h3>
        <div class="frames" data-items>${list.map(o.frame).join("")}</div>
        <div class="vrows" role="rowgroup" data-items>${list.map(o.row).join("")}</div>
      </section>`;
  return `<div class="library" data-library="${esc(o.key)}" data-view="m" data-grouped="false">
      <div class="library__head">
        ${o.head(String(o.items.length))}
        <div class="library__end"><div class="segmented-button library__sizes" role="group" aria-label="Vista">${views}</div>${o.action ?? ""}</div>
      </div>
      <div class="chip-set library__tools" role="toolbar" aria-label="Filtrar e ordenar">
        ${chips}
        <span class="library__divider" aria-hidden="true"></span>
        <button class="chip interactive" type="button" data-sort aria-label="Ordem: mais recentes primeiro"><span class="icon">swap_vert</span><span data-sort-label>Mais recentes</span></button>
        <button class="chip interactive" type="button" data-group-toggle aria-pressed="false"><span class="icon chip__check">check</span>Agrupar por data</button>
      </div>
      <div class="vrows__head" role="row" aria-hidden="true">${o.columns}</div>
      <p class="library__empty" data-library-empty hidden>${esc(o.noMatch)}</p>
      <div class="library__groups" data-groups>${[...groups].map(section).join("")}</div>
    </div>`;
}

/** A miniatura de um vídeo ou imagem pronto (o vídeo só baixa quando aparece na tela), enquadrando o rosto. */
function outputThumb(v: Video, structure: Structure): string {
  return makesImage(structure)
    ? faceImage(mediaSrc(v), v.face)
    : `<video data-src="${videoSrc(v)}" preload="metadata" muted playsinline tabindex="-1" style="object-position:${thumbPosition(v)}"></video>`;
}

function videoLibrary(videos: Video[], o: LibraryOptions): string {
  const h = o.heading ?? "h2";
  const head = (count: string) => {
    const title = `<${h} class="${o.intro ? "page__headline" : "library__title"}">${esc(o.title)} <span class="pane__count"${count === "" ? "" : " data-library-count"}>${count || 0}</span></${h}>`;
    return o.intro ? `<div>${title}<p class="page__intro">${esc(o.intro)}</p></div>` : title;
  };
  const dragRef = (v: Video, structure: Structure) => (o.mine !== undefined && v.user_id === o.mine && v.status === "completed" && v.video_key ? ` data-ref="${esc(JSON.stringify(generatedPick(v, structure)))}"` : "");
  const thumb = (v: Video, status: ReturnType<typeof cardStatus>) => (v.video_key ? outputThumb(v, o.structureOf(v)) : `<span class="frame__placeholder">${statusTile(status, true)}</span>`);
  return library({
    key: o.key,
    head,
    action: o.action,
    empty: o.empty,
    items: videos,
    date: (v) => v.created_at,
    filters: FILTERS,
    noMatch: o.image ? "Nenhuma imagem com esse filtro." : "Nenhum vídeo com esse filtro.",
    columns: `<span></span><span>${o.image ? "Descrição" : "Texto"}</span><span>Status</span><span>${o.image ? "Resolução" : "Duração"}</span><span class="vrow__wide">Formato</span><span class="vrow__wide">Custo</span><span>Criado em</span>`,
    frame: (v) => {
      const status = cardStatus(v);
      const structure = o.structureOf(v);
      const label = esc([v.prompt, status.kind === "done" ? null : status.label, formatDate(v.created_at), structure.name, durationLabel(v, structure)].filter(Boolean).join(" · "));
      return `<a class="frame interactive" href="/video/${v.id}?de=${encodeURIComponent(o.from)}" data-video="${v.id}" data-kind="${status.kind}"${dragRef(v, structure)} aria-label="${label}" title="${label}"><span class="frame__media">${thumb(v, status)}</span></a>`;
    },
    row: (v) => {
      const status = cardStatus(v), structure = o.structureOf(v);
      return `<a class="vrow interactive" href="/video/${v.id}?de=${encodeURIComponent(o.from)}" role="row" data-video="${v.id}" data-kind="${status.kind}"${dragRef(v, structure)}>
          <span class="vrow__thumb" role="cell">${thumb(v, status)}</span>
          <span class="vrow__text" role="cell"><span class="vrow__headline">${esc(v.prompt)}</span><span class="vrow__support">${esc(status.kind === "done" ? [formatDate(v.created_at), structure.name, durationLabel(v, structure)].join(" · ") : status.label)}</span></span>
          <span class="vrow__status vrow__status--${status.kind}" role="cell"><span class="icon">${status.kind === "done" ? "check_circle" : status.icon}</span>${esc(status.label.replace(/ · .*/, ""))}</span>
          <span role="cell">${esc(o.image ? v.resolution : durationLabel(v, structure))}</span>
          <span class="vrow__wide" role="cell">${esc(`${v.aspect_ratio} · ${v.resolution}`)}</span>
          <span class="vrow__wide" role="cell">${v.cost !== null ? `US$ ${v.cost.toFixed(2)}` : "—"}</span>
          <span role="cell">${esc(formatDate(v.created_at))}</span>
        </a>`;
    },
  });
}

/** Um vídeo pronto a caminho de um avatar. */
interface SavableVideo {
  video: Video;
  structure: Structure;
  key: string;
  size: number;
}

function videoAssetName(s: SavableVideo): string {
  return `${s.structure.name} ${s.video.id.slice(0, 8)}.${makesImage(s.structure) ? (s.key.split(".").pop() ?? "png") : "mp4"}`;
}

/** O tipo do ativo que um vídeo (ou imagem) gerado vira no avatar. */
function savedKind(s: SavableVideo): { kind: AssetKind; type: string } {
  if (!makesImage(s.structure)) return { kind: "video", type: "video/mp4" };
  const ext = s.key.split(".").pop();
  return { kind: "imagem", type: ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png" };
}

const MAX_AVATAR_DESCRIPTION = 500;
const ASSET_LABELS: Record<AssetKind, string> = { imagem: "Imagem", video: "Vídeo", audio: "Áudio" };
const assetOrigin = (a: AvatarAsset) => `${ASSET_LABELS[a.kind]} ${a.source_video ? "gerad" : "enviad"}${a.kind === "imagem" ? "a" : "o"}`;
/** O ativo que um campo do formulário recebe (a gravação da voz clonada fica na fala); null se não for ativo. */
function fieldAsset(f: Field): AssetKind | null {
  return f.kind === "image" ? "imagem" : f.kind === "video" ? "video" : f.kind === "audio" && f.name === "audio" ? "audio" : null;
}
const acceptedKinds = (fields: Field[]) => [...new Set(fields.flatMap((f) => fieldAsset(f) ?? []))].sort((a, b) => ASSET_ORDER.indexOf(a) - ASSET_ORDER.indexOf(b));
const ASSET_ORDER: AssetKind[] = ["imagem", "video", "audio"];
/**
 * O avatar e os ativos escolhidos no painel do modelo. Um ativo é o id de um ativo do avatar ou
 * uma escolha de vídeo (`gerado:` ou `origem:`, ver pickFile); `items` diz como mostrar estas.
 */
interface AssetPicks {
  avatar: string;
  assets: string[];
  items?: PickItem[];
}
/** Uma escolha do painel como a linha dele mostra. */
interface PickItem {
  id: string;
  kind: AssetKind;
  name: string;
  src: string;
  hint: string;
}
/** Uma escolha de vídeo e onde está o arquivo dela no R2. */
interface PickedFile extends PickItem {
  key: string;
}
/** Um vídeo ou imagem pronto como referência para outro modelo (painel, lista e "Usar para gerar"). */
function generatedPick(v: Video, structure: Structure): PickItem {
  const kind: AssetKind = makesImage(structure) ? "imagem" : "video";
  return { id: `gerado:${v.id}`, kind, name: v.prompt.slice(0, 80) || structure.name, src: mediaSrc(v), hint: kind === "imagem" ? "Imagem gerada" : "Vídeo gerado" };
}
const ASSET_ICONS: Record<AssetKind, string> = { imagem: "image", video: "movie", audio: "mic" };
const ASSET_ACCEPT = Object.keys(MEDIA_KINDS).join(",");

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Os ativos do avatar, na listagem do site. */
/** A miniatura de um ativo: a foto, o vídeo (baixa quando aparece na tela) ou o ícone do áudio. */
function assetThumb(a: AvatarAsset, src: string): string {
  return a.kind === "imagem"
    ? faceImage(src, a.face)
    : a.kind === "video"
      ? `<video data-src="${src}" data-face="${facePoint(a.face).join(",")}" preload="metadata" muted playsinline tabindex="-1"></video>`
      : `<span class="frame__placeholder"><span class="icon-tile icon-tile--large icon-tile--tertiary" aria-hidden="true"><span class="icon">mic</span></span></span>`;
}

function assetLibrary(assets: AvatarAsset[], o: { key: string; avatar?: Avatar; src?: (a: AvatarAsset) => string; href?: (a: AvatarAsset) => string }): string {
  const { avatar } = o;
  const src = o.src ?? ((a: AvatarAsset) => `/avatares/${avatar!.id}/arquivos/${a.id}`);
  const href = o.href ?? ((a: AvatarAsset) => `${src(a)}/ver`);
  const thumb = (a: AvatarAsset) => assetThumb(a, src(a));
  return library({
    key: o.key,
    head: (count) => `<h2 class="library__title">Ativos <span class="pane__count"${count ? " data-library-count" : ""}>${count || 0}</span></h2>`,
    // No avatar ainda não salvo não há onde guardar arquivos.
    action: avatar ? fabUpload("upload", "Adicionar arquivo", `/avatares/${avatar.id}/arquivos`, ASSET_ACCEPT) : undefined,
    empty: emptyState("face", "Nenhum ativo ainda", "Envie arquivos ou salve o que um modelo criar."),
    items: assets,
    date: (a) => a.created_at,
    filters: [
      { kind: null, label: "Todos" },
      { kind: "imagem", label: "Fotos" },
      { kind: "video", label: "Vídeos" },
      { kind: "audio", label: "Áudios" },
    ],
    noMatch: "Nenhum ativo com esse filtro.",
    columns: `<span></span><span>Nome</span><span>Tipo</span><span>Tamanho</span><span class="vrow__wide">Origem</span><span class="vrow__wide">Uso</span><span>Criado em</span>`,
    frame: (a) => `<a class="frame interactive" href="${href(a)}" data-kind="${a.kind}" aria-label="${esc(a.name)}" title="${esc(a.name)}"><span class="frame__media">${thumb(a)}</span></a>`,
    row: (a) => `<a class="vrow interactive" href="${href(a)}" role="row" data-kind="${a.kind}">
          <span class="vrow__thumb" role="cell">${thumb(a)}</span>
          <span class="vrow__text" role="cell"><span class="vrow__headline">${esc(a.name)}</span><span class="vrow__support">${esc(formatDate(a.created_at))}</span></span>
          <span class="vrow__status vrow__status--done" role="cell"><span class="icon">${ASSET_ICONS[a.kind]}</span>${ASSET_LABELS[a.kind]}</span>
          <span role="cell">${formatBytes(a.size)}</span>
          <span class="vrow__wide" role="cell">${assetOrigin(a)}</span>
          <span class="vrow__wide" role="cell">${a.id === avatar?.photo_asset ? "Principal" : a.id === avatar?.voice_asset ? "Voz" : "—"}</span>
          <span role="cell">${esc(formatDate(a.created_at))}</span>
        </a>`,
  });
}

/** Fim do painel de configuração: duração e custo estimados e o botão de gerar, na largura toda. */
function generateBar(seconds: string, cost: number | undefined, enabled: boolean, image = false): string {
  const costLabel = cost !== undefined ? `US$ ${cost.toFixed(2)}` : "—";
  // Imagem não tem duração: só o custo.
  return `
      <div class="pane__footer">
        <div class="estimate-list">
          ${image ? "" : `<div class="estimate-list__item"><span class="icon">schedule</span><span class="estimate-list__label">Duração</span><span class="estimate-list__value" data-seconds>${esc(seconds)}</span></div>`}
          <div class="estimate-list__item"><span class="icon">payments</span><span class="estimate-list__label">Custo estimado</span><span class="estimate-list__value" data-cost>${costLabel}</span></div>
        </div>
        <button class="button button--filled interactive" type="submit"${enabled ? "" : " disabled"}><span class="icon">send</span>${image ? "Gerar imagem" : "Gerar vídeo"}</button>
      </div>`;
}

/** Os períodos do painel; `days` vazio é desde o começo. */
const PANEL_PERIODS = [
  { id: "7", label: "Últimos 7 dias", days: 7 },
  { id: "30", label: "Últimos 30 dias", days: 30 },
  { id: "tudo", label: "Tudo", days: 0 },
] as const;

function money(n: number): string {
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type PanelTab = "geral" | "custos" | "atividade" | "contas";

/** O que a aba Contas mostra depois de uma ação: o erro do formulário de convite ou o link gerado (uma vez só). */
interface AccountsView {
  error?: string;
  values?: { name: string; email: string };
  link?: { name: string; url: string };
}
const PANEL_TABS: { id: PanelTab; href: string; label: string; icon: string }[] = [
  { id: "geral", href: "/painel", label: "Visão geral", icon: "space_dashboard" },
  { id: "custos", href: "/painel/custos", label: "Custos", icon: "payments" },
  { id: "atividade", href: "/painel/atividade", label: "Atividade", icon: "monitor_heart" },
  { id: "contas", href: "/painel/contas", label: "Contas", icon: "group" },
];
/** Na Visão geral, os modelos que mais gastaram; o resto vira "Outros" (a lista inteira fica em Custos). */
const PANEL_TOP_MODELS = 5;

const count = (x: number) => x.toLocaleString("pt-BR");
const plural = (x: number, one: string, many: string) => (x === 1 ? `1 ${one}` : `${count(x)} ${many}`);

/** Um número do painel: rótulo, valor e uma linha de apoio. O herói (um por tela) é maior. */
function statCard(icon: string, label: string, value: string, supporting: string, hero = false): string {
  return `<section class="stat-card${hero ? " stat-card--hero" : ""}">
      <p class="stat-card__label"><span class="icon" aria-hidden="true">${icon}</span>${esc(label)}</p>
      <p class="stat-card__value">${esc(value)}</p>
      <p class="stat-card__supporting">${esc(supporting)}</p>
    </section>`;
}

/**
 * Gasto por modelo em barras horizontais ordenadas (do maior para o menor, uma cor só, a maior
 * ocupa a largura toda), com o nome, os vídeos, a parte do total e o valor em texto. Com `top`, o
 * que passa vira uma linha "Outros", em cinza.
 */
function modelBars(models: PanelStats["models"], top?: number, wide = false): string {
  const total = models.reduce((sum, m) => sum + m.cost, 0);
  const rows = models.map((m) => {
    const found = structureById(m.structure);
    return { icon: found?.icon ?? "movie", name: found?.name ?? (m.structure || "Sem modelo"), videos: m.videos, cost: m.cost, other: false };
  });
  if (top !== undefined && rows.length > top + 1) {
    const rest = rows.splice(top);
    rows.push({ icon: "more_horiz", name: `Outros ${rest.length} modelos`, videos: rest.reduce((s, r) => s + r.videos, 0), cost: rest.reduce((s, r) => s + r.cost, 0), other: true });
  }
  const max = Math.max(...rows.map((r) => r.cost), 0);
  return `<ul class="rank${wide ? " rank--wide" : ""}">${rows
    .map((r) => {
      const share = total > 0 ? Math.round((r.cost / total) * 100) : 0;
      return `<li class="rank__item${r.other ? " rank__item--other" : ""}">
        <div class="rank__head">
          <span class="rank__label"><span class="icon" aria-hidden="true">${r.icon}</span><span class="rank__name">${esc(r.name)}</span></span>
          <span class="rank__meta">${plural(r.videos, "vídeo", "vídeos")} · ${share}%</span>
          <span class="rank__value">${money(r.cost)}</span>
        </div>
        <span class="rank__bar" style="--size:${max > 0 ? (r.cost / max).toFixed(3) : 0}" aria-hidden="true"></span>
      </li>`;
    })
    .join("")}</ul>`;
}

function panelFailures(s: PanelStats): string {
  return detailsCard("Falhas", [
    { icon: "movie", term: "Vídeos", value: count(s.videos.failed) },
    { icon: "graphic_eq", term: "Áudio", value: count(s.videos.audioFailed) },
    { icon: "content_cut", term: "Edição rápida", value: count(s.videos.editFailed) },
    { icon: "download", term: "Exportações", value: count(s.projects.exportsFailed) },
  ]);
}

/**
 * A Visão geral, sempre do mesmo tamanho (nada nela cresce com os dados): o gasto como número
 * herói e três números ao lado; embaixo, um mosaico (M3): o gasto por modelo, até 6 linhas, ocupa
 * duas linhas da grade, ao lado das Falhas e do Conteúdo, 4 linhas cada. As bases se alinham pela
 * grade, e o "Ver todos" fica no pé do card.
 */
function panelOverview(s: PanelStats, query: string): string {
  const v = s.videos;
  const total = s.models.reduce((sum, m) => sum + m.cost, 0);
  const minutes = (v.seconds / 60).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return `<div class="dash">
    <div class="dash__kpis">
      ${statCard("payments", "Gasto em vídeos", money(total), `em ${plural(v.total, "vídeo pedido", "vídeos pedidos")}`, true)}
      ${statCard("check_circle", "Vídeos prontos", count(v.done), `${count(v.busy)} em andamento`)}
      ${statCard("schedule", "Minutos de vídeo", minutes, "dos vídeos prontos")}
      ${statCard("download", "Exportações", count(s.projects.exports), `de ${plural(s.projects.created, "projeto novo", "projetos novos")}`)}
    </div>
    <div class="dash__mosaic">
        <section class="viewer__card dash__tall" aria-labelledby="card-gasto">
          <h2 class="qe-result__title" id="card-gasto">Gasto por modelo</h2>
          ${s.models.length ? modelBars(s.models, PANEL_TOP_MODELS, true) : `<p class="qe-result__note">Nenhum vídeo no período.</p>`}
          ${s.models.length > PANEL_TOP_MODELS + 1 ? `<div class="viewer__card-actions"><a class="button button--text interactive" href="/painel/custos${query}">Ver todos os modelos</a></div>` : ""}
        </section>
        ${panelFailures(s)}
        ${detailsCard("Conteúdo", [
          { icon: "folder_open", term: "Projetos novos", value: count(s.projects.created) },
          { icon: "person", term: "Pessoas novas", value: count(s.accounts.users) },
          { icon: "face", term: "Avatares", value: count(s.accounts.avatars) },
          { icon: "photo_library", term: "Ativos", value: count(s.accounts.assets) },
        ])}
    </div>
  </div>`;
}

/**
 * Custos: os números do período no topo (como na Visão geral) e dois painéis (docs/layout.md): no
 * principal, o gasto por modelo e a Cloudflare, listas com barras; no de apoio, os provedores.
 */
function panelCosts(s: PanelStats, external: CustosExternos | null, local: boolean): string {
  const total = s.models.reduce((sum, m) => sum + m.cost, 0);
  const done = s.videos.done;
  const minutes = s.videos.seconds / 60;
  return `<div class="dash">
    <div class="dash__kpis">
      ${statCard("payments", "Gasto em vídeos", money(total), `em ${plural(s.models.length, "modelo", "modelos")}`, true)}
      ${statCard("movie", "Por vídeo", done ? money(total / done) : "—", `${plural(done, "vídeo pronto", "vídeos prontos")}`)}
      ${statCard("schedule", "Por minuto", minutes ? money(total / minutes) : "—", `${minutes.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} min prontos`)}
      ${statCard("error", "Com falha", count(s.videos.failed), "vídeos fora do gasto")}
    </div>
    ${panes(
      {
        title: "Gastos",
        body: `<section class="viewer__card" aria-labelledby="card-modelos">
        <h3 class="qe-result__title" id="card-modelos">Por modelo</h3>
        ${s.models.length ? modelBars(s.models, undefined, true) : `<p class="qe-result__note">Nenhum vídeo no período.</p>`}
      </section>
      ${external ? cloudflareSection(external, local) : ""}`,
      },
      { title: "Provedores de vídeo", body: external ? providersSection(external, s.platforms) : "" },
    )}
  </div>`;
}

const FAILURE_KINDS: Record<PanelFailure["kind"], { icon: string; label: string }> = {
  video: { icon: "movie", label: "Vídeo" },
  audio: { icon: "graphic_eq", label: "Áudio" },
  edit: { icon: "content_cut", label: "Edição rápida" },
  export: { icon: "download", label: "Exportação" },
};

/**
 * Um item das listas do painel (o item de lista do site, o da escolha de avatar): ícone, título,
 * as colunas de `meta` e o texto no fim, numa linha só com as colunas alinhadas; no celular, o
 * título e o fim em cima e as colunas embaixo. Link quando houver.
 */
function listItem(o: { icon: string; title: string; meta: string[]; end: string; href?: string; alert?: boolean; actions?: string }): string {
  const content = `<span class="icon" aria-hidden="true">${o.icon}</span><span class="dash__title" title="${esc(o.title)}">${esc(o.title)}</span><span class="dash__meta">${o.meta
    .map((m) => `<span class="dash__cell" title="${esc(m)}">${esc(m)}</span>`)
    .join("")}</span><span class="avatar-option__end">${esc(o.end)}</span>`;
  // O menu de ações (o mesmo dos cards) é a última coluna da linha.
  return `<li${o.alert ? ' class="dash__alert"' : ""}>${o.href ? `<a class="avatar-option interactive" href="${o.href}">${content}</a>` : `<div class="avatar-option avatar-option--static">${content}${o.actions !== undefined ? `<span class="dash__menu">${o.actions}</span>` : ""}</div>`}</li>`;
}

/**
 * Atividade: os números de saúde no topo (as falhas como herói), a lista das últimas falhas com o
 * motivo técnico (só o administrador vê; ele não vai para a tela de mais ninguém) e os tokens de
 * API e MCP com o último uso. Cards na largura toda, um embaixo do outro: nada a alinhar.
 */
function panelActivity(
  s: PanelStats,
  o: { failures: { items: PanelFailure[]; total: number }; page: number; tokens: PanelToken[]; alarm: Alarme | null; machines: Awaited<ReturnType<MaquinasApi["estados"]>>; since: string | null; local: boolean; from: string; userId: number },
): string {
  const v = s.videos;
  const failed = v.failed + v.audioFailed + v.editFailed + s.projects.exportsFailed;
  const used = o.tokens.filter((t) => t.last_used_at && (!o.since || t.last_used_at >= o.since)).length;
  const now = Date.now();
  const on = o.machines.filter((m) => "ligada" in m && m.ligada).length;
  const machines = o.machines.map((m) => {
    const last = "ultimoPedido" in m && m.ultimoPedido ? `último pedido ${formatDate(new Date(m.ultimoPedido).toISOString())}` : "sem pedido recente";
    if ("falhou" in m) return listItem({ icon: m.icone, title: m.nome, meta: ["Sem resposta agora"], end: "" });
    const idle = m.ligada && m.emAndamento === 0;
    const idleMin = idle && m.ultimoPedido ? Math.floor((now - m.ultimoPedido) / 60_000) : null;
    const state = !m.ligada ? "Desligada" : m.emAndamento > 0 ? "Ligada, trabalhando" : `Ligada sem trabalho${idleMin !== null ? ` há ${idleMin} min` : ""}`;
    // Ligada sem trabalho por metade do prazo do alarme: é o caso que gasta à toa.
    return listItem({ icon: m.icone, title: m.nome, meta: [state], end: last, alert: idle && (idleMin ?? 0) * 60_000 >= LIMITE_MS / 2 });
  });
  // O alarme só aparece quando fez algo ou não consegue vigiar; no dia a dia, nada a dizer.
  const stopped = o.alarm?.ligados ?? [];
  const alarmNote = o.local
    ? null
    : stopped.length
      ? `Alarme: desligou ${stopped.map((l) => `${MAQUINAS.find((m) => m.classe === l.classe)?.nome ?? l.classe} em ${formatDate(l.em)}`).join(", ")}, por estar ligada sem uso.`
      : o.alarm?.semPainel
        ? ERROS.alarmeSemPainel
        : null;
  const failures = o.failures.items.map((f) => {
    const kind = FAILURE_KINDS[f.kind];
    // A página do vídeo abre para o administrador; o projeto, só para o dono.
    const href = f.kind === "export" ? (f.user_id === o.userId ? `/canvas/${f.ref}` : undefined) : `/video/${f.ref}?de=${encodeURIComponent(o.from)}`;
    return listItem({ icon: kind.icon, title: f.title.trim() || "Sem fala", meta: [kind.label, f.owner ?? "Sem dono", f.reason ?? "Sem motivo registrado"], end: formatDate(f.at), href });
  });
  const tokens = o.tokens.map((t) =>
    listItem({ icon: "key", title: t.name, meta: [t.owner, `criado em ${formatDate(t.created_at)}`], end: t.last_used_at ? `usado em ${formatDate(t.last_used_at)}` : "nunca usado" }),
  );
  return `<div class="dash">
    <div class="dash__kpis">
      ${statCard("error", "Falhas no período", count(failed), "em vídeos, áudio, edição e exportações", true)}
      ${statCard("hourglass_top", "Em andamento", count(v.busy), "na fila ou gerando")}
      ${statCard("key", "Agentes ativos", count(used), `de ${plural(o.tokens.length, "token", "tokens")}`)}
      ${statCard("memory", "Máquinas ligadas", count(on), `de ${o.machines.length} agora`)}
    </div>
    ${panes(
      {
        title: "Últimas falhas",
        body: `<section class="viewer__card" aria-label="Últimas falhas">
        ${failures.length ? `<ul class="dash__list dash__list--failures">${failures.join("")}</ul>${pager(o.failures.total, o.page, o.from)}` : `<p class="qe-result__note">Nenhuma falha no período.</p>`}
      </section>`,
      },
      {
        title: "Sistema",
        body: `<section class="viewer__card" aria-labelledby="card-maquinas">
        <h3 class="qe-result__title" id="card-maquinas">Máquinas agora</h3>
        <ul class="dash__list dash__list--machines">${machines.join("")}</ul>
        ${alarmNote ? `<p class="qe-result__note">${esc(alarmNote)}</p>` : ""}
      </section>
      <section class="viewer__card" aria-labelledby="card-tokens">
        <h3 class="qe-result__title" id="card-tokens">API e MCP</h3>
        ${tokens.length ? `<ul class="dash__list dash__list--tokens">${tokens.join("")}</ul>` : `<p class="qe-result__note">Nenhum token criado.</p>`}
        <p class="qe-result__note">O último uso é gravado no máximo uma vez por hora.</p>
      </section>`,
      },
    )}
  </div>`;
}

/**
 * Contas: os números no topo (contas como herói), o convite à esquerda (o formulário e, logo depois
 * de gerar, o link, mostrado uma vez só: o banco guarda só o hash) e a lista das contas à direita,
 * com as ações das comuns embaixo de cada uma.
 */
function panelAccounts(list: AccountRow[], me: User, v: AccountsView): string {
  const now = new Date().toISOString();
  const state = (a: AccountRow): { label: string; alert?: boolean } =>
    a.permissoes.includes("suspensa") ? { label: "Suspensa", alert: true } : a.hasPassword ? { label: "Ativa" } : a.inviteUntil && a.inviteUntil > now ? { label: `Convite até ${formatDate(a.inviteUntil)}` } : { label: "Convite vencido", alert: true };
  const suspended = list.filter((a) => a.permissoes.includes("suspensa")).length;
  const pending = list.filter((a) => !a.hasPassword && !a.permissoes.includes("suspensa")).length;
  const action = (a: AccountRow, path: string, icon: string, label: string): MenuItem => ({ label, icon, href: `/painel/contas/${a.id}/${path}`, post: true });
  const rows = list.map((a) => {
    const st = state(a);
    const extras = [...(a.permissoes.includes("usar:modelo:teste") ? ["Testador"] : []), ...(a.permissoes.includes("usar:canvas") ? ["Canvas"] : [])];
    const actions =
      a.role === "member"
        ? overflowMenu(`Ações: ${a.name}`, [
            action(a, "link", "link", a.hasPassword ? "Link de nova senha" : "Novo convite"),
            a.permissoes.includes("suspensa") ? action(a, "reativar", "check_circle", "Reativar") : action(a, "suspender", "lock", "Suspender"),
            action(a, "testador", "star", a.permissoes.includes("usar:modelo:teste") ? "Tirar de testador" : "Tornar testador"),
            action(a, "canvas", "layers", a.permissoes.includes("usar:canvas") ? "Tirar o Canvas" : "Liberar o Canvas"),
          ])
        : "";
    return listItem({
      icon: a.role === "admin" ? "switch_account" : "person",
      title: a.id === me.id ? `${a.name} (você)` : a.name,
      meta: [st.label, a.role === "admin" ? "Administrador" : ["Membro", ...extras].join(", "), a.email],
      end: plural(a.videos, "vídeo", "vídeos"),
      alert: st.alert,
      actions,
    });
  });
  const linkBox = v.link
    ? `<section class="viewer__card" aria-labelledby="card-link">
        <h3 class="qe-result__title" id="card-link">Link de ${esc(v.link.name)}</h3>
        <div class="text-field"><input class="text-field__input" id="link-convite" readonly value="${esc(v.link.url)}" placeholder=" "><label class="text-field__label" for="link-convite">Link</label></div>
        <button class="button button--filled interactive" type="button" data-copy="${esc(v.link.url)}"><span class="icon">content_copy</span><span>Copiar</span></button>
        <p class="qe-result__note">Vale por ${INVITE_HOURS} horas e funciona uma vez. Mande por WhatsApp ou e-mail.</p>
      </section>`
    : "";
  const inviteForm = `<section class="viewer__card" aria-labelledby="card-convidar">
        <h3 class="qe-result__title" id="card-convidar">Nova conta</h3>
        <form class="dash__form" method="post" action="/painel/contas">
          ${v.error ? `<p class="dialog__error" role="alert">${esc(v.error)}</p>` : ""}
          ${textField("nome", "Nome", `type="text" autocomplete="off" required maxlength="80" value="${esc(v.values?.name ?? "")}"`)}
          ${textField("email", "E-mail", `type="email" autocomplete="off" required value="${esc(v.values?.email ?? "")}"`, "A pessoa recebe um link para criar a senha.")}
          <button class="button button--filled interactive" type="submit"><span class="icon">person_add</span>Gerar convite</button>
        </form>
      </section>`;
  return `<div class="dash">
    <div class="dash__kpis">
      ${statCard("group", "Contas", count(list.length), "com a sua", true)}
      ${statCard("check_circle", "Ativas", count(list.length - pending - suspended), "já criaram a senha")}
      ${statCard("schedule", "Convites", count(pending), "esperando a senha")}
      ${statCard("lock", "Suspensas", count(suspended), "sem acesso ao site")}
    </div>
    ${panes(
      { title: "Convidar", body: `${linkBox}${inviteForm}` },
      { title: "Contas", body: `<section class="viewer__card" aria-label="Contas"><ul class="dash__list dash__list--accounts">${rows.join("")}</ul></section>` },
    )}
  </div>`;
}

/**
 * O card de um provedor, igual para todos: o saldo (quanto ainda dá para gastar) e o gasto no
 * período (pelo banco do site) em destaque, e embaixo as linhas do que a API informa (o que ela
 * não informa fica "—"). Mesmas linhas em todos, então a mesma altura.
 */
function providerCard(title: string, o: { balance: string; spent: string; spentNote: string; rows: { icon: string; term: string; value: string }[] }): string {
  const id = `card-${title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}`;
  return `<section class="viewer__card viewer__details" aria-labelledby="${id}">
      <h2 class="qe-result__title" id="${id}">${esc(title)}</h2>
      <div class="figures">
        <div class="figures__item"><p class="figures__label">Saldo</p><p class="figures__value">${esc(o.balance)}</p><p class="figures__note">para gastar</p></div>
        <div class="figures__item"><p class="figures__label">Gasto no período</p><p class="figures__value">${esc(o.spent)}</p><p class="figures__note">em ${esc(o.spentNote)}</p></div>
      </div>
      <dl class="dash__totals">${o.rows.map((d) => `<div class="qe-result__row"><span class="icon" aria-hidden="true">${d.icon}</span><dt class="qe-result__label">${esc(d.term)}</dt><dd class="qe-result__value">${esc(d.value)}</dd></div>`).join("")}</dl>
    </section>`;
}

const PROVIDER_STATUS = {
  ok: { icon: "check_circle", label: "Em dia" },
  sem_chave: { icon: "link_off", label: "Sem chave no site" },
  falhou: { icon: "error", label: "Sem resposta agora" },
} as const;

const LIMIT_PERIODS: Record<string, string> = { daily: "por dia", weekly: "por semana", monthly: "por mês" };

/** "US$ 50,00 de 50,00 por semana": o que resta do limite da chave, de quanto e quando volta. */
function limitValue(l: Limite | null): string {
  if (!l) return "—";
  // Sem repetir a moeda: a linha cabe no painel de apoio (docs/layout.md, item 9).
  const of = l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${money(l.restante)} de ${of}${l.periodo && LIMIT_PERIODS[l.periodo] ? ` ${LIMIT_PERIODS[l.periodo]}` : ""}`;
}

function providerValue(v: Valor | null): string {
  if (!v) return "—";
  return v.moeda === "usd" ? money(v.valor) : `${v.valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} créditos`;
}

/**
 * A infraestrutura em Custos: um card por provedor de vídeo, todos com as mesmas linhas (o que a
 * API não informa fica "—"), lado a lado como um feed; e a Cloudflare num card só, um serviço por
 * linha, como o gasto por modelo.
 */
/** Os provedores de vídeo, um card igual para cada, empilhados no painel de apoio. */
function providersSection(e: CustosExternos, platforms: PanelStats["platforms"]): string {
  const providers = e.provedores.map((p) => {
    const spent = platforms.find((x) => x.platform === p.id);
    return providerCard(p.nome, {
      balance: providerValue(p.saldo),
      spent: money(spent?.cost ?? 0),
      spentNote: plural(spent?.videos ?? 0, "vídeo", "vídeos"),
      rows: [
        { icon: "payments", term: "Gasto total na conta", value: providerValue(p.total) },
        { icon: "speed", term: "Limite da chave", value: limitValue(p.limite) },
        { icon: PROVIDER_STATUS[p.estado].icon, term: "Situação", value: PROVIDER_STATUS[p.estado].label },
      ],
    });
  });
  return providers.join("");
}

/** A Cloudflare num card só: um serviço por linha, como o gasto por modelo, e os totais. */
function cloudflareSection(e: CustosExternos, local: boolean): string {
  const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const c = e.cloudflare;
  let cloudflare: string;
  if (c === null || c === "falhou") {
    const note = c === null && local ? "Sem dados no computador." : c === null ? ERROS.custosSemAcesso : ERROS.custosIndisponiveis;
    cloudflare = `<p class="qe-result__note">${esc(note)}</p>`;
  } else {
    const max = Math.max(...c.servicos.map((x) => x.custo), 0);
    const total = c.servicos.reduce((t, x) => t + x.custo, 0);
    cloudflare = `<ul class="rank rank--wide">${c.servicos
      .map(
        (x) => `<li class="rank__item">
        <div class="rank__head">
          <span class="rank__label"><span class="icon" aria-hidden="true">${SERVICE_ICONS[x.nome] ?? "layers"}</span><span class="rank__name">${esc(x.nome)}</span></span>
          <span class="rank__meta">${esc(x.detalhe)}</span>
          <span class="rank__value">${money(x.custo)}</span>
        </div>
        <span class="rank__bar" style="--size:${max > 0 ? (x.custo / max).toFixed(3) : 0}" aria-hidden="true"></span>
      </li>`,
      )
      .join("")}</ul>
      <dl class="viewer__details dash__totals">
        <div class="qe-result__row"><span class="icon" aria-hidden="true">payments</span><dt class="qe-result__label">Total</dt><dd class="qe-result__value">${money(total)}</dd></div>
        <div class="qe-result__row"><span class="icon" aria-hidden="true">memory</span><dt class="qe-result__label">Memória</dt><dd class="qe-result__value">${n1(c.memoriaGiBHoras)} de ${FRANQUIA.memoriaGiBHoras} GiB·h por mês no plano</dd></div>
        <div class="qe-result__row"><span class="icon" aria-hidden="true">speed</span><dt class="qe-result__label">CPU</dt><dd class="qe-result__value">${n1(c.cpuMinutos)} de ${FRANQUIA.cpuMinutos} min por mês no plano</dd></div>
        <div class="qe-result__row"><span class="icon" aria-hidden="true">cloud</span><dt class="qe-result__label">Espaço</dt><dd class="qe-result__value">${formatBytes(c.r2Bytes)} de ${FRANQUIA.r2GB} GB no plano</dd></div>
      </dl>
      <p class="qe-result__note">Últimos ${c.dias} dias, antes do que o plano inclui.</p>`;
  }
  return `<section class="viewer__card" aria-labelledby="card-cloudflare"><h3 class="qe-result__title" id="card-cloudflare">Cloudflare</h3>${cloudflare}</section>`;
}

/** Itens por página nas listas do painel que crescem sem limite (as falhas). */
const PANEL_PAGE = 15;

/**
 * A paginação de uma lista, no pé do card (a das tabelas de dados do Material): "16–30 de 65" e as
 * setas de anterior e próxima, links com ?pagina= sobre o endereço da aba (que já leva o período).
 */
function pager(total: number, page: number, from: string): string {
  if (total <= PANEL_PAGE) return "";
  const last = Math.ceil(total / PANEL_PAGE);
  const current = Math.min(page, last);
  const first = (current - 1) * PANEL_PAGE + 1;
  const href = (n: number) => `${from}${from.includes("?") ? "&" : "?"}pagina=${n}`;
  const arrow = (n: number, icon: string, label: string) =>
    n >= 1 && n <= last
      ? `<a class="icon-button interactive" href="${href(n)}" aria-label="${label}" title="${label}"><span class="icon">${icon}</span></a>`
      : `<span class="icon-button" aria-disabled="true" aria-label="${label}"><span class="icon">${icon}</span></span>`;
  return `<nav class="pager" aria-label="Páginas">
      <span class="pager__range">${count(first)}–${count(Math.min(current * PANEL_PAGE, total))} de ${count(total)}</span>
      ${arrow(current - 1, "chevron_left", "Página anterior")}${arrow(current + 1, "chevron_right", "Próxima página")}
    </nav>`;
}

/**
 * Dois painéis do M3 (docs/layout.md) a partir de 840 px: o principal flexível e o de apoio com
 * largura fixa (360 px no expandido, 412 px do grande em diante); abaixo disso, um embaixo do outro.
 * Cada painel tem o seu título, parado, e o corpo, que rola por inteiro no layout fixo. Os cards
 * dentro dele nunca rolam: têm o tamanho do conteúdo.
 */
function panes(...list: { title: string; body: string }[]): string {
  return `<div class="dash__panes">${list
    .map((p) => {
      const id = `painel-${p.title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}`;
      return `<section class="dash__pane" aria-labelledby="${id}"><h2 class="dash__pane-title" id="${id}">${esc(p.title)}</h2><div class="dash__pane-body">${p.body}</div></section>`;
    })
    .join("")}</div>`;
}

const SERVICE_ICONS: Record<string, string> = { "Áudio": "graphic_eq", "Exportação": "download", "Animações": "animation", "Armazenamento": "cloud" };

/** O card de linhas (ícone, rótulo, valor): os Detalhes do vídeo e do ativo e os cards do painel. */
function detailsCard(title: string, rows: { icon: string; term: string; value: string }[], cls = ""): string {
  const id = `card-${title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}`;
  return `<section class="viewer__card viewer__details${cls ? ` ${cls}` : ""}" aria-labelledby="${id}">
            <h2 class="qe-result__title" id="${id}">${esc(title)}</h2>
            <dl>${rows.map((d) => `<div class="qe-result__row"><span class="icon" aria-hidden="true">${d.icon}</span><dt class="qe-result__label">${esc(d.term)}</dt><dd class="qe-result__value">${esc(d.value)}</dd></div>`).join("")}</dl>
          </section>`;
}

/** `icon` é o ícone do topo; começando por um número (o 404), vai no lugar dele em display-large. */
function emptyState(icon: string, title: string, text: string, action = ""): string {
  const mark = /^\d/.test(icon) ? `<p class="empty__code">${esc(icon)}</p>` : `<span class="icon">${icon}</span>`;
  return `<div class="empty">${mark}<p class="empty__title">${esc(title)}</p><p>${esc(text)}</p>${action}</div>`;
}

/** O navegador abrindo uma página (e não o script dela ou um arquivo pedindo dados). */
function opensPage(request: Request): boolean {
  return request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
}

/**
 * O endereço do editado muda a cada edição (?v=<quando ficou pronta>): o navegador guarda o
 * MP4 por um dia, e sem isso continuaria mostrando (e baixando) a edição anterior.
 */
function editedSrc(v: Video): string {
  return `/videos/${v.id}.editado.mp4?v=${encodeURIComponent(v.edited_at ?? v.updated_at)}`;
}

/** O arquivo pronto: a imagem do modelo de imagem ou o vídeo (com o áudio tratado, se houver). */
function mediaSrc(v: Video): string {
  return makesImage(structureById(v.structure)) ? `/videos/${v.id}.${v.video_key?.split(".").pop() ?? "png"}` : videoSrc(v);
}

function videoSrc(v: Video): string {
  return `/videos/${v.id}.mp4${v.processed_key ? "?tratado" : ""}`;
}

/** A duração do HeyGen segue a fala: até o vídeo ficar pronto, é uma estimativa. */
function durationLabel(v: Video, structure: Structure): string {
  if (makesImage(structure)) return "—";
  // Pela fala é estimativa; a HeyGen direta devolve a duração certa quando o vídeo fica pronto.
  const exact = videoPlatform(v) === "heygen" && v.status === "completed";
  return "speech" in structure.cost.seconds && !exact ? `≈ ${v.duration} s` : `${v.duration} s`;
}

/** Uma seção do formulário: título e campos. */
function formSection(section: Section, value: Values): string {
  return `<section class="form-section">
        <h2 class="form-section__title">${esc(section.title)}</h2>
        ${section.fields.map((f) => formField(f, value)).join("")}
      </section>`;
}

/**
 * O campo, dentro de um bloco que só aparece quando os campos citados em `showIf`
 * têm um dos valores (o script da página esconde e desliga o resto, para não ir no formulário).
 */
function formField(f: Field, value: Values): string {
  const inner = fieldHtml(f, value);
  if (!f.showIf) return inner;
  const visible = Object.entries(f.showIf).every(([name, values]) => values.includes(value(name)));
  return `<div class="conditional" data-show-if="${esc(JSON.stringify(f.showIf))}"${visible ? "" : " hidden"}>${inner}</div>`;
}

/**
 * O seletor de arquivo do painel (foto, vídeo ou áudio): o script da página cuida da prévia
 * e do nome pelo `kind` (data-image, data-source, data-audio). `current` é o arquivo já guardado.
 */
function filePicker(
  kind: "image" | "source" | "audio",
  o: { name: string; label: string; title: string; accept: string; required?: boolean; icon: string; empty: string; hint: string; current?: { name: string; hint: string; preview?: string } },
): string {
  const previewAttr = kind === "image" ? " data-preview" : kind === "source" ? " data-source-preview" : "";
  const preview = o.current?.preview ?? `<span class="icon">${o.icon}</span>`;
  const trailing = kind === "audio" ? "" : `<span class="icon file-picker__trailing" data-${kind}-trailing${o.current ? "" : " hidden"}>edit</span>`;
  const name = o.current?.name ?? o.empty, hint = o.current?.hint ?? o.hint;
  return `<label class="file-picker interactive" title="${esc(o.title)}">
          <input type="file" name="${o.name}" accept="${o.accept}" aria-label="${esc(o.label)}"${o.required ? " required" : ""} data-${kind}>
          <span class="file-picker__preview"${previewAttr}>${preview}</span>
          <span class="file-picker__text">
            <span class="file-picker__name" data-${kind}-name data-empty="${esc(name)}">${esc(name)}</span>
            <span class="file-picker__hint" data-${kind}-hint data-empty="${esc(hint)}">${esc(hint)}</span>
          </span>
          ${trailing}
        </label>`;
}

function fieldHtml(f: Field, value: Values): string {
  switch (f.kind) {
    case "textarea":
      return `<div class="text-field">
          <textarea class="text-field__input" id="${f.name}" name="${f.name}" rows="1" required maxlength="${f.maxLength}" placeholder="${esc(f.placeholder)}" aria-describedby="${f.name}-ajuda"${f.speech ? " data-speech" : ""}${f.perAvatar ? " data-per-avatar" : ""}>${esc(value(f.name))}</textarea>
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
            .map((o) => `<option value="${esc(o.value)}"${o.value === selected ? " selected" : ""}${o.description ? ` data-description="${esc(o.description)}"` : ""}${o.divider ? " data-divider" : ""}>${esc(o.label)}</option>`)
            .join("")}</select>
          <label class="text-field__label" for="${f.name}">${esc(f.label)}</label>
          <span class="icon text-field__trailing" aria-hidden="true">arrow_drop_down</span>
          ${supporting ? `<p class="text-field__supporting" id="${f.name}-ajuda">${supporting}</p>` : ""}
        </div>`;
    }
    case "segmented":
      return segmented(f.name, f.label, f.options, value(f.name), undefined, f.hideLabel);
    case "voice": {
      const voice = chosenVoice(f.voices, value(f.name));
      return `<input type="hidden" name="${f.name}" value="${esc(voice.value)}" data-voice-input>
        <ul class="file-list">
          <li><button class="file-picker interactive" type="button" data-panel-open="vozes" aria-expanded="false" aria-label="${esc(f.label)}: trocar"><span class="file-picker__preview"><span class="icon">record_voice_over</span></span><span class="file-picker__text"><span class="file-picker__name" data-voice-name>${esc(voice.name)}</span><span class="file-picker__hint" data-voice-hint>${esc(voiceHint(voice))}</span></span><span class="icon file-picker__trailing">chevron_right</span></button></li>
        </ul>`;
    }
    case "image":
      return filePicker("image", {
        name: f.name,
        label: f.label,
        title: `JPG, PNG ou WebP, até ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
        accept: "image/jpeg,image/png,image/webp",
        required: f.required,
        icon: "face",
        empty: `Adicionar ${f.label.toLowerCase()}`,
        hint: f.supporting,
      });
    case "video":
      return filePicker("source", {
        name: f.name,
        label: f.label,
        title: `MP4 ou MOV, até ${MAX_VIDEO_BYTES / 1024 / 1024} MB`,
        accept: "video/mp4,video/quicktime",
        required: true,
        icon: "videocam",
        empty: `Adicionar ${f.label.toLowerCase()}`,
        hint: f.supporting,
      });
    case "audio":
      return filePicker("audio", {
        name: f.name,
        label: f.label,
        title: `MP3 ou WAV, até ${MAX_AUDIO_BYTES / 1024 / 1024} MB`,
        accept: "audio/mpeg,audio/wav,audio/x-wav",
        required: true,
        icon: "mic",
        empty: `Adicionar ${f.label.toLowerCase()}`,
        hint: f.supporting,
      });
    case "checkbox":
      return `<label class="checkbox-field">
          <input type="checkbox" name="${f.name}" value="sim" required${value(f.name) === "sim" ? " checked" : ""}>
          <span class="checkbox-field__label">${esc(f.label)}</span>
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
    <p class="login__text">Esqueceu a senha? ${esc(PARTES.get(ERROS.conviteInvalido)![1]!)}</p>
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

/** Criar (ou trocar) a senha pelo link de convite. */
function invitePageHtml(token: string, name: string, email: string, hasPassword: boolean, error?: string): string {
  const title = hasPassword ? "Trocar a senha" : "Criar a senha";
  return authPage(
    title,
    "",
    `<form class="card card--outlined login" method="post" action="/convite/${esc(token)}">
    ${authHead(title, `Olá, ${name}. Escolha a senha para entrar com ${email}.`)}
    ${textField("senha", "Senha", `type="password" autocomplete="new-password" required autofocus minlength="${PASSWORD_MIN}" maxlength="${PASSWORD_MAX}"`, `De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`)}
    ${textField("confirmar", "Repita a senha", `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}" maxlength="${PASSWORD_MAX}"`)}
    <button class="button button--filled interactive" type="submit"><span class="icon">lock</span>Salvar a senha</button>
  </form>`,
    error,
  );
}

/** O link que venceu, já foi usado ou não existe. */
function invalidInvitePage(): string {
  const [houve, fazer] = PARTES.get(ERROS.conviteInvalido)!;
  return authPage(
    "Link inválido",
    "",
    `<div class="card card--outlined login">
    ${authHead(houve!, fazer!)}
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
type Bar = false | { user: User; tab?: "modelos" | "avatares" | "videos" | "projetos"; search: Search } | { user: User; back: string; title: string; actions?: string };

function accountActions(user: User): string {
  const initial = esc((user.name.trim()[0] ?? "?").toUpperCase());
  // Sair fica só no menu do perfil.
  return `<details class="menu menu--account" data-menu>
      <summary class="avatar interactive" aria-label="Sua conta: ${esc(user.name)}" title="${esc(user.name)}">${initial}</summary>
      <div class="menu__list">
        <p class="menu__header"><span class="menu__name">${esc(user.name)}</span><span class="menu__email">${esc(user.email)}</span></p>
        <hr class="menu__divider">
        ${pode(user, "ver:painel") ? `<a class="menu__item interactive" href="/painel"><span class="icon">monitoring</span>Painel</a>` : ""}
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
  <div class="top-app-bar__actions">${bar.actions ?? ""}${accountActions(bar.user)}</div>
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
  <nav class="nav-pills" aria-label="Seções">${tab("modelos", "/", "Modelos")}${tab("avatares", "/avatares", "Avatares")}${tab("videos", "/videos", "Vídeos")}${pode(bar.user, "usar:canvas") ? tab("projetos", "/projetos", "Projetos") : ""}</nav>
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
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
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
/** Indicador circular dos botões ocupados (.spinner, em style.ts). */
const SPINNER = `<svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.8"/></svg>`;

const SCRIPT = `(() => {
  const SPINNER = '${SPINNER}';
  const setBusy = (el) => { el.classList.add("is-busy"); el.setAttribute("aria-busy", "true"); el.insertAdjacentHTML("beforeend", SPINNER); };
  // Todo envio mostra retorno no clique. Desativar fica para depois do envio: botão desativado
  // não vai no formulário, e o do avatar leva a escolha. Em lista, só o item tocado gira.
  document.addEventListener("submit", (e) => {
    const b = e.submitter;
    if (e.defaultPrevented || !b || e.target.method !== "post" || !b.matches(".button, .fab, .avatar-option")) return;
    setBusy(b);
    const group = b.matches(".avatar-option") ? [...b.closest("dialog").querySelectorAll(".avatar-option")] : [b];
    setTimeout(() => { for (const o of group) { o.disabled = true; o.dataset.busyOff = ""; } });
  });
  // Voltar pelo navegador restaura a página como estava: os botões voltam ao normal.
  addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    for (const o of document.querySelectorAll("[data-busy-off]")) { o.disabled = false; delete o.dataset.busyOff; }
    for (const o of document.querySelectorAll(".is-busy")) { o.classList.remove("is-busy"); o.removeAttribute("aria-busy"); o.querySelector(".spinner").remove(); }
  });

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
  // botão abre um menu do M3 com as opções, igual em todos os navegadores. Também
  // em window.mdSelect(select), para campos postos depois (o painel do canvas);
  // devolve a função que desfaz (tira o menu e os ouvintes da janela).
  // Seletor Versão (Omni 1.1 e 1.2): abre a página da versão escolhida.
  for (const i of document.querySelectorAll("[data-version-switch] input")) i.addEventListener("change", () => { location.href = "/modelo/" + i.value; });
  let selectN = 0;
  const enhanceSelect = (sel) => {
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
      // Opção de outro grupo: o divisor do menu vertical antes dela.
      if (o.hasAttribute("data-divider")) list.insertAdjacentHTML("beforeend", '<hr class="menu__divider" aria-hidden="true">');
      list.append(item);
    }
    sel.classList.add("visually-hidden"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    sel.after(btn); document.body.append(list);
    if (label) { label.htmlFor = btn.id; label.id = btn.id + "-rotulo"; btn.setAttribute("aria-labelledby", label.id + " " + btn.id); }
    const items = [...list.querySelectorAll("[role=option]")];
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
    const onScroll = (e) => { if (list.matches(":popover-open") && !list.contains(e.target)) list.hidePopover(); };
    const onResize = () => { if (list.matches(":popover-open")) list.hidePopover(); };
    addEventListener("scroll", onScroll, true);
    addEventListener("resize", onResize);
    sel.addEventListener("change", sync);
    sync();
    return () => { list.remove(); removeEventListener("scroll", onScroll, true); removeEventListener("resize", onResize); };
  };
  window.mdSelect = enhanceSelect;
  document.querySelectorAll(".text-field--select select").forEach(enhanceSelect);

  // Campos de texto que crescem com o texto (a fala, o movimento): a altura acompanha o conteúdo.
  for (const t of document.querySelectorAll("textarea.text-field__input")) {
    const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + (t.offsetHeight - t.clientHeight) + "px"; };
    t.addEventListener("input", fit);
    fit();
  }

  // Ativos cortados no rosto: os olhos a 40% da altura e no meio da largura, como em thumbPosition.
  // window.mdThumbs(root) faz o mesmo (e a miniatura que só baixa quando aparece) no que chegou depois.
  const placeFaces = (root) => { for (const el of root.querySelectorAll("[data-face]")) {
    const place = () => {
      const [fx, fy] = el.dataset.face.split(",").map(Number);
      const pct = (r, f, target) => (r > 1 ? Math.min(100, Math.max(0, ((r * f - target) / (r - 1)) * 100)) : 50);
      const ratio = (el.naturalHeight || el.videoHeight) / (el.naturalWidth || el.videoWidth);
      el.style.objectPosition = pct(1 / ratio, fx, 0.5) + "% " + pct(ratio, fy, 0.4) + "%";
    };
    if (el.naturalWidth || el.videoWidth) place();
    else el.addEventListener(el.tagName === "VIDEO" ? "loadedmetadata" : "load", place, { once: true });
  } };
  placeFaces(document);

  // Miniaturas: o vídeo só baixa quando aparece na tela (a vista escondida não baixa nada).
  {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        const v = e.target;
        // Com o src posto depois, o navegador decodifica o quadro mas nem sempre o desenha: ir ao quadro garante.
        // O #t=0.5 é para o iPhone, que com preload="metadata" não baixa quadro nenhum sem ele.
        v.addEventListener("loadeddata", () => { v.currentTime = 0.5; }, { once: true });
        v.src = v.dataset.src + "#t=0.5"; v.removeAttribute("data-src"); io.unobserve(v);
      }
    }, { rootMargin: "200px" });
    const watch = (root) => root.querySelectorAll("video[data-src]").forEach((t) => io.observe(t));
    watch(document);
    window.mdThumbs = (root) => { placeFaces(root); watch(root); };
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
          const icon = qePlay ? qePlay.querySelector(".icon").textContent : "play_arrow";
          setIcon(playBtn, icon, qePlay ? qePlay.getAttribute("aria-label") : "Tocar a prévia");
          // O tempo da prévia vem como "0,5 s / 6,0 s": vira o mesmo formato do vídeo (0:00 / 0:06).
          const n = qeTime ? (qeTime.textContent.match(/[\\d,]+/g) || []).map((x) => Number(x.replace(",", "."))) : [];
          time.textContent = n.length === 2 ? clock(n[0]) + " / " + clock(n[1]) : "";
          // O slider não busca na prévia, mas mostra até onde ela foi.
          const p = n.length === 2 && n[1] ? Math.min(1, n[0] / n[1]) : 0;
          seek.value = String(Math.round(p * 1000)); seek.style.setProperty("--p", p * 100 + "%");
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
      // Tela cheia da moldura; no iPhone (sem tela cheia de elemento), a do próprio vídeo.
      full.addEventListener("click", () => {
        if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
        if (frame.requestFullscreen) return void frame.requestFullscreen().catch(() => {});
        if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      });
      document.addEventListener("fullscreenchange", () => setIcon(full, document.fullscreenElement ? "fullscreen_exit" : "fullscreen", document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia"));
      addEventListener("keydown", (e) => { if (e.key === " " && !(e.target.closest && e.target.closest("input, textarea, select, button, a, summary"))) { e.preventDefault(); toggle(); } });
      new MutationObserver(sync).observe(stage, { attributes: true, attributeFilter: ["class"] });
      if (qePlay) new MutationObserver(sync).observe(qePlay, { subtree: true, childList: true, characterData: true });
      if (qeTime) new MutationObserver(sync).observe(qeTime, { subtree: true, childList: true, characterData: true });
      sync();
    }

    // Edição rápida de um vídeo já editado: Original | Editado troca o vídeo do player; os ajustes
    // só aparecem no "Editar de novo" (que já é a confirmação de que a edição atual será trocada).
    const qeEl = viewer.querySelector("[data-quick-edit][data-edited]");
    if (qeEl) {
      const mainVideo = document.querySelector(".viewer__player video");
      for (const b of qeEl.querySelectorAll("[data-version]")) b.addEventListener("click", () => {
        for (const o of qeEl.querySelectorAll("[data-version]")) o.toggleAttribute("aria-current", o === b);
        if (mainVideo && mainVideo.getAttribute("src") !== b.dataset.version) { mainVideo.src = b.dataset.version; mainVideo.play().catch(() => {}); }
      });
      qeEl.querySelector("[data-qe-again]").addEventListener("click", () => qeEl.classList.add("is-again"));
      qeEl.querySelector("[data-qe-close]").addEventListener("click", () => qeEl.classList.remove("is-again"));
    }

  }

  // Copiar (o texto do vídeo, o link de convite): o rótulo vira "Copiado" por 2 segundos.
  for (const c of document.querySelectorAll("[data-copy]")) c.addEventListener("click", async () => {
    const label = c.lastElementChild;
    try { await navigator.clipboard.writeText(c.dataset.copy); label.textContent = "Copiado"; setTimeout(() => (label.textContent = "Copiar"), 2000); } catch {}
  });

  // Diálogos: abrir e buscar na lista de avatares (a mesma do painel de ativos).
  for (const b of document.querySelectorAll("[data-dialog-open]")) b.addEventListener("click", () => document.getElementById(b.dataset.dialogOpen).showModal());
  for (const box of document.querySelectorAll("[data-avatar-search]")) box.addEventListener("input", () => {
    const d = box.closest("dialog, [data-panel-view]"), q = box.value.trim().toLowerCase();
    let n = 0;
    for (const it of d.querySelectorAll("[data-avatar-item]")) { it.hidden = !it.dataset.avatarItem.includes(q); if (!it.hidden) n++; }
    d.querySelector("[data-avatar-none]").hidden = n > 0;
  });
  for (const input of document.querySelectorAll("[data-auto-submit]")) input.addEventListener("change", () => { if (input.files.length) { setBusy(input.closest(".fab")); input.form.submit(); } });

  const f = document.querySelector("[data-composer]");
  let dirty = false;
  if (f) {
    f.addEventListener("input", () => { dirty = true; });
    const cfg = JSON.parse(f.dataset.composer);
    const val = (name) => (f.elements[name] ? f.elements[name].value || "" : "");
    const speech = f.querySelector("[data-speech]");
    const words = f.querySelector("[data-words]");
    const rate = cfg.rate, mid = (rate.min + rate.max) / 2;
    // Duração do vídeo enviado, lida no navegador; o vídeo gerado fica com a duração aceita mais perto.
    let sourceSeconds = 0;
    const fromSource = () => {
      if (!sourceSeconds) return 0;
      const r = Math.round(sourceSeconds);
      return (cfg.durations || [r]).reduce((best, d) => (Math.abs(d - r) < Math.abs(best - r) ? d : best));
    };
    // Campos que só aparecem com certas escolhas (data-show-if): escondidos, ficam desligados e não vão no formulário.
    const conditional = [...f.querySelectorAll("[data-show-if]")];
    const applyShowIf = () => {
      for (const box of conditional) {
        const rule = JSON.parse(box.dataset.showIf);
        const show = Object.keys(rule).every((k) => rule[k].includes(val(k)));
        box.hidden = !show;
        for (const input of box.querySelectorAll("input, textarea, select")) input.disabled = !show;
      }
    };
    applyShowIf();
    // Duração do áudio da fala enviado ("Meu áudio"), lida no navegador.
    let audioSeconds = 0;
    const audioField = cfg.seconds.audio ? f.elements[cfg.seconds.audio] : null;
    const update = () => {
      applyShowIf();
      const useAudio = audioField && val("fonte") === "audio";
      const n = speech && !speech.disabled ? speech.value.split(/\\s+/).filter(Boolean).length : 0;
      const fixed = cfg.seconds.fixed ? cfg.seconds.fixed : cfg.seconds.field ? Number(val(cfg.seconds.field)) : cfg.seconds.video ? fromSource() : useAudio ? Math.round(audioSeconds) : 0;
      const s = fixed || (n ? Math.max(1, Math.round(n / mid)) : 0);
      const price = Number(cfg.prices[cfg.sku.replace(/\\{(\\w+)\\}/g, (_, k) => val(k))]);
      for (const e of f.querySelectorAll("[data-seconds]")) e.textContent = s ? (fixed ? "" : "≈ ") + s + " s" : "—";
      for (const e of f.querySelectorAll("[data-cost]")) e.textContent = price && s ? "US$ " + (price * s + cfg.extra).toFixed(2) : "—";
      if (!speech || speech.disabled) {
        // Sem fala escrita (troca de avatar, ou o áudio enviado no lugar dela): nada de contador.
      } else if (fixed) {
        // Duração escolhida: a faixa de palavras que cabe nela.
        const min = Math.round(fixed * rate.min), max = Math.round(fixed * rate.max);
        words.textContent = n
          ? n + " palavras" + (n < min ? " · curta para " + fixed + " s (ideal " + min + " a " + max + ")" : n > max ? " · longa para " + fixed + " s (ideal " + min + " a " + max + ")" : " · cabe em " + fixed + " s")
          : "Para " + fixed + " s: umas " + min + " a " + max + " palavras.";
        words.parentElement.classList.toggle("text-field__supporting--error", n > max);
      } else {
        words.textContent = n ? n + " palavras · ≈ " + s + " s de vídeo" : words.dataset.default;
      }
      // Cada campo de texto conta os próprios caracteres (o Omni tem dois: instruções e fala).
      for (const t of f.querySelectorAll("textarea")) {
        const c = f.querySelector("#" + t.name + "-ajuda [data-count]");
        if (c) c.textContent = t.value.length + "/" + t.maxLength;
      }
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

    for (const input of f.querySelectorAll("[data-audio]")) input.addEventListener("change", () => {
      const file = input.files[0], label = input.closest("label");
      const audioName = label.querySelector("[data-audio-name]"), audioHint = label.querySelector("[data-audio-hint]");
      audioName.textContent = file ? file.name : audioName.dataset.empty;
      audioHint.textContent = file ? "Trocar áudio" : audioHint.dataset.empty;
    });

    // Avatar: o menu desdobra ao lado do painel; primeiro o avatar, depois um ativo
    // por tipo, que se acumula no painel. Enviar um arquivo fica no campo do próprio menu.
    const panel = f.querySelector("[data-side-panel]");
    if (panel) {
      const section = f.querySelector(".form-section--assets"), list = f.querySelector("[data-asset-list]"), add = list.querySelector("[data-asset-add]");
      const rowTemplate = section.querySelector("template"), avatarInput = f.querySelector("[data-avatar-input]");
      // Os quadros mudam ("Mostrar mais" traz mais): sempre lidos de novo.
      const frames = () => [...panel.querySelectorAll("[data-asset]")], uploads = [...panel.querySelectorAll("[data-asset-upload]")];
      const opens = [...f.querySelectorAll("[data-panel-open]")], views = [...panel.querySelectorAll("[data-panel-view]")];
      const chips = [...panel.querySelectorAll("[data-kind]")], kindViews = [...panel.querySelectorAll("[data-kind-view]")];
      const title = panel.querySelector("[data-panel-title]"), back = panel.querySelector("[data-panel-back]");
      const LABELS = { imagem: "Imagem", video: "Vídeo", audio: "Áudio" };
      let view = null, avatarName = "", cover = "", voiceBefore = "pronta", refreshPaste = () => {};
      // A voz: uma amostra toca por vez e para quando o menu fecha.
      const audio = new Audio(), voiceInput = f.querySelector("[data-voice-input]");
      let playing = null, openVoices = () => {};
      const stopVoice = () => {
        audio.pause();
        if (playing) playing.firstElementChild.textContent = "play_arrow";
        playing = null;
      };
      const show = (next) => {
        if (next !== "vozes") stopVoice();
        view = next;
        panel.hidden = !next;
        // A linha do avatar abre a lista de avatares e, com um escolhido, os ativos dele.
        for (const b of opens) b.setAttribute("aria-expanded", String(b.dataset.panelOpen === next || (b.dataset.panelOpen === "avatares" && next === "ativos")));
        for (const v of views) v.hidden = v.dataset.panelView !== next;
        back.hidden = next !== "ativos";
        title.textContent = next === "ativos" ? avatarName : next === "vozes" ? "Escolha a voz" : next === "referencias" ? "Adicionar ativo" : "Escolha o avatar";
        if (next === "vozes") openVoices();
        if (next === "ativos" || next === "referencias") refreshPaste();
      };
      const showKind = (kind) => {
        for (const c of chips) c.setAttribute("aria-pressed", String(c.dataset.kind === kind));
        for (const v of kindViews) v.hidden = v.dataset.kindView !== kind;
      };
      const rowOf = (kind) => list.querySelector('[data-row-kind="' + kind + '"]');
      // A duração do vídeo e do áudio vale para o custo; lida no navegador.
      const measure = (kind, src) => {
        if (kind === "imagem") return;
        const m = document.createElement(kind === "video" ? "video" : "audio");
        m.preload = "metadata";
        m.addEventListener("loadedmetadata", () => {
          const seconds = Number.isFinite(m.duration) ? m.duration : 0;
          if (kind === "video") sourceSeconds = seconds; else audioSeconds = seconds;
          update();
        });
        m.src = src;
      };
      const setFonte = (value) => {
        if (!f.elements.fonte || val("fonte") === value) return;
        f.elements.fonte.value = value;
        f.dispatchEvent(new Event("change"));
      };
      const clear = (kind, keepUpload) => {
        const row = rowOf(kind);
        if (row) row.remove();
        for (const b of frames()) if (b.dataset.assetType === kind) b.setAttribute("aria-pressed", "false");
        if (!keepUpload) for (const u of uploads) if (u.dataset.assetUpload === kind) u.value = "";
        if (kind === "video") sourceSeconds = 0;
        if (kind === "audio") audioSeconds = 0;
      };
      const set = (kind, item) => {
        clear(kind, !item.id);
        const row = rowTemplate.content.firstElementChild.cloneNode(true);
        row.dataset.rowKind = kind;
        row.querySelector("[data-row-name]").textContent = item.name;
        row.querySelector("[data-row-hint]").textContent = item.hint;
        const box = row.querySelector("[data-row-preview]");
        if (kind === "audio") box.innerHTML = '<span class="icon">mic</span>';
        else {
          const media = document.createElement(kind === "video" ? "video" : "img");
          media.alt = ""; media.muted = true; media.playsInline = true;
          media.src = kind === "video" ? item.src + "#t=0.5" : item.src;
          box.append(media);
        }
        if (item.avatar) row.dataset.rowAvatar = "";
        if (item.id) {
          const input = document.createElement("input");
          input.type = "hidden"; input.name = "ativo"; input.value = item.id;
          row.append(input);
        }
        row.querySelector("[data-row-remove]").addEventListener("click", () => {
          clear(kind);
          if (kind === "audio") setFonte(voiceBefore);
          update();
        });
        list.insertBefore(row, add);
        if (kind === "audio") {
          if (val("fonte") !== "audio") voiceBefore = val("fonte");
          setFonte("audio");
        }
        measure(kind, item.src);
        update();
      };
      const pickFrame = (b) => set(b.dataset.assetType, { id: b.dataset.asset, avatar: Boolean(b.dataset.assetOf), name: b.dataset.assetName, src: b.dataset.assetSrc, hint: b.dataset.assetHint || (b.dataset.asset === cover ? "Foto principal" : LABELS[b.dataset.assetType]) });
      // Escolher marca o quadro em todos os menus em que ele aparece.
      const markPicked = (id) => { for (const a of frames()) if (a.dataset.asset === id) a.setAttribute("aria-pressed", "true"); };
      panel.addEventListener("click", async (e) => {
        const more = e.target.closest("[data-generated-more]");
        if (more) {
          more.disabled = true;
          try {
            const res = await fetch("/gerados?" + new URLSearchParams({ tipo: more.dataset.generatedKind, de: more.dataset.generatedMore }));
            if (!res.ok) throw new Error();
            const grid = more.closest(".asset-grid"), chosen = list.querySelector('[data-row-kind="' + more.dataset.generatedKind + '"] input[name="ativo"]');
            more.parentElement.remove();
            grid.insertAdjacentHTML("beforeend", await res.text());
            window.mdThumbs(grid);
            if (chosen) markPicked(chosen.value);
          } catch { more.disabled = false; }
          return;
        }
        const b = e.target.closest("[data-asset]");
        if (!b) return;
        if (b.getAttribute("aria-pressed") === "true") { clear(b.dataset.assetType); if (b.dataset.assetType === "audio") setFonte(voiceBefore); update(); return; }
        pickFrame(b);
        markPicked(b.dataset.asset);
      });
      for (const u of uploads) u.addEventListener("change", () => {
        const file = u.files[0];
        // O mesmo tipo pode ser enviado nos dois menus: vale o último.
        for (const o of uploads) if (o !== u && o.dataset.assetUpload === u.dataset.assetUpload) o.value = "";
        if (file) set(u.dataset.assetUpload, { name: file.name, src: URL.createObjectURL(file), hint: "Arquivo enviado" });
      });
      // O campo com o último texto do avatar: só troca se estiver vazio ou ainda com o texto de outro avatar.
      const perAvatar = f.querySelector("[data-per-avatar]");
      let autoText = "";
      const pickAvatar = (b) => {
        // Sai o que veio do avatar anterior; o que foi enviado ou gerado fica (a foto principal ainda troca a imagem).
        for (const r of list.querySelectorAll("[data-row-avatar]")) clear(r.dataset.rowKind);
        if (perAvatar && (!perAvatar.value.trim() || perAvatar.value === autoText)) {
          perAvatar.value = autoText = b.dataset.avatarText || "";
          perAvatar.dispatchEvent(new Event("input", { bubbles: true }));
        }
        avatarInput.value = b.dataset.avatarPick;
        avatarName = b.dataset.avatarName;
        cover = b.dataset.avatarCover;
        f.querySelector("[data-avatar-name]").textContent = avatarName;
        const preview = f.querySelector("[data-avatar-preview]");
        preview.classList.toggle("file-picker__preview--empty", !cover);
        if (cover) {
          const img = new Image(); img.alt = ""; img.src = "/avatares/" + avatarInput.value + "/arquivos/" + cover;
          preview.replaceChildren(img);
        }
        for (const a of frames()) if (a.dataset.assetOf) a.hidden = a.dataset.assetOf !== avatarInput.value;
        const main = frames().find((a) => a.dataset.asset === cover);
        if (main) { pickFrame(main); markPicked(main.dataset.asset); }
        // Avatar com voz: já deixa a voz dele escolhida, onde a voz clonada existe.
        const clone = f.elements.clone, voice = b.dataset.avatarVoice;
        if (clone && voice && [...clone.options].some((o) => o.value === voice)) {
          f.elements.fonte.value = "clonada";
          clone.value = voice;
          clone.dispatchEvent(new Event("change", { bubbles: true }));
        }
        showKind(kindViews[0].dataset.kindView);
        show("ativos");
      };
      for (const b of panel.querySelectorAll("[data-avatar-pick]")) b.addEventListener("click", () => pickAvatar(b));
      for (const b of opens) b.addEventListener("click", () => {
        if (b.getAttribute("aria-expanded") === "true") return show(null);
        show(b.dataset.panelOpen === "avatares" && avatarInput.value ? "ativos" : b.dataset.panelOpen);
      });
      for (const c of chips) c.addEventListener("click", () => showKind(c.dataset.kind));
      back.addEventListener("click", () => show("avatares"));
      panel.querySelector("[data-panel-close]").addEventListener("click", () => show(null));
      panel.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.matches("input")) e.preventDefault();
        if (e.key === "Escape") show(null);
      });
      if (voiceInput) {
        const voiceView = panel.querySelector('[data-panel-view="vozes"]'), search = voiceView.querySelector("[data-voice-search]"), language = voiceView.querySelector("[data-voice-language]");
        const genders = [...voiceView.querySelectorAll("[data-voice-filter]")], rows = voiceView.querySelector("[data-voice-list]");
        const progress = voiceView.querySelector("[data-voice-progress]"), failed = voiceView.querySelector("[data-voice-error]");
        const markVoice = () => { for (const b of rows.querySelectorAll("[data-voice]")) b.setAttribute("aria-pressed", String(b.dataset.voice === voiceInput.value)); };
        // Só vem do servidor o que os filtros pedem; a resposta de um filtro antigo é ignorada.
        let asked = 0, typing = 0;
        const load = async (from) => {
          const id = ++asked;
          if (!from) stopVoice();
          progress.hidden = false;
          failed.hidden = true;
          const gender = genders.find((c) => c.getAttribute("aria-pressed") === "true");
          const query = new URLSearchParams({ idioma: language.value, genero: gender ? gender.dataset.voiceFilter : "", busca: search.value.trim(), de: from });
          try {
            const res = await fetch("/vozes/lista?" + query);
            if (!res.ok) throw new Error();
            const page = await res.text();
            if (id !== asked) return;
            const more = rows.querySelector(".voice-more");
            if (more) more.remove();
            if (from) rows.insertAdjacentHTML("beforeend", page); else rows.innerHTML = page;
            markVoice();
          } catch {
            if (id !== asked) return;
            failed.hidden = false;
          }
          progress.hidden = true;
        };
        openVoices = () => { if (!rows.children.length) load(0); };
        search.addEventListener("input", () => { clearTimeout(typing); typing = setTimeout(() => load(0), 250); });
        language.addEventListener("change", () => load(0));
        for (const c of genders) c.addEventListener("click", () => {
          const on = c.getAttribute("aria-pressed") === "true";
          for (const o of genders) o.setAttribute("aria-pressed", "false");
          c.setAttribute("aria-pressed", String(!on));
          load(0);
        });
        rows.addEventListener("click", (e) => {
          const pick = e.target.closest("[data-voice]"), play = e.target.closest("[data-voice-play]"), more = e.target.closest("[data-voice-more]");
          if (more) load(Number(more.dataset.voiceMore));
          if (pick) {
            voiceInput.value = pick.dataset.voice;
            f.querySelector("[data-voice-name]").textContent = pick.dataset.name;
            f.querySelector("[data-voice-hint]").textContent = pick.dataset.hint;
            markVoice();
            dirty = true;
          }
          if (play) {
            const again = playing === play;
            stopVoice();
            if (again) return;
            playing = play;
            play.firstElementChild.textContent = "pause";
            audio.src = play.dataset.voicePlay;
            audio.play().catch(stopVoice);
          }
        });
        audio.addEventListener("ended", stopVoice);
      }
      // "Meu áudio" sem áudio escolhido abre os áudios; sair dele tira o áudio da lista.
      f.addEventListener("change", (e) => {
        if (e.target.name !== "fonte") return;
        if (view === "vozes" && val("fonte") !== "pronta") show(null);
        if (val("fonte") !== "audio") { clear("audio"); update(); }
        else if (!rowOf("audio")) { showKind("audio"); show(avatarInput.value ? "ativos" : "avatares"); }
      });
      // O menu do botão direito em "Adicionar ativo": colar uma imagem e usar o gerado mais recente de cada tipo.
      const quickMenu = section.querySelector("[data-paste-menu]");
      const recentItems = [...quickMenu.querySelectorAll("[data-recent-item]")], pasteItem = quickMenu.querySelector("[data-paste-item]");
      let canPaste = () => false;
      // Colar uma imagem da área de transferência: vira um envio, como "Enviar arquivo". Pelo quadro
      // "Colar imagem" do menu, pelo botão direito em "Adicionar ativo" ou com Ctrl/Cmd+V fora dos campos.
      const pasteInput = panel.querySelector('[data-panel-view="referencias"] [data-asset-upload="imagem"]');
      if (pasteInput) {
        const pasteTiles = [...panel.querySelectorAll("[data-paste]")];
        const IMAGE = /^image.(png|jpeg|webp)$/;
        const usePasted = (blob) => {
          const file = new File([blob], "Imagem colada." + (blob.type.split("/")[1] === "jpeg" ? "jpg" : blob.type.split("/")[1]), { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          pasteInput.files = dt.files;
          pasteInput.dispatchEvent(new Event("change"));
        };
        const clipboardImage = async () => {
          for (const item of await navigator.clipboard.read()) {
            const type = item.types.find((t) => IMAGE.test(t));
            if (type) return item.getType(type);
          }
          return null;
        };
        // Sem imagem, nada: nem quadro, nem aviso.
        const paste = async () => {
          let image = null;
          try { image = await clipboardImage(); } catch {}
          if (image) usePasted(image);
        };
        // O quadro só aparece com imagem copiada, e o navegador só conta isso com a leitura liberada.
        // Antes de liberar (state "prompt"), o botão direito oferece colar: tocar é o que pede a permissão.
        let pasteState = "denied", hasImage = false;
        refreshPaste = async () => {
          pasteState = navigator.clipboard && navigator.clipboard.read ? "prompt" : "denied";
          try { pasteState = (await navigator.permissions.query({ name: "clipboard-read" })).state; } catch {}
          hasImage = false;
          if (pasteState === "granted") { try { hasImage = Boolean(await clipboardImage()); } catch {} }
          for (const t of pasteTiles) t.hidden = !hasImage;
        };
        canPaste = () => hasImage || pasteState === "prompt";
        refreshPaste();
        addEventListener("focus", refreshPaste);
        for (const t of pasteTiles) t.addEventListener("click", paste);
        pasteItem.addEventListener("click", async () => { quickMenu.hidePopover(); await paste(); refreshPaste(); });
        document.addEventListener("paste", (e) => {
          if (e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
          const file = [...(e.clipboardData ? e.clipboardData.files : [])].find((f) => IMAGE.test(f.type));
          if (!file) return;
          e.preventDefault();
          usePasted(file);
        });
      }
      add.querySelector("button").addEventListener("contextmenu", (e) => {
        if (pasteItem) pasteItem.hidden = !canPaste();
        const first = quickMenu.querySelector(".menu__item:not([hidden])");
        // Nada a oferecer: fica o menu do navegador.
        if (!first) return;
        e.preventDefault();
        quickMenu.style.left = e.clientX + "px";
        quickMenu.style.top = e.clientY + "px";
        quickMenu.showPopover();
        first.focus();
      });
      // "Usar … recente": o gerado mais recente daquele tipo, como uma escolha do painel.
      for (const r of recentItems) r.addEventListener("click", () => {
        quickMenu.hidePopover();
        const item = JSON.parse(r.dataset.recentItem);
        set(item.kind, item);
        markPicked(item.id);
      });
      // Arrastar um vídeo ou imagem pronto da lista para o painel: entra no tipo dele, se o modelo aceitar.
      const pane = f.querySelector(".pane--config"), PREFIX = "application/x-meu-avatar-";
      const dragged = (e) => [...e.dataTransfer.types].find((t) => t.startsWith(PREFIX) && kindViews.some((v) => v.dataset.kindView === t.slice(PREFIX.length)));
      const dropOff = () => list.classList.remove("file-list--drop");
      f.addEventListener("dragstart", (e) => {
        const card = e.target.closest && e.target.closest("[data-ref]");
        if (!card) return;
        e.dataTransfer.setData(PREFIX + JSON.parse(card.dataset.ref).kind, card.dataset.ref);
        e.dataTransfer.effectAllowed = "copy";
      });
      f.addEventListener("dragend", dropOff);
      pane.addEventListener("dragover", (e) => {
        if (!dragged(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        list.classList.add("file-list--drop");
      });
      pane.addEventListener("dragleave", (e) => { if (!pane.contains(e.relatedTarget)) dropOff(); });
      pane.addEventListener("drop", (e) => {
        const type = dragged(e);
        dropOff();
        if (!type) return;
        e.preventDefault();
        const item = JSON.parse(e.dataTransfer.getData(type));
        set(item.kind, item);
        markPicked(item.id);
      });
      // Geração com erro, Refazer ou "Usar para gerar": o avatar e os arquivos já vêm escolhidos.
      if (section.dataset.picks) {
        const picks = JSON.parse(section.dataset.picks);
        const b = picks.avatar && panel.querySelector('[data-avatar-pick="' + picks.avatar + '"]');
        if (b) {
          // A voz que veio no formulário (a do vídeo, no Refazer) vale mais que a do avatar.
          const clone = f.elements.clone, voiceWas = clone && clone.value, sourceWas = val("fonte");
          pickAvatar(b);
          show(null);
          for (const kind of Object.keys(LABELS)) clear(kind);
          if (clone && clone.value !== voiceWas) {
            clone.value = voiceWas;
            clone.dispatchEvent(new Event("change", { bubbles: true }));
            setFonte(sourceWas);
          }
        }
        for (const a of frames()) if (picks.assets.includes(a.dataset.asset) && !rowOf(a.dataset.assetType) && (!a.dataset.assetOf || a.dataset.assetOf === avatarInput.value)) { pickFrame(a); markPicked(a.dataset.asset); }
        for (const item of picks.items || []) if (!rowOf(item.kind)) { set(item.kind, item); markPicked(item.id); }
      }
    }
  }

  // Vídeo na fila: confere de novo de tempos em tempos, sem perder o que está sendo
  // escrito, sem fechar um diálogo aberto e sem cortar um vídeo que está tocando.
  const refresh = Number(document.body.dataset.refresh);
  // Confere a página em segundo plano e só recarrega quando o status de algum vídeo mudou:
  // sem a página piscando a cada rodada e sem perder o filtro e a vista escolhidos.
  // A ordem não conta: quem trocou a ordem da lista não tem nada novo para ver.
  const signature = (doc) => [...doc.querySelectorAll("[data-kind][data-video], .status-line")].map((e) => (e.dataset.video || "") + ":" + (e.dataset.kind || e.textContent)).sort().join(",");
  if (refresh) setInterval(async () => {
    const playing = [...document.querySelectorAll("video")].some((v) => !v.paused);
    // Com o menu lateral aberto, a pessoa está escolhendo: recarregar a tiraria dali.
    if (dirty || playing || document.querySelector(".is-previewing, [data-side-panel]:not([hidden])")) return;
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
  const SPINNER = '${SPINNER}';
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
      error: () => { summary.textContent = cfg.previaIndisponivel; },
    });
    decoder.configure({ codec: track.codec, description: track.description, codedWidth: track.width, codedHeight: track.height });
    feed();
  };

  // No fim, o tocar vira "ver de novo": a prévia não parece travada.
  const setPlaying = (on, ended) => {
    play.querySelector(".icon").textContent = on ? "pause" : ended ? "replay" : "play_arrow";
    play.setAttribute("aria-label", on ? "Pausar a prévia" : ended ? "Ver a prévia de novo" : "Tocar a prévia");
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
    } else summary.textContent = "Sem pausas para cortar.";
    play.disabled = !parts.length || !track;
    clock.textContent = fmt(0) + " / " + fmt(total);
    help();
    // Pronta (e de novo a cada troca de escolha), a prévia já começa a tocar.
    if (track && parts.length) { restart(); toggle(); }
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
    if (t >= total) { stop(); restart(); setPlaying(false, true); clock.textContent = fmt(total) + " / " + fmt(total); return; }
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

  // Abrir a edição rápida só mostra as escolhas; a prévia começa no "Gerar prévia" e,
  // pronta, toca pela barra do player (o botão não vira um segundo tocar).
  const generate = qe.querySelector("[data-qe-preview]");
  const setGenerate = (icon, label, disabled, busy) => {
    generate.querySelector(".spinner")?.remove();
    generate.firstElementChild.textContent = icon; generate.lastElementChild.textContent = label; generate.disabled = disabled;
    generate.classList.toggle("is-busy", !!busy); generate.toggleAttribute("aria-busy", !!busy);
    if (busy) generate.firstElementChild.insertAdjacentHTML("afterend", SPINNER);
  };
  const hint = qe.querySelector("[data-qe-hint]");
  const HINT = hint.textContent;
  let stale = false;
  const intro = () => { summary.textContent = "Escolha os ajustes e gere a prévia."; };
  opener.addEventListener("click", () => {
    qe.hidden = false; opener.hidden = true;
    help(); intro();
    setGenerate("auto_awesome", "Gerar prévia", false);
  });
  generate.addEventListener("click", async () => {
    setGenerate("hourglass_top", "Gerando prévia…", true, true);
    controls.hidden = false;
    player.classList.add("is-previewing");
    // O som da prévia sai pelo Web Audio: no iPhone, assim ele toca mesmo com o modo silencioso.
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
    main.pause();
    if (canvas) canvas.hidden = false;
    if (silences) { build(); stale = false; hint.textContent = HINT; hint.hidden = !track; return setGenerate("check", "Prévia gerada", true); }
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
      setGenerate("check", "Prévia gerada", true);
      hint.hidden = !track;
      if (!track) { const note = document.createElement("p"); note.className = "qe-result__note"; note.textContent = cfg.previaIndisponivel; summary.append(note); }
    } catch {
      summary.textContent = cfg.previaIndisponivel;
      setGenerate("auto_awesome", "Gerar prévia", false);
    }
  });
  qe.querySelector("[data-qe-close]").addEventListener("click", () => {
    stop();
    if (decoder && decoder.state !== "closed") decoder.close();
    for (const f of frames) f.frame.close();
    frames = []; drawn = false; decoder = null;
    if (canvas) canvas.hidden = true;
    qe.hidden = true; opener.hidden = false; controls.hidden = true; hint.hidden = true;
    player.classList.remove("is-previewing");
  });
  // Trocar as escolhas com a prévia gerada refaz a prévia na hora.
  // Trocar uma escolha com a prévia pronta não mexe nela: o "Gerar prévia" volta a valer
  // e refaz na hora com a análise já feita.
  qe.addEventListener("change", () => {
    help();
    if (!silences || !player.classList.contains("is-previewing")) return;
    stale = true;
    hint.textContent = "Ajustes mudaram. Gere de novo.";
    setGenerate("auto_awesome", "Gerar prévia", false);
  });
  form.addEventListener("submit", () => {
    // Sem nova prévia, o editado sai com as escolhas marcadas, não com as da prévia antiga.
    if (stale) {
      const p = planParts(silences, buf.duration, cfg.pauses[form.elements.pausa.value], cfg.cameras[form.elements.camera.value], R);
      input.value = p.length ? JSON.stringify(p) : "";
    }
  });
})();`;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Marca no lugar do nonce do script; html() troca por um valor novo a cada resposta. */
const NONCE = "{{nonce}}";

function html(body: string, status = 200, extra: CspExtra = {}): Response {
  const nonce = randomNonce();
  return new Response(body.replaceAll(`nonce="${NONCE}"`, `nonce="${nonce}"`), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS, "content-security-policy": csp(nonce, extra) },
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

/** Só o script da própria página (com o nonce); a foto e o vídeo de origem escolhidos aparecem de blob:. */
type CspExtra = { img?: string; connect?: string; frame?: string };

/** O canvas desenha as miniaturas e a onda do som em data: e lê a onda de um arquivo escolhido (blob:). */
const CANVAS_CSP: CspExtra = { img: "data:", connect: "blob:", frame: "'self'" };

/** O endereço muda com a página: guardada pelo navegador, a versão velha nunca fica. */
const ANIMACAO_SRC = `/canvas/animacao?v=${[...CANVAS_ANIMACAO].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0}`;

/**
 * A animação em código na prévia do canvas (src/canvas/animacao.html): roda o código do agente
 * num iframe com sandbox, sem a origem do site. Por isso a página não pede nada à rede além das
 * fontes, e só o canvas a põe num quadro.
 */
function animationFrame(): Response {
  return new Response(CANVAS_ANIMACAO, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=86400",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": [
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src data: blob:",
        "form-action 'none'",
        "frame-ancestors 'self'",
        "base-uri 'none'",
      ].join("; "),
    },
  });
}

function csp(nonce: string, extra: CspExtra = {}): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `img-src 'self' blob:${extra.img ? ` ${extra.img}` : ""}`,
    "media-src 'self' blob:",
    // A prévia da edição rápida baixa o vídeo para achar os silêncios.
    `connect-src 'self'${extra.connect ? ` ${extra.connect}` : ""}`,
    // O canvas põe a animação em código num quadro isolado (animationFrame).
    ...(extra.frame ? [`frame-src ${extra.frame}`] : []),
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
