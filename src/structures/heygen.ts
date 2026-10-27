/**
 * HeyGen Avatar IV (heygen/avatar-iv): anima a foto falando o texto com uma
 * voz pronta da HeyGen (texto para fala), em vez de gerar a voz junto com o
 * vídeo. A duração segue a fala; o preço é por segundo de vídeo.
 *
 * Pedido pelo OpenRouter (conferido em 25/10/2026): a fala vai em `prompt`, a
 * foto em `input_references` e as opções da HeyGen em
 * `provider.options.heygen` (voice_id, expressiveness, motion_prompt). Sem
 * voice_id o OpenRouter recusa o pedido e lista as vozes abaixo, as únicas que
 * ele mostra sem uma chave da HeyGen. Nenhuma é só de português; as
 * multilíngues falam português.
 */
import type { VideoModel } from "../openrouter";
import { WORDS_PER_SECOND } from "../prompt";
import { InputError, type Option, type Structure } from "./types";
import { options } from "./wan";

export const MAX_SCRIPT = 1500;
export const MAX_MOTION = 500;

export const VOICES: Option[] = [
  { value: "80441555167a467e967ab9487d844a30", label: "Kore · feminina · multilíngue" },
  { value: "3097f9a8fd3b4340b6bbe913177b378f", label: "Orus · masculina · multilíngue" },
  { value: "16a09e4706f74997ba4ed05ea11470f6", label: "Cassidy · feminina · inglês" },
  { value: "6be73833ef9a4eb0aeee399b8fe9d62b", label: "Andrew · masculina · inglês" },
  { value: "246cdbf530954380a62109f3107fce0d", label: "Amelia · feminina · espanhol" },
  { value: "707365599f8545d5b6ce7a32a20e9c93", label: "Antonio · masculina · espanhol" },
];

/** Energia dos movimentos de cabeça e rosto. A HeyGen usa "low" se nada for pedido. */
export const EXPRESSIVENESS: Option[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
];

/**
 * O prompt de sistema desta estrutura: a orientação de movimento que vai em
 * todo vídeo (o mesmo jeito do estilo "Selfie" do Wan: olhar fixo, gestos
 * contidos). O movimento escrito no formulário entra depois dela.
 */
export const MOTION_GUIDE =
  "Talks straight to the camera and keeps looking into the lens. Subtle, natural head movement and blinking, relaxed shoulders, small calm hand gestures.";

export const HEYGEN_AVATAR: Structure = {
  id: "heygen",
  name: "HeyGen Avatar IV",
  model: "heygen/avatar-iv",
  summary: "Anima a foto falando o texto com uma voz pronta da HeyGen. A duração segue a fala.",
  icon: "record_voice_over",
  access: "admin",
  // A voz vem pronta do texto para fala: sem o chiado do Wan, não passa pelo contêiner.
  treatAudio: false,
  quickEdit: true,
  wordsPerSecond: WORDS_PER_SECOND,
  cost: { sku: "duration_seconds", seconds: { speech: "fala" } },

  sections(model: VideoModel | null, d) {
    const resolutions = model?.supported_resolutions ?? ["720p"];
    const ratios = model?.supported_aspect_ratios ?? [d.aspectRatio];
    return [
      {
        title: "Fala",
        fields: [
          {
            kind: "textarea",
            name: "fala",
            label: "Fala",
            maxLength: MAX_SCRIPT,
            placeholder: "O texto que a voz lê. Ex.: Oi, gente! Hoje eu vou mostrar…",
            supporting: "O texto que a voz lê. A duração do vídeo segue a fala.",
            speech: true,
          },
          { kind: "select", name: "voz", label: "Voz", options: VOICES, value: VOICES[0]!.value, supporting: "Para português, use uma voz multilíngue." },
        ],
      },
      {
        title: "Avatar",
        fields: [
          { kind: "image", name: "imagem", label: "Foto do avatar", required: true, supporting: "Obrigatória. Rosto de frente, bem iluminado." },
          { kind: "segmented", name: "expressividade", label: "Expressividade", options: EXPRESSIVENESS, value: "low" },
          {
            kind: "text",
            name: "movimento",
            label: "Movimento",
            maxLength: MAX_MOTION,
            placeholder: "Ex.: aponta para a câmera no final",
            supporting: "Opcional: gestos e movimentos, além do olhar fixo e dos gestos contidos.",
          },
        ],
      },
      {
        title: "Vídeo",
        fields: [
          { kind: "segmented", name: "resolucao", label: "Resolução", options: options(resolutions), value: resolutions.includes("720p") ? "720p" : resolutions[0]! },
          { kind: "segmented", name: "formato", label: "Formato", options: options(ratios), value: ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0]! },
        ],
      },
    ];
  },

  build(values, hasImage) {
    const script = values("fala").replace(/\s+/g, " ").trim();
    if (!script) throw new InputError("Escreva a fala do vídeo.");
    if (script.length > MAX_SCRIPT) throw new InputError(`A fala passa de ${MAX_SCRIPT} caracteres.`);
    if (!hasImage) throw new InputError("Escolha a foto do avatar.");
    const voice = VOICES.find((v) => v.value === values("voz"));
    if (!voice) throw new InputError("Escolha uma voz da lista.");
    const expressiveness = EXPRESSIVENESS.find((e) => e.value === values("expressividade"));
    if (!expressiveness) throw new InputError("Escolha a expressividade.");
    const extra = values("movimento").replace(/\s+/g, " ").trim();
    if (extra.length > MAX_MOTION) throw new InputError(`O movimento passa de ${MAX_MOTION} caracteres.`);

    const motion = [MOTION_GUIDE, extra].filter(Boolean).join(" ");
    const resolution = values("resolucao");
    const aspectRatio = values("formato");
    return {
      request: {
        prompt: script,
        resolution,
        aspect_ratio: aspectRatio,
        provider: { options: { heygen: { voice_id: voice.value, expressiveness: expressiveness.value, motion_prompt: motion } } },
      },
      image: "reference",
      record: {
        prompt: script,
        // Estimativa pela fala; o custo real vem do OpenRouter quando o vídeo fica pronto.
        duration: speechSeconds(script, WORDS_PER_SECOND),
        resolution,
        aspect_ratio: aspectRatio,
        request_prompt: script,
        style: null,
        language: null,
        extra: extra || null,
        settings: { voice_id: voice.value, voice: voice.label, expressiveness: expressiveness.value, motion_prompt: motion },
      },
    };
  },

  details(video) {
    let settings: Record<string, string> = {};
    try {
      settings = JSON.parse(video.settings ?? "{}");
    } catch {
      // Configurações ilegíveis: mostra só o que der.
    }
    return [
      { term: "Voz", description: settings.voice ?? "—" },
      { term: "Expressividade", description: EXPRESSIVENESS.find((e) => e.value === settings.expressiveness)?.label ?? "—" },
      { term: "Movimento", description: video.extra ?? "—" },
    ];
  },
};

/** Segundos que a fala leva, pelo ritmo médio. */
export function speechSeconds(text: string, rate: { min: number; max: number }): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / ((rate.min + rate.max) / 2)));
}
