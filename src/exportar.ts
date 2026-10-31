/**
 * Exportação dos projetos do canvas: o Worker lê o projeto salvo, monta o plano
 * com o mesmo modelo da tela (src/canvas/modelo.js) e o contêiner faz o trabalho
 * (container/exportar.py). Cada grupo vira um trecho, guardado no R2 pelo hash do
 * conteúdo: mudar um CTA só refaz o CTA. Cada versão é a emenda dos trechos.
 *
 * O trabalho anda um passo por vez (um trecho ou uma versão). Quem pede é a tela,
 * que chama o próximo passo assim que o anterior acaba (começa na hora); se ela
 * fechar, o agendamento termina. Um passo só roda uma vez por causa do claim do banco.
 */
import { Container, getContainer } from "@cloudflare/containers";
import { type ExportWork, exportWork, MAX_EXPORTAR } from "./canvas/modelo.js";
import type { Db, ExportRow, Project, Role } from "./db";
import { ERROS } from "./erros";
import { canUse, InputError, structureById } from "./structures";

/** Quanto os vídeos prontos ficam para baixar. Os trechos saem pela regra de ciclo de vida do R2. */
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
/** Um passo que ficou sem resposta (Worker caiu) pode ser retomado depois disso. */
const STALE_MS = 15 * 60 * 1000;
const MAX_TRIES = 3;
/** Quanto o agendamento trabalha por rodada. */
const CRON_BUDGET_MS = 45_000;
const START_TIMEOUT_MS = 120_000;

export class Exporter extends Container {
  defaultPort = 8080;
  // Curto: parado, o tipo grande ainda paga memória e disco.
  sleepAfter = "30s";
  enableInternet = false;
}

/** O que o site usa do contêiner; os testes trocam por um falso. */
export interface ExportApi {
  /** Devolve o trecho (corpo com content-length). */
  segment(job: string, body: ReadableStream, sizes: number[]): Promise<Response>;
  /** Devolve a versão emendada, com o CRC-32 em x-crc32. */
  join(job: string, body: ReadableStream, sizes: number[]): Promise<Response>;
}

export class ContainerExport implements ExportApi {
  constructor(private readonly ns: DurableObjectNamespace<Exporter>) {}

  segment(job: string, body: ReadableStream, sizes: number[]): Promise<Response> {
    return this.post("/trecho", job, body, sizes);
  }

  join(job: string, body: ReadableStream, sizes: number[]): Promise<Response> {
    return this.post("/emendar", job, body, sizes);
  }

  private async post(path: string, job: string, body: ReadableStream, sizes: number[]): Promise<Response> {
    // Duas instâncias; a mesma exportação fica sempre na mesma.
    const container = getContainer(this.ns, `exportar-${job.charCodeAt(0) % 2}`);
    await container.startAndWaitForPorts({ ports: 8080, cancellationOptions: { instanceGetTimeoutMS: START_TIMEOUT_MS, portReadyTimeoutMS: START_TIMEOUT_MS } });
    const size = sizes.reduce((a, b) => a + b, 0);
    const res = await container.fetch(new Request(`http://exportar${path}`, { method: "POST", body, headers: { "content-length": String(size), "x-tamanhos": sizes.join(",") } }));
    if (!res.ok) throw new Error(`Exportação falhou em ${path} (HTTP ${res.status}): ${(await res.text()).slice(-500)}`);
    if (!res.body || !res.headers.get("content-length")) throw new Error(`Exportação voltou sem o arquivo em ${path}.`);
    return res;
  }
}

/** O que fica em exports.plan. */
export interface ExportPlan {
  trechos: { chave: string; plano: string; arquivos: string[] }[];
  versoes: { nome: string; trechos: number[]; chave: string; tamanho?: number; crc?: number }[];
}

