/** O pedaço do modelo do canvas que o Worker usa (src/exportar.ts). */
export interface ExportItem { tipo: "video" | "imagem" | "audio"; camada: string; src: string; entra: number; dura: number; corte: number; volume: number }
export interface ExportWork {
  largura: number;
  altura: number;
  trechos: { duracao: number; itens: ExportItem[] }[];
  versoes: { nome: string; trechos: number[] }[];
}
export function exportWork(project: unknown, finalId: string, pick?: number[]): ExportWork | null;
