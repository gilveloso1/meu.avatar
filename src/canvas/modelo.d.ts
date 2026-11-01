/** O pedaço do modelo do canvas que o Worker usa (src/exportar.ts, src/comandos.ts). */
export interface ExportItem { tipo: "video" | "imagem" | "audio"; camada: string; src: string; entra: number; dura: number; corte: number; volume: number }
export interface ExportWork {
  largura: number;
  altura: number;
  trechos: { duracao: number; itens: ExportItem[] }[];
  versoes: { nome: string; trechos: number[] }[];
}
export interface Block { id: string; kind: "video" | "image" | "audio"; name: string; src: string; dur: number; tin: number; tout: number; x: number; y: number; mute: boolean; vol: number; tone: number; audio?: string; speed?: number; frame?: Frame }
export interface FrameKey { t: number; z: number; x: number; y: number }
export interface Frame { fit?: "cover" | "contain" | "blur"; flipH?: boolean; flipV?: boolean; rotate?: number; crop?: { l: number; t: number; r: number; b: number }; keys?: FrameKey[] }
export interface CanvasFinal { id: string; x: number; y: number; resolution?: string; format?: string; speed?: number }
export interface CanvasEdge { id: string; from: string; to: string }
export interface CanvasProject { blocks: Block[]; finals: CanvasFinal[]; edges: CanvasEdge[]; names?: Record<string, string> }
export interface Group { id: string; x: number; y: number; dur: number; bottom: number; label: string; blocks: Block[]; covers: Block[]; audios: Block[] }

export const MAX_VERSOES: number;
export const IMAGE_MAX: number;
export const PX: number;
export const MIN_LEN: number;
export const SPEED_MIN: number;
export const SPEED_MAX: number;
export const VIS_H: number;
export const RESOLUTIONS: string[];
export const FORMATS: { value: string }[];
export function exportWork(project: unknown, finalId: string, pick?: number[]): ExportWork | null;
export function groups(project: CanvasProject): Group[];
export function groupIndex(gs: Group[]): Map<string, Group>;
export function members(g: Group): Block[];
export function baseGaps(g: Group): number[][];
export function versions(project: CanvasProject, finalId: string): Group[][];
export function versionName(i: number): string;
export function output(final: CanvasFinal): { resolution: string; format: string; width: number; height: number };
export function width(b: Block): number;
export function finalRate(final?: CanvasFinal): number;
export function split(project: CanvasProject, id: string, at: number): { project: CanvasProject; id: string };
export function relay(before: CanvasProject, after: CanvasProject, order: string[], x0: number, y: number): CanvasProject;
export function height(b: Block): number;
export function upgrade(project: CanvasProject): CanvasProject;
export function arrange(project: CanvasProject): CanvasProject;
export function linkFirst(project: CanvasProject, b: Block): boolean;
export function linkProblem(project: CanvasProject, from: string, to: string): string | null;
export function newId(prefix: string): string;
export function nextTone(project: CanvasProject, kind: string, src: string): number;
export function removeItems(project: CanvasProject, ids: string[]): CanvasProject;
export function snap(project: CanvasProject, id: string, x: number, y: number, tol: number, keep?: { group?: string }): { x: number; y: number; mode: string | null };
export function dropBlock(project: CanvasProject, id: string, s: { x: number; y: number }): CanvasProject;