/** O que a tela recebe. */
export interface ExportState {
  id: string;
  status: string;
  feitos: number;
  total: number;
  erro: string | null;
  versoes: { nome: string; href: string }[];
  zip: string | null;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Nome do arquivo baixado: "01-gancho-1-corpo-cta-a.mp4", sem acento nem caractere estranho. */
export function fileName(index: number, nome: string): string {
  const slug = nome.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80);
  return `${String(index + 1).padStart(2, "0")}${slug ? `-${slug}` : ""}.mp4`;
}

export class Exports {
  constructor(
    private readonly db: Db,
    private readonly media: R2Bucket,
    private readonly api: ExportApi | null,
  ) {}

  /** Começa a exportação de um Final, sempre a partir do projeto salvo; os arquivos são conferidos aqui. */
  async start(project: Project, role: Role, finalId: string, pick?: number[], now = new Date()): Promise<ExportRow> {
    if (!this.api) throw new InputError(ERROS.exportarIndisponivel);
    let work: ExportWork | null = null;
    try {
      work = exportWork(JSON.parse(project.data), finalId, pick);
    } catch (err) {
      console.error("Projeto ilegível na exportação", project.id, err);
    }
    if (!work?.versoes.length) throw new InputError(ERROS.exportarSemVersao);
    if (work.versoes.length > MAX_EXPORTAR) throw new InputError(ERROS.exportarLimite(MAX_EXPORTAR));
    const id = crypto.randomUUID();
    const trechos: ExportPlan["trechos"] = [];
    for (const t of work.trechos) trechos.push(await this.segmentPlan(project, role, work.largura, work.altura, t));
    const versoes = work.versoes.map((v, i) => ({ ...v, chave: `exportacoes/${id}/${i}.mp4` }));
    const plan: ExportPlan = { trechos, versoes };
    return this.db.insertExport({ id, project_id: project.id, total: trechos.length + versoes.length, plan: JSON.stringify(plan), expires_at: new Date(now.getTime() + EXPORT_TTL_MS).toISOString() }, now);
  }

