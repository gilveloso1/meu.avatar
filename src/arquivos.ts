/**
 * Os arquivos que o site aceita e como todo arquivo sai num download. Um lugar só, para que vídeo,
 * imagem gerada, ativo do avatar e exportação sejam baixados do mesmo jeito: com o nome que a
 * pessoa vê na tela (acentos e espaços incluídos) e a extensão do tipo real do arquivo.
 */
import type { AssetKind, Video } from "./db";

/**
 * Os tipos aceitos no envio (ativos, projetos, MCP), com o tipo de ativo e a extensão de cada um.
 * Lista fechada, nunca qualquer image/*: SVG e HTML levam script e são servidos pelo endereço do site.
 */
export const MEDIA_TYPES: Record<string, { kind: AssetKind; ext: string }> = {
  "image/jpeg": { kind: "imagem", ext: "jpg" },
  "image/png": { kind: "imagem", ext: "png" },
  "image/webp": { kind: "imagem", ext: "webp" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "video/webm": { kind: "video", ext: "webm" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/x-wav": { kind: "audio", ext: "wav" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/x-m4a": { kind: "audio", ext: "m4a" },
  "audio/ogg": { kind: "audio", ext: "ogg" },
};

/** O tipo aceito (sem parâmetros, em minúsculas), ou null se não está na lista. */
export function mediaType(type: string): { kind: AssetKind; ext: string } | null {
  return MEDIA_TYPES[type.split(";")[0]!.trim().toLowerCase()] ?? null;
}

/** O tipo (mime) de uma chave do R2 pela extensão dela, como "imagens/<id>.png". */
export function mimeOf(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  return Object.keys(MEDIA_TYPES).find((t) => MEDIA_TYPES[t]!.ext === ext) ?? (ext === "jpeg" ? "image/jpeg" : "application/octet-stream");
}

const EXTENSOES = new Set([...Object.values(MEDIA_TYPES).map((t) => t.ext), "jpeg"]);
// Os caracteres que algum sistema não aceita em nome de arquivo (Windows, macOS, Linux).
const PROIBIDOS = /[\u0000-\u001f\u007f"*/:<>?\\|]+/g;

/**
 * O nome do arquivo baixado: o nome dado, sem mudança, e a extensão do tipo. Só saem os caracteres
 * proibidos em nome de arquivo e uma extensão que o nome já trouxesse (o nome de um envio, como
 * "foto.png", não vira "foto.png.png"). Sem tipo conhecido, vale a extensão da chave no R2.
 */
export function downloadName(nome: string, type: string, key = ""): string {
  const ext = mediaType(type)?.ext ?? /\.([a-z0-9]{2,4})$/i.exec(key)?.[1]?.toLowerCase() ?? "";
  let base = nome.replace(PROIBIDOS, "-").replace(/\s+/g, " ").trim();
  const dela = /\.([a-z0-9]{2,4})$/i.exec(base)?.[1]?.toLowerCase();
  if (dela && EXTENSOES.has(dela)) base = base.slice(0, -dela.length - 1).trim();
  base = base.replace(/^\.+/, "").slice(0, 120).trim() || "Meu Avatar";
  return ext ? `${base}.${ext}` : base;
}

/** O nome do vídeo (ou imagem) gerado no download: o que a pessoa deu ou, sem nome, um do site. */
export function videoFileName(v: Pick<Video, "id" | "name">): string {
  return v.name ?? `Meu Avatar ${v.id.slice(0, 8)}`;
}

/** O cabeçalho do download: o nome em UTF-8 (RFC 6266) e uma cópia sem acentos para quem não lê o UTF-8. */
export function contentDisposition(nome: string): string {
  const ascii = nome.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
