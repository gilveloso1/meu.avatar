// Catálogo das vozes oficiais do Fish Audio: as da conta "Fish Official", criadas pela própria empresa
// (não são clones de pessoas, como boa parte da biblioteca aberta). Pela API pública do Fish
// (GET https://api.fish.audio/model, sem chave); a fala sai pelo OpenRouter (src/structures/voz.ts),
// com o id da voz como `voice`. Só usa fetch: roda no Worker.

export const FISH_API = "https://api.fish.audio";
/** A conta "Fish Official" na biblioteca do Fish. */
export const FISH_OFFICIAL = "d8b0991f96b44e489422ca2ddf0bd31d";
/** As línguas que o site oferece, na ordem do menu. */
const LANGUAGES = ["pt", "en", "es"] as const;
/** Teto de páginas por língua (100 vozes por página). */
const MAX_PAGES = 5;

/** Uma voz oficial, já com o idioma na língua de quem usa ("Português (Brasil)"). */
export interface FishVoice {
  id: string;
  name: string;
  gender: "female" | "male" | "";
  language: string;
}

/** O que o resto do projeto usa do Fish; os testes trocam por um falso. */
export interface FishApi {
  voices(): Promise<FishVoice[]>;
  /** A amostra que o Fish guarda da voz; null se ela não tem. */
  sample(id: string): Promise<{ bytes: ArrayBuffer; type: string } | null>;
}

interface FishModel {
  _id: string;
  title: string;
  tags?: string[];
  description?: string | null;
  samples?: { audio?: string | null }[];
}

/**
 * O idioma de uma voz: o português se divide pelo sotaque (a marcação "pt-br" ou "pt-pt" e, sem ela,
 * a descrição: "atendimento" e "Brazilian" são do Brasil); inglês e espanhol ficam inteiros.
 */
export function fishLanguage(language: (typeof LANGUAGES)[number], m: Pick<FishModel, "tags" | "description">): string {
  if (language === "en") return "Inglês";
  if (language === "es") return "Espanhol";
  const tags = (m.tags ?? []).map((t) => t.toLowerCase());
  const brazil = tags.includes("pt-br") || (!tags.includes("pt-pt") && /brazil|atendimento/i.test(m.description ?? ""));
  return brazil ? "Português (Brasil)" : "Português (Portugal)";
}

export class FishClient implements FishApi {
  constructor(private readonly base = FISH_API) {}

  async voices(): Promise<FishVoice[]> {
    const seen = new Set<string>();
    const out: FishVoice[] = [];
    for (const language of LANGUAGES) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const query = new URLSearchParams({ author_id: FISH_OFFICIAL, language, page_size: "100", page_number: String(page) });
        const res = await fetch(`${this.base}/model?${query}`);
        if (!res.ok) throw new Error(`O Fish respondeu HTTP ${res.status} ao listar as vozes (${language})`);
        const items = ((await res.json()) as { items?: FishModel[] }).items ?? [];
        for (const m of items) {
          // A mesma voz pode falar mais de uma língua: fica na primeira.
          if (seen.has(m._id)) continue;
          seen.add(m._id);
          const tags = (m.tags ?? []).map((t) => t.toLowerCase());
          out.push({ id: m._id, name: m.title.trim(), gender: tags.includes("female") ? "female" : tags.includes("male") ? "male" : "", language: fishLanguage(language, m) });
        }
        if (items.length < 100) break;
      }
    }
    return out;
  }

  async sample(id: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
    const res = await fetch(`${this.base}/model/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const url = ((await res.json()) as FishModel).samples?.find((s) => s.audio)?.audio;
    if (!url) return null;
    const audio = await fetch(url);
    if (!audio.ok) return null;
    return { bytes: await audio.arrayBuffer(), type: (audio.headers.get("content-type") ?? "audio/mpeg").split(";")[0]!.trim() };
  }
}
