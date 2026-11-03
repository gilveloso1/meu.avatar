/**
 * Se um vídeo tem faixa de som, lido do cabeçalho, sem decodificar nada. O vídeo sem som (o WebM
 * transparente do render, uma legenda, uma animação) entra no canvas sem a camada de áudio.
 */
import { findBox } from "./mp4";

/** Quanto do começo do arquivo basta: as faixas do WebM vêm antes do primeiro quadro. */
export const CABECALHO_BYTES = 256 * 1024;

/** true ou false quando o cabeçalho diz; null quando não dá para saber (o moov do MP4 no fim, outro formato). */
export function temSom(bytes: ArrayBuffer, type: string): boolean | null {
  if (type === "video/webm") return webmTemSom(new Uint8Array(bytes));
  if (type === "video/mp4" || type === "video/quicktime") return mp4TemSom(new DataView(bytes));
  return null;
}

/** WebM (Matroska): cada faixa diz o codec (elemento 0x86), e o de som começa com "A_", como A_OPUS. */
function webmTemSom(u: Uint8Array): boolean | null {
  if (u.length < 4 || u[0] !== 0x1a || u[1] !== 0x45 || u[2] !== 0xdf || u[3] !== 0xa3) return null;
  let viuCodec = false;
  for (let i = 4; i + 3 < u.length; i++) {
    // O primeiro Cluster (1F 43 B6 75) já é imagem: as faixas ficaram para trás.
    if (u[i] === 0x1f && u[i + 1] === 0x43 && u[i + 2] === 0xb6 && u[i + 3] === 0x75) return viuCodec ? false : null;
    // CodecID com tamanho de um byte (0x80 | n) e o texto do codec logo depois.
    if (u[i] === 0x86 && u[i + 1]! >= 0x82 && u[i + 1]! <= 0xa0) {
      const a = u[i + 2], b = u[i + 3];
      if (a === 0x41 && b === 0x5f) return true;
      if (a === 0x56 && b === 0x5f) viuCodec = true;
    }
  }
  return null;
}

/** MP4: cada trilha diz o que é no hdlr (moov > trak > mdia > hdlr); "soun" é som. */
function mp4TemSom(view: DataView): boolean | null {
  const moov = findBox(view, 0, view.byteLength, "moov");
  if (!moov) return null;
  let at = moov.start;
  for (let trak = findBox(view, at, moov.end, "trak"); trak; trak = findBox(view, at, moov.end, "trak")) {
    at = trak.end;
    const mdia = findBox(view, trak.start, trak.end, "mdia");
    const hdlr = mdia && findBox(view, mdia.start, mdia.end, "hdlr");
    // Versão e flags (4 bytes), pre_defined (4) e o tipo da trilha.
    if (hdlr && hdlr.start + 12 <= hdlr.end && String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + hdlr.start + 8, 4)) === "soun") return true;
  }
  return false;
}
