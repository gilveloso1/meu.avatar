import type { AudioFixer } from "./audio";
import type { Exporter } from "./exportar";
import type { Renderer } from "./render";

export interface Env {
  DB: D1Database;
  /** Fotos dos avatares (avatares/...) e vídeos prontos (videos/...). */
  MIDIA: R2Bucket;
  /** Chave da API do OpenRouter. Sem ela, o estúdio mostra os vídeos mas não gera novos. */
  OPENROUTER_API_KEY?: string;
  /** Chave de gestão do OpenRouter, só para ler o saldo da conta no painel (src/custos.ts). */
  OPENROUTER_MANAGEMENT_KEY?: string;
  /** Segredo de assinatura dos webhooks do OpenRouter (opcional: o status sempre é conferido na API). */
  OPENROUTER_WEBHOOK_SECRET?: string;
  /** Chave da API direta da HeyGen (vence em 27/01/2027). Sem ela, o HeyGen segue pelo OpenRouter. */
  HEYGEN_API_KEY?: string;
  /** Contêiner que trata o áudio (src/audio.ts). Sem ele, o vídeo fica como veio do modelo. */
  AUDIO?: DurableObjectNamespace<AudioFixer>;
  /** Contêiner que monta os vídeos dos projetos (src/exportar.ts). Sem ele, o Exportar avisa que está indisponível. */
  EXPORTAR?: DurableObjectNamespace<Exporter>;
  /** Contêiner que faz o vídeo do HTML dos agentes (src/render.ts). Sem ele, o render avisa que está indisponível. */
  RENDER?: DurableObjectNamespace<Renderer>;
  /** Workers AI: o Whisper que transcreve a fala dos arquivos dos projetos (src/transcricao.ts). */
  AI?: Ai;
  /** Token de leitura do painel da Cloudflare (docs/operacao.md): o alarme de contêiner ligado sem trabalho (src/vigia.ts). */
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  /** A conta da Cloudflare dos contêineres, para o mesmo alarme. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** Custo do bcrypt das senhas; padrão 12 (os testes usam 4, para ir rápido). */
  BCRYPT_COST?: string;
  /** Endereço público do Worker, sem barra no fim: vira o callback_url e a URL das fotos. */
  SITE_URL: string;
  /** "local" no computador (vem do .dev.vars, que só o wrangler dev lê); no ar fica vazio. */
  AMBIENTE?: string;
  /** Padrões do formulário do Wan (o modelo de cada estrutura fica em src/structures/). */
  VIDEO_DURATION: string;
  VIDEO_RESOLUTION: string;
  VIDEO_ASPECT_RATIO: string;
}
