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

1. Conferir de ouvido os três vídeos abaixo e o lip sync.
2. Publicar: chave no Worker (`npx wrangler secret put HEYGEN_API_KEY`),
   migração 0011, e ligar a config `plataforma.heygen` (ver `docs/operacao.md`).
3. Conferir no ar o aviso `/heygen/webhook`: no computador ele não chega, e o
   corpo do aviso não está documentado.

## Testes pela API direta (30/10/2026)

No computador, com a mesma foto (avatar com os produtos na mesa), o mesmo texto
nos testes 1 e 3 ("Vocês já viram o valor que tá o kit completo do colágeno
Lifter aqui no Tik Tok Shop, gente!"), 720p, 9:16, expressividade média. Vídeos
no D1 local.

| Teste | Voz | Duração | Custo calculado | Vídeo |
|---|---|---|---|---|
| 1 | Voz pronta (Lucilene) | 5,5 s | US$ 0,2132 | `b298d6d0-c58a-46e7-be05-f0404d462e52` |
| 2 | Meu áudio (gravação de 6,76 s) | 6,8 s | US$ 0,2593 | `9b5f5fa7-8d5b-4852-aa6f-683eb305634a` |
| 3 | Voz clonada (Camila, com autorização dela) | 6,1 s | US$ 0,2332 | `cf00562b-6dd9-459d-ba2c-1b044028e8d5` |

- **Funcionou de ponta a ponta nas três vozes:** pedido, vídeo salvo no R2,
  duração e limpeza na HeyGen. O vídeo fica pronto em menos de 1 minuto.
- **Voz clonada:** a clonagem levou menos de 3 minutos com uma amostra de
  2 min 59 s, e o `POST /v3/models/audio/voices` e o TTS funcionaram como a
  documentação diz.
- **Saldo:** caiu US$ 0,67 nos três vídeos, contra US$ 0,7057 calculados: a
  cobrança real fica um pouco abaixo da conta pela duração. A HeyGen não
  devolve o custo do vídeo.
- **As vozes em português (100+) têm `support_locale: false`:** o sotaque pt-BR
  por `locale` não se aplica a elas; elas já falam em português.
- **A página do vídeo na HeyGen abre sem login**, com nome, visualizações,
  comentários e transcrição (`app.heygen.com/videos/<id>`), e não há campo de
  privacidade na API. Por isso o estúdio apaga o vídeo e os arquivos lá depois
  de salvar. A voz clonada fica na conta da HeyGen.
- **Treinamento:** a política da HeyGen permite usar o conteúdo enviado para
  treinar modelos; a recusa é por e-mail (heygen.com/policy).
