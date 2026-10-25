export interface Env {
  DB: D1Database;
  /** Fotos dos avatares (avatares/...) e vídeos prontos (videos/...). */
  MIDIA: R2Bucket;
  /** Chave da API do OpenRouter. Sem ela, o estúdio mostra os vídeos mas não gera novos. */
  OPENROUTER_API_KEY?: string;
  /** Segredo de assinatura dos webhooks do OpenRouter (opcional: o status sempre é conferido na API). */
  OPENROUTER_WEBHOOK_SECRET?: string;
  /** Senha do estúdio. Sem ela, ninguém entra (gerar vídeo gasta créditos). */
  ACCESS_TOKEN?: string;
  /** Endereço público do Worker, sem barra no fim: vira o callback_url e a URL das fotos. */
  SITE_URL: string;
  /** Padrões do formulário. */
  VIDEO_MODEL: string;
  VIDEO_DURATION: string;
  VIDEO_RESOLUTION: string;
  VIDEO_ASPECT_RATIO: string;
}
