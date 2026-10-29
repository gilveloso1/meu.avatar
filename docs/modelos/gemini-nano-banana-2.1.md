# Gemini Nano Banana 2.1 (`google/gemini-nano-banana-2.1`)

Modelo de imagem usado para trocar o rosto nos quadros-chave do
[Runway Aleph 2](runway-aleph-2.md). Em teste pelo terminal, sem estrutura.

Como chamar:

- **Pelo chat** (`POST /api/v1/chat/completions`, `modalities: ["image",
  "text"]`, as imagens em `image_url`): devolve 768 px de largura (1376×768
  num quadro 16:9, 768×1376 num vertical). US$ 0,04 por imagem, uns 20 s.
- **Pela API de imagens** (`POST /api/v1/images`, imagens em
  `input_references`, com `resolution` de 1K a 4K e `aspect_ratio`): em 2K
  devolve 1536×2752 por US$ 0,06. A lista dos modelos e o que cada um aceita
  está em `GET /api/v1/images/models` e `.../<id>/endpoints`.

O que se viu (28 e 29/10/2026):

- Troca bem o rosto mantendo pose e mãos quando recebe o quadro, a foto inteira
  e um recorte do rosto, com um prompt que descreve os traços.
- Às vezes muda o que não devia: num quadro 16:9 com faixas pretas, trocou as
  faixas por fundo desfocado e mudou o tamanho; tirou da frente do rosto um
  frasco que o cobria (mesmo com instrução explícita, nas duas resoluções); abriu
  os olhos de quem olhava para baixo (resolvido com instrução); inventou uma
  prateleira no fundo. Por isso cada quadro é conferido contra o original.

**Modelo de imagem para os quadros-chave** (29/10/2026, o mesmo quadro de
2,7 s, as mesmas referências e o mesmo prompt, em 2K e 9:16, pela API de
imagens do OpenRouter, `POST /api/v1/images` com `resolution` e
`aspect_ratio`; pelo chat, o banana devolvia só 768 px de largura):

| Modelo | Saída | Custo | Tempo | Resultado |
|---|---|---|---|---|
| `google/gemini-nano-banana-2.1` | 1536×2752 | US$ 0,06 | 21 s | **O melhor:** rosto do avatar, nítido, e o resto do quadro igual |
| `google/gemini-3-pro-image` | 768×1376 (ignorou o 2K) | US$ 0,14 | 31 s | Rosto bom, mas sem ganho de resolução e mais caro |
| `black-forest-labs/flux-3-image` | 1536×2736 | US$ 0,10 | 90 s | Nítido, mas o rosto foge do avatar |
| `qwen/qwen-image-3-pro` | 1152×2048 | US$ 0,08 | 134 s | Mudou a mão, o enquadramento, o cabelo e a luz: não serve como quadro-chave |

Na comparação de um quadro só, o banana em 2K foi o melhor. Usado no quarto
teste do Aleph 2, não melhorou o vídeo e um quadro refeito inventou uma
prateleira no fundo (ver [runway-aleph-2.md](runway-aleph-2.md)). **Fica o
banana pelo chat** (768 px de largura, US$ 0,04 por quadro), como no terceiro
teste.
