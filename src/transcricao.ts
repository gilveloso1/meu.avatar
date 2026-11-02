/**
 * A fala de um arquivo com o tempo de cada palavra (docs/api.md), para o agente editar pelo
 * texto. Quem transcreve é o Whisper do Workers AI (whisper-large-v3-turbo, US$ 0,0005 por
 * minuto de áudio); o áudio sai do contêiner de exportação, em MP3 mono de 16 kHz.
 */

/** Uma palavra e onde ela está no arquivo, em segundos. */
export interface Palavra {
  palavra: string;
  inicio: number;
  fim: number;
}

export interface Transcricao {
  idioma: string | null;
  duracao: number | null;
  texto: string;
  palavras: Palavra[];
}

/** O que o site usa para transcrever; os testes trocam por um falso. */
export interface Transcriber {
  transcribe(mp3: Uint8Array): Promise<Transcricao>;
}

/** O áudio passou do que se manda numa chamada só (MAX_AUDIO_BYTES, src/exportar.ts). */
export class AudioLongoError extends Error {}

const MODELO = "@cf/openai/whisper-large-v3-turbo";

interface WhisperWord {
  word?: string;
  start?: number;
  end?: number;
}

interface WhisperOutput {
  text?: string;
  transcription_info?: { language?: string; duration?: number };
  segments?: { words?: WhisperWord[] }[];
  words?: WhisperWord[];
}

const centesimos = (v: number) => Math.round(v * 100) / 100;

export class WorkersAiTranscriber implements Transcriber {
  constructor(private readonly ai: Ai) {}

  async transcribe(mp3: Uint8Array): Promise<Transcricao> {
    const out = (await this.ai.run(MODELO as Parameters<Ai["run"]>[0], { audio: base64(mp3) } as never)) as WhisperOutput;
    return normalizar(out);
  }
}

/** A resposta do Whisper no formato da API: palavras sem espaço em volta e tempos em centésimos. */
export function normalizar(out: WhisperOutput): Transcricao {
  const brutas = out.segments?.flatMap((s) => s.words ?? []) ?? out.words ?? [];
  const palavras = brutas
    .filter((w) => typeof w.word === "string" && w.word.trim() && typeof w.start === "number" && typeof w.end === "number")
    .map((w) => ({ palavra: w.word!.trim(), inicio: centesimos(w.start!), fim: centesimos(Math.max(w.end!, w.start!)) }));
  const duracao = out.transcription_info?.duration;
  return {
    idioma: out.transcription_info?.language ?? null,
    duracao: typeof duracao === "number" ? centesimos(duracao) : null,
    texto: (out.text ?? palavras.map((p) => p.palavra).join(" ")).trim(),
    palavras,
  };
}

/** Em pedaços: String.fromCharCode com o arquivo inteiro estoura a pilha. */
function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
