/**
 * Os ativos enviados a um avatar: um lugar só para o site (Salvar e Enviar arquivo, src/site/site.ts)
 * e para o agente (API e MCP, src/api.ts), com a mesma conferência de tipo e tamanho.
 *
 * O agente não consegue mandar o arquivo em base64 na mensagem do MCP. Por isso, além do envio com
 * o token (POST /api/v1/avatares/<id>/arquivos), há o link de envio: o agente pede o link pelo MCP e
 * manda o arquivo do computador com um curl, sem o token. O link é seguro por desenho:
 * - só nasce de quem tem o token da API (e a permissão usar:api);
 * - o código tem 256 bits e só o hash dele fica guardado (no R2, em envios/);
 * - vale por 30 min e uma tentativa só (some no primeiro uso, dê certo ou não);
 * - aceita um arquivo, para aquele avatar (ou aquele projeto) daquela conta, conferidos de novo na
 *   hora do envio;
 * - só os tipos da lista fechada (MEDIA_TYPES) e até o tamanho máximo; um formulário de outro site
 *   não consegue mandar esses tipos, e a resposta não tem CORS.
 */
import { mediaType } from "./arquivos";
import { sha256 } from "./auth";
import type { AssetKind, Avatar, Db, Project } from "./db";
import { pode } from "./permissoes";
import { temSom } from "./som";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "./studio";

/** O teto da descrição do avatar (o painel do site e a API). */
export const MAX_AVATAR_DESCRIPTION = 500;
/** Por quanto tempo o link de envio vale. */
export const ENVIO_MS = 30 * 60_000;
/** O link de envio: /envio/<código>, 64 caracteres hexadecimais. */
export const ENVIO_PATH = /^\/envio\/([0-9a-f]{64})$/;

/** O papel do ativo no avatar: a foto principal ou a gravação da voz para clonagem. */
export type Uso = "" | "foto" | "voz";
const USOS: Record<Exclude<Uso, "">, AssetKind> = { foto: "imagem", voz: "audio" };

export const MAX_ATIVO = (kind: AssetKind) => (kind === "imagem" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES);

/** Guarda o arquivo no R2 como ativo do avatar e devolve o id. */
export async function guardarAtivo(db: Db, media: R2Bucket, avatarId: string, file: { bytes: ArrayBuffer; type: string; name: string }, kind: AssetKind, folderId: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  const key = `avatares-ativos/${avatarId}/${id}`;
  await media.put(key, file.bytes, { httpMetadata: { contentType: file.type } });
  await db.insertAsset({ id, avatar_id: avatarId, kind, key, name: file.name.slice(0, 200) || "arquivo", type: file.type, size: file.bytes.byteLength, source_video: null, folder_id: folderId });
  return id;
}

/** O uso pedido, ou null se não existe. */
export function uso(valor: unknown): Uso | null {
  const v = typeof valor === "string" ? valor : "";
  return v === "" || v in USOS ? (v as Uso) : null;
}

/** Erro do envio, no molde das respostas da API (o código e, às vezes, o que vale). */
export type FalhaEnvio = { status: number; erro: string; extra?: Record<string, unknown> };

/**
 * Confere e guarda um arquivo enviado ao avatar; com uso, ele vira a foto principal ou a voz.
 * Devolve o id do ativo, ou a falha (tipo fora da lista, vazio, grande demais, uso que não combina).
 */
export async function receberAtivo(db: Db, media: R2Bucket, avatar: Avatar, file: { bytes: ArrayBuffer; type: string; name: string }, papel: Uso, folderId: string | null = null): Promise<string | FalhaEnvio> {
  const tipo = mediaType(file.type);
  if (!tipo) return { status: 415, erro: "tipo_invalido" };
  if (!file.bytes.byteLength) return { status: 400, erro: "arquivo_vazio" };
  if (file.bytes.byteLength > MAX_ATIVO(tipo.kind)) return { status: 413, erro: "arquivo_grande_demais", extra: { maximo: MAX_ATIVO(tipo.kind) } };
  if (papel && USOS[papel] !== tipo.kind) return { status: 400, erro: "uso_invalido", extra: { foto: "imagem", voz: "audio" } };
  const id = await guardarAtivo(db, media, avatar.id, { ...file, type: file.type.split(";")[0]!.trim().toLowerCase() }, tipo.kind, folderId);
  if (papel) await db.updateAvatar(avatar.id, { name: avatar.name, description: avatar.description, photo_asset: papel === "foto" ? id : avatar.photo_asset, voice_asset: papel === "voz" ? id : avatar.voice_asset });
  return id;
}

