/**
 * Duração de um MP3 lida do primeiro quadro, sem decodificar nada: pula a etiqueta ID3, lê o
 * cabeçalho do quadro (versão, taxa de bits e de amostragem) e usa o cabeçalho Xing/Info, quando
 * há, com o número de quadros; sem ele, o arquivo é de taxa constante (o dos modelos de fala).
 */

const BITRATES: Record<string, number[]> = {
  // Kbit/s por índice, Layer III: MPEG-1 e MPEG-2/2.5.
  "1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Segundos do áudio, ou null se não for um MP3 que dê para ler. */
export function mp3Duration(bytes: ArrayBuffer): number | null {
  const b = new Uint8Array(bytes);
  let at = 0;
  // ID3v2: "ID3", versão (2), flags (1) e o tamanho em 4 bytes de 7 bits.
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) at = 10 + (((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f));
  for (; at + 4 <= b.length; at++) {
    if (b[at] !== 0xff || (b[at + 1]! & 0xe0) !== 0xe0) continue;
    const version = (b[at + 1]! >> 3) & 3, layer = (b[at + 1]! >> 1) & 3;
    const rateIndex = b[at + 2]! >> 4, srIndex = (b[at + 2]! >> 2) & 3;
    // Só Layer III (1), versão válida e índices válidos.
    if (version === 1 || layer !== 1 || rateIndex === 0 || rateIndex === 15 || srIndex === 3) continue;
    const kbps = BITRATES[version === 3 ? "1" : "2"]![rateIndex]!;
    const sampleRate = SAMPLE_RATES[version]![srIndex]!;
    const samplesPerFrame = version === 3 ? 1152 : 576;
    const mono = b[at + 3]! >> 6 === 3;
    // O Xing/Info fica logo depois dos dados laterais do primeiro quadro.
    const side = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
    const tag = at + 4 + side;
    const name = String.fromCharCode(...b.subarray(tag, tag + 4));
    if ((name === "Xing" || name === "Info") && tag + 12 <= b.length && b[tag + 7]! & 1) {
      const frames = new DataView(bytes).getUint32(tag + 8);
      if (frames > 0) return (frames * samplesPerFrame) / sampleRate;
    }
    return ((b.length - at) * 8) / (kbps * 1000);
  }
  return null;
}
