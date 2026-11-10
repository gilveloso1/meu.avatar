# mischief 1 (`tbc/mischief-1`)

Da The Biological Computing Co. (TBC), lançado em 30/10/2026. Imagem para vídeo, sem som. Estrutura
`mischief.ts`, só para o administrador (em teste), desde 10/11/2026.

O que se sabe (lista de modelos do OpenRouter e anúncio da empresa, lidos em 10/11/2026):

- **Base**: feito a partir do Wan 2.2. A empresa diz que é cinco vezes mais rápido que ele com a mesma
  qualidade. O "derivado de neurônios" é da pesquisa (eficiências achadas em neurônios vivos e
  levadas ao modelo); o que roda é um modelo comum. Os números de velocidade e qualidade são da
  própria empresa, sem comparação independente.
- **Entrada**: a foto como primeiro quadro (`frame_images`, só `first_frame`) e o movimento no prompt.
  O OpenRouter também aceita só texto, mas a estrutura pede a foto, como o Grok.
- **Saída**: só 16:9 (854×480 ou 1280×720), 3 ou 5 s, sem áudio (`generate_audio: false`), com semente.
- **Custo**: US$ 0,005 por segundo em 480p e 0,01 em 720p (`cents_per_video_output_second_<r>`): um
  vídeo de 5 s em 720p sai US$ 0,05. É o vídeo mais barato do OpenRouter: um terço do Grok Imagine
  1.5 Lite em 720p (US$ 0,03/s mais 0,01 pela foto) e um décimo do Wan 3.0.

Para que serve: cenas de apoio horizontais e baratas a partir de uma foto (produto na mesa, ambiente,
mãos, câmera se aproximando), para vídeos 16:9 (YouTube) ou como camada por cima. Não serve para o
formato das redes (9:16), não fala e não tem som.

Ainda sem teste real: falta ver como fica uma pessoa (rosto e mãos), quanto tempo leva e se o custo
cobrado bate com a lista.