  /** O plano de um trecho, com os arquivos do R2 e a chave do que entra nele. */
  private async segmentPlan(project: Project, role: Role, largura: number, altura: number, t: ExportWork["trechos"][number]) {
    const arquivos: string[] = [];
    const itens = [];
    for (const { src, ...item } of t.itens) {
      const key = await this.source(project, role, src);
      if (!arquivos.includes(key)) arquivos.push(key);
      itens.push({ ...item, arquivo: arquivos.indexOf(key) });
    }
    const plano = JSON.stringify({ largura, altura, duracao: t.duracao, itens });
    const heads = await Promise.all(arquivos.map((k) => this.media.head(k)));
    if (heads.some((h) => !h)) throw new InputError(ERROS.exportarArquivo);
    // O etag entra na chave: se o arquivo mudar (áudio tratado de novo), o trecho é refeito.
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plano + heads.map((h) => h!.etag).join()));
    return { chave: `trechos/${hex(hash)}.mkv`, plano, arquivos };
  }

  /** O arquivo de um bloco no R2: só um vídeo que a pessoa pode usar ou um arquivo deste projeto. */
  private async source(project: Project, role: Role, src: unknown): Promise<string> {
    const path = typeof src === "string" ? src : "";
    const video = /^\/videos\/([0-9a-f-]{36})(?:\.(original|editado))?\.mp4$/.exec(path);
    if (video) {
      const v = await this.db.videoById(video[1]!);
      const structure = v && structureById(v.structure);
      const key = video[2] === "original" ? v?.video_key : video[2] === "editado" ? v?.edited_key : (v?.processed_key ?? v?.video_key);
      if (key && structure && canUse(structure, role)) return key;
    }
    const file = /^\/projetos\/([0-9a-f-]{36})\/arquivos\/([0-9a-f-]{36})$/.exec(path);
    if (file?.[1] === project.id) {
      const f = await this.db.projectFile(project.id, file[2]!);
      if (f) return f.key;
    }
    throw new InputError(ERROS.exportarArquivo);
  }

  /** Faz o próximo passo. Se outro pedido já está nele, só devolve como está. */
  async advance(id: string, now = new Date()): Promise<ExportRow | null> {
    const row = await this.db.claimExport(id, new Date(now.getTime() - STALE_MS).toISOString(), now);
    if (!row) return this.db.exportById(id);
    const plan = JSON.parse(row.plan) as ExportPlan;
    try {
      let step = row.step;
      // O que já está pronto no R2 (de outra exportação) não conta como passo.
      while (step < plan.trechos.length && (await this.media.head(plan.trechos[step]!.chave))) step++;
      if (step < plan.trechos.length) await this.segment(id, plan.trechos[step]!);
      else if (step - plan.trechos.length < plan.versoes.length) await this.version(id, plan, step - plan.trechos.length);
      const next = Math.min(step + 1, row.total);
      return this.db.finishStep(id, next, next >= row.total ? "done" : "running", JSON.stringify(plan));
    } catch (err) {
      console.error("Falha na exportação", id, row.step, err);
      const failed = row.tries >= MAX_TRIES;
      return this.db.failStep(id, failed ? "failed" : "running", failed ? String(err).slice(0, 1000) : null);
    }
  }

  private async segment(id: string, t: ExportPlan["trechos"][number]): Promise<void> {
    const plano = new TextEncoder().encode(t.plano);
    const sizes = [plano.byteLength, ...(await this.sizes(t.arquivos))];
    const res = await this.pipe(sizes, t.arquivos, plano, (body) => this.api!.segment(id, body, sizes));
    await this.keep(res, t.chave, "video/x-matroska");
  }

  private async version(id: string, plan: ExportPlan, index: number): Promise<void> {
    const v = plan.versoes[index]!;
    const keys = v.trechos.map((i) => plan.trechos[i]!.chave);
    const sizes = await this.sizes(keys);
    const res = await this.pipe(sizes, keys, null, (body) => this.api!.join(id, body, sizes));
    v.crc = Number(res.headers.get("x-crc32"));
    v.tamanho = Number(res.headers.get("content-length"));
    await this.keep(res, v.chave, "video/mp4");
  }

  private async sizes(keys: string[]): Promise<number[]> {
    const heads = await Promise.all(keys.map((k) => this.media.head(k)));
    return heads.map((h, i) => {
      if (!h) throw new Error(`Não está no R2: ${keys[i]}`);
      return h.size;
    });
  }

  /** Manda os arquivos emendados num corpo só, sem carregar na memória do Worker. */
  private async pipe(sizes: number[], keys: string[], first: Uint8Array | null, run: (body: ReadableStream) => Promise<Response>): Promise<Response> {
    const { readable, writable } = new FixedLengthStream(sizes.reduce((a, b) => a + b, 0));
    const piping = (async () => {
      if (first) {
        const writer = writable.getWriter();
        await writer.write(first);
        writer.releaseLock();
      }
      for (const key of keys) {
        const object = await this.media.get(key);
        if (!object) throw new Error(`Não está no R2: ${key}`);
        await object.body.pipeTo(writable, { preventClose: true });
      }
      await writable.close();
    })();
    // Se o contêiner falhar, o erro que vale é o dele.
    piping.catch(() => {});
    const res = await run(readable);
    await piping;
    return res;
  }

  private async keep(res: Response, key: string, contentType: string): Promise<void> {
    const stream = new FixedLengthStream(Number(res.headers.get("content-length")));
    await Promise.all([res.body!.pipeTo(stream.writable), this.media.put(key, stream.readable, { httpMetadata: { contentType } })]);
  }

  /** Termina, aos poucos, o que a tela deixou pela metade. */
  async next(): Promise<void> {
    const end = Date.now() + CRON_BUDGET_MS;
    const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
    for (const id of await this.db.openExports(staleBefore)) {
      for (let row = await this.advance(id); row?.status === "running" && row.claimed_at === null && Date.now() < end; row = await this.advance(id));
      if (Date.now() >= end) return;
    }
  }

  state(project: Project, row: ExportRow, now = new Date()): ExportState {
    const plan = JSON.parse(row.plan) as ExportPlan;
    const base = `/projetos/${project.id}/exportacoes/${row.id}`;
    const ready = row.status === "done" && row.expires_at > now.toISOString();
    return {
      id: row.id,
      status: row.status === "done" && !ready ? "expired" : row.status,
      feitos: row.step,
      total: row.total,
      erro: row.status === "failed" ? ERROS.exportarFalhou : null,
      versoes: ready ? plan.versoes.map((v, i) => ({ nome: v.nome, href: `${base}/${i}.mp4` })) : [],
      zip: ready && plan.versoes.length > 1 ? `${base}/todas.zip` : null,
    };
  }

  /** Todas as versões num ZIP sem compressão (vídeo não comprime), montado em fluxo aqui mesmo. */
  zip(plan: ExportPlan): Response {
    const files = plan.versoes.map((v, i) => ({ key: v.chave, size: v.tamanho!, crc: v.crc!, name: new TextEncoder().encode(fileName(i, v.nome)) }));
    let total = 22;
    for (const f of files) total += 30 + 46 + 2 * f.name.byteLength + f.size;
    const { readable, writable } = new FixedLengthStream(total);
    const pump = async () => {
      const central: Uint8Array[] = [];
      let offset = 0;
      for (const f of files) {
        const object = await this.media.get(f.key);
        if (!object) throw new Error(`Não está no R2: ${f.key}`);
        const writer = writable.getWriter();
        await writer.write(zipHeader(0x04034b50, f, 0));
        await writer.write(f.name);
        writer.releaseLock();
        await object.body.pipeTo(writable, { preventClose: true });
        const entry = zipHeader(0x02014b50, f, offset);
        const named = new Uint8Array(entry.byteLength + f.name.byteLength);
        named.set(entry);
        named.set(f.name, entry.byteLength);
        central.push(named);
        offset += 30 + f.name.byteLength + f.size;
      }
      const writer = writable.getWriter();
      let size = 0;
      for (const c of central) {
        await writer.write(c);
        size += c.byteLength;
      }
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, files.length, true);
      end.setUint16(10, files.length, true);
      end.setUint32(12, size, true);
      end.setUint32(16, offset, true);
      await writer.write(new Uint8Array(end.buffer));
      await writer.close();
    };
    pump().catch((err) => {
      console.error("Falha ao montar o ZIP", err);
      void writable.abort(err).catch(() => {});
    });
    return new Response(readable, { headers: { "content-type": "application/zip", "content-length": String(total), "content-disposition": 'attachment; filename="meu-avatar-videos.zip"', "cache-control": "private, no-store" } });
  }
}

/** Cabeçalho local (30 bytes) ou central (46 bytes) de um arquivo sem compressão, com o nome em UTF-8. */
function zipHeader(signature: number, f: { size: number; crc: number; name: Uint8Array }, offset: number): Uint8Array {
  const local = signature === 0x04034b50;
  const view = new DataView(new ArrayBuffer(local ? 30 : 46));
  const at = local ? 4 : 6; // o central tem a "versão que criou" a mais
  view.setUint32(0, signature, true);
  if (!local) view.setUint16(4, 20, true);
  view.setUint16(at, 20, true);
  view.setUint16(at + 2, 0x0800, true);
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, 33, true); // 01/01/1980
  view.setUint32(at + 10, f.crc, true);
  view.setUint32(at + 14, f.size, true);
  view.setUint32(at + 18, f.size, true);
  view.setUint16(at + 22, f.name.byteLength, true);
  if (!local) view.setUint32(42, offset, true);
  return new Uint8Array(view.buffer);
}
