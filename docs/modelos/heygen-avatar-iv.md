# HeyGen Avatar IV (`heygen/avatar-iv`)

Em teste desde 25/10/2026: voz de texto para fala, sem o chiado do Wan.
Próximos passos no item 1 de `docs/backlog.md`.

## Pesquisa de 29/10/2026: OpenRouter ou API direta da HeyGen

Hoje o Avatar IV vem pelo OpenRouter. A documentação da HeyGen
(<https://developers.heygen.com>; docs.heygen.com redireciona para lá) mostra
que a API direta faz mais e custa menos. Nada foi gerado: só leitura da
documentação e da tabela de preços da conta.

### O que o OpenRouter repassa

De `GET https://openrouter.ai/api/v1/videos/models` (29/10/2026): opções
`voice_id`, `voice_settings`, `motion_prompt`, `expressiveness`, `fit`,
`remove_background`, `background`, `caption`, `title`; 720p e 1080p; 16:9,
9:16 e 1:1; US$ 0,05/s.

- **Não passa:** áudio próprio (`audio_url`, `audio_asset_id`) nem voz
  clonada (o id de uma voz clonada é da conta da HeyGen que a criou, não da que
  o OpenRouter usa).
- **Já dá para usar sem trocar de API, e a estrutura ainda não usa:**
  `voice_settings` com `locale: "pt-BR"` (sotaque brasileiro nas vozes
  multilíngues), velocidade e tom; `caption` (legenda); `remove_background` e
  `background` (trocar o fundo).

### O que a API direta faz (`POST /v3/videos`)

Avatar IV é o motor padrão. Com `type: "image"` recebe a foto (url, asset_id
ou base64).

- **Fala por texto ou por áudio**, um ou outro: `script` (até 5.000
  caracteres) com `voice_id`, ou `audio_url` / `audio_asset_id` (MP3 ou WAV),
  sem script. Limite do áudio: a documentação diz 10 min numa página e 30 min
  em outra; contar com 10.
- **Opções:** 720p ou 1080p; 9:16, 4:5, 1:1, 16:9 e `auto`; `motion_prompt` e
  `expressiveness` (só para foto); `caption` (sempre devolve `subtitle_url`;
  com estilo, queima a legenda); `remove_background`, `background`;
  `output_format` `webm` com fundo transparente; `voice_settings` (speed,
  pitch, volume, locale, ElevenLabs).
- **Pronto:** `callback_url` no pedido, webhook da conta (assinado com
  HMAC-SHA256 no header `signature`) ou `GET /v3/videos/{id}`.
- **Limites (pré-pago):** 10 vídeos gerando ao mesmo tempo; 10 pedidos/s em
  `POST /v3/videos`; 429 com `Retry-After`.

### Voz clonada

- **Clone instantâneo:** `POST /v3/models/audio/voices` com `mode: "instant"`
  e uma gravação. Usa só os 3 primeiros minutos; sem duração mínima escrita;
  não dá para retreinar. Estados PENDING, ACTIVE, FAILED.
- **Português:** aceito (`pt`), mas `pt-BR` vira `pt`; a documentação diz que a
  etiqueta regional não escolhe sotaque.
- **Usar no vídeo:** a documentação se contradiz sobre o `voice_id` clonado ir
  direto no `POST /v3/videos`. O caminho garantido: gerar o áudio com
  `POST /v3/models/audio/tts` e mandar esse áudio para o Avatar IV.
- **Voz para voz:** troca a voz de uma gravação da pessoa pela voz clonada.

### Preços da API direta

Da tabela de preços da conta (<https://platform.heygen.com/pricing>,
29/10/2026), pré-pago em dólar.

| Item | Preço |
|---|---|
| Avatar IV com foto | **US$ 0,0385/s** (720p e 1080p) |
| Avatar IV com avatar de vídeo próprio ou da HeyGen | US$ 0,0805/s |
| Avatar III com foto | US$ 0,0165/s |
| Avatar V (avatar de vídeo próprio) | US$ 0,12/s |
| Voz instantânea, texto para fala | US$ 15 por 1 milhão de caracteres (turbo: US$ 4) |
| Voz para voz | US$ 0,12/min |
| Criar voz instantânea | Grátis durante a prévia |
| Lipsync (áudio novo num vídeo) | US$ 0,014/s rápido, US$ 0,029/s preciso |

Um vídeo de 30 s com foto: US$ 1,16 direto, contra US$ 1,50 pelo OpenRouter
(23% menos). A voz do mesmo vídeo (≈ 450 caracteres) custa ≈ US$ 0,007.

### Próximo passo

1. Na estrutura atual, pelo OpenRouter: `voice_settings.locale = "pt-BR"` e
   legenda.
2. Para voz própria ou clonada e o preço menor: uma estrutura nova pela API
   direta da HeyGen, com chave e saldo próprios (hoje o saldo é zero). Um
   teste pago antes de decidir.
