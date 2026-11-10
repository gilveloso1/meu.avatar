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

**Primeiro teste real** (10/11/2026, pelo terminal, `npm run gerar`): o mesmo pedido do vídeo do Wan
3.0 livre `fef8324d-bf4c-4019-adb4-1f63207c4f70` (a mesma foto 768×1376 como primeiro quadro, o mesmo
prompt, 3 s, 480p, sem som), só que em 16:9. O vídeo ficou no R2 em
`testes/mischief-1/2026-11-10-maos-delineador.mp4` (job `gen-vid-1794280741-QGY1IUqH44nLS4m1fGzf`).

| | Wan 3.0 | mischief 1 |
|---|---|---|
| Custo real | US$ 0,2125 (cobrado como 5 s) | **US$ 0,015** (os 3 s, como a lista) |
| Tempo | minutos | **uns 20 s** |
| Saída | 9:16, a cena inteira | 832×480, 16 fps: a foto vertical **cortada no meio** (somem o espelho, a mesa e a cadeira) |
| Movimento | O dedo esfrega a linha e sai; mãos e manga naturais | Quase igual (é feito do Wan 2.2): o dedo esfrega e sai, mãos naturais |
| O que o prompt pedia | A linha não devia mudar; ela cresceu e ficou mais grossa | O mesmo: a linha cresceu |

Conclusão: para cena curta de mãos ou produto, o movimento fica no nível do Wan por uns 7% do custo e
em segundos. O limite é o formato: foto vertical vira um recorte horizontal do meio, que não serve
para 9:16. Vale para vídeos 16:9 ou com a foto já horizontal. Falta ver um rosto.