const chaveEnvio = async (codigo: string) => `envios/${await sha256(codigo)}`;

/** Para onde o arquivo do link vai: os ativos de um avatar (numa pasta dele, se pedida) ou os arquivos de um projeto. */
export type Destino = { avatar: string; pasta?: string | null } | { projeto: string };
/** Guarda o arquivo no projeto (Exports.saveFile): quem recebe o link passa, para o envio não depender da exportação. */
export type SalvarNoProjeto = (projectId: string, name: string, type: string, bytes: ArrayBuffer) => Promise<{ id: string }>;

/** Cria o link de envio de um arquivo para o avatar ou o projeto; devolve o código (vai no endereço) e quando vence. */
export async function criarEnvio(media: R2Bucket, userId: number, destino: Destino | string, nome: string, papel: Uso, agora = Date.now()): Promise<{ codigo: string; expira: string }> {
  const para: Destino = typeof destino === "string" ? { avatar: destino } : destino;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const codigo = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expira = new Date(agora + ENVIO_MS).toISOString();
  const onde: Record<string, string> = "projeto" in para ? { projeto: para.projeto } : { avatar: para.avatar, ...(para.pasta ? { pasta: para.pasta } : {}) };
  await media.put(await chaveEnvio(codigo), "", { customMetadata: { user: String(userId), ...onde, nome: nome.slice(0, 200), uso: papel, expira } });
  return { codigo, expira };
}

/**
 * Recebe o arquivo pelo link de envio, sem token. O link some na primeira tentativa; vencido, de
 * outra conta, de conta suspensa ou de avatar (ou projeto) apagado, a resposta é a mesma: não
 * encontrado. O link de um projeto só guarda o arquivo nele, com a mesma conferência de tipo e
 * tamanho; a pasta do avatar que foi apagada depois não segura o envio (o ativo fica fora de pasta).
 */
export async function usarEnvio(db: Db, media: R2Bucket, codigo: string, request: Request, salvar: SalvarNoProjeto | null = null, agora = Date.now()): Promise<{ avatar: Avatar; id: string } | { projeto: Project; id: string; som?: boolean | null } | FalhaEnvio> {
  const chave = await chaveEnvio(codigo);
  const ticket = await media.head(chave);
  if (!ticket) return { status: 404, erro: "envio_invalido" };
  await media.delete(chave);
  const m = ticket.customMetadata ?? {};
  const user = await db.userById(Number(m.user));
  const avatar = m.avatar ? await db.avatarById(m.avatar) : null;
  const projeto = m.projeto ? await db.projectById(m.projeto) : null;
  const dono = (avatar && avatar.user_id === user?.id) || (projeto && projeto.user_id === user?.id && salvar);
  if (!(Date.parse(m.expira ?? "") > agora) || !user || pode(user, "suspensa") || !pode(user, "usar:api") || !dono) return { status: 404, erro: "envio_invalido" };
  const type = request.headers.get("content-type") ?? "";
  const tipo = mediaType(type);
  // Antes de ler o corpo: o tamanho declarado já diz se passa do limite.
  if (tipo && Number(request.headers.get("content-length")) > MAX_ATIVO(tipo.kind)) return { status: 413, erro: "arquivo_grande_demais", extra: { maximo: MAX_ATIVO(tipo.kind) } };
  const bytes = tipo ? await request.arrayBuffer() : new ArrayBuffer(0);
  if (projeto && salvar) {
    if (!tipo) return { status: 415, erro: "tipo_invalido" };
    if (!bytes.byteLength) return { status: 400, erro: "arquivo_vazio" };
    if (bytes.byteLength > MAX_ATIVO(tipo.kind)) return { status: 413, erro: "arquivo_grande_demais", extra: { maximo: MAX_ATIVO(tipo.kind) } };
    const limpo = type.split(";")[0]!.trim().toLowerCase();
    const { id } = await salvar(projeto.id, (m.nome ?? "").slice(0, 200) || "arquivo", limpo, bytes);
    return { projeto, id, ...(tipo.kind === "video" ? { som: temSom(bytes, limpo) } : {}) };
  }
  const pasta = m.pasta ? ((await db.folders(avatar!.id)).find((f) => f.id === m.pasta)?.id ?? null) : null;
  const id = await receberAtivo(db, media, avatar!, { bytes, type, name: m.nome ?? "" }, uso(m.uso) ?? "", pasta);
  return typeof id === "string" ? { avatar: avatar!, id } : id;
}
