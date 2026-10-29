/**
 * Duração e tamanho do quadro de um MP4 ou MOV, lidos do cabeçalho do filme
 * (caixas moov > mvhd e moov > trak > tkhd), sem decodificar nada. O moov pode
 * vir no começo ou no fim do arquivo.
 */

/** Segundos do vídeo, ou null se o arquivo não tem o cabeçalho de um MP4/MOV. */
export function mp4Duration(bytes: ArrayBuffer): number | null {
  const view = new DataView(bytes);
  const moov = findBox(view, 0, view.byteLength, "moov");
  const mvhd = moov && findBox(view, moov.start, moov.end, "mvhd");
  if (!mvhd || mvhd.end - mvhd.start < 20) return null;
  const at = mvhd.start;
  const version = view.getUint8(at);
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (mvhd.end - at < 32) return null;
    timescale = view.getUint32(at + 20);
    duration = Number(view.getBigUint64(at + 24));
  } else {
    timescale = view.getUint32(at + 12);
    duration = view.getUint32(at + 16);
  }
  return timescale > 0 && duration > 0 ? duration / timescale : null;
}

/** Largura e altura do quadro: o tkhd da primeira trilha com imagem (a de áudio tem 0×0). */
export function mp4Size(bytes: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(bytes);
  const moov = findBox(view, 0, view.byteLength, "moov");
  if (!moov) return null;
  let at = moov.start;
  for (let trak = findBox(view, at, moov.end, "trak"); trak; trak = findBox(view, at, moov.end, "trak")) {
    at = trak.end;
    const tkhd = findBox(view, trak.start, trak.end, "tkhd");
    if (!tkhd) continue;
    // Largura e altura em ponto fixo 16.16, no fim do tkhd (versão 1: campos de tempo de 64 bits).
    const offset = tkhd.start + (view.getUint8(tkhd.start) === 1 ? 88 : 76);
    if (offset + 8 > tkhd.end) continue;
    const width = Math.round(view.getUint32(offset) / 65536);
    const height = Math.round(view.getUint32(offset + 4) / 65536);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

/** A primeira caixa `type` entre `from` e `to`: onde começa e termina o conteúdo dela. */
function findBox(view: DataView, from: number, to: number, type: string): { start: number; end: number } | null {
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) return null;
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) return null;
    const name = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7));
    if (name === type) return { start: at + header, end: at + size };
    at += size;
  }
  return null;
}
