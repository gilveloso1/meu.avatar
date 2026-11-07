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

**Modelo de imagem para os esboços dos vídeos** (06/11/2026, item 3 do backlog). Pela API de
imagens (`POST /api/v1/images`, `resolution: "1K"`, `aspect_ratio: "9:16"`; as referências vão em
`input_references` como objetos `{type: "image_url", image_url: {url}}`, não como texto). Dois casos,
os três modelos baratos que aceitam de 0 a várias referências:

- **Sem referência**: só a descrição (mulher de 30 anos na cozinha, segurando um sérum roxo, estilo UGC).
- **Com referência**: um quadro de um vídeo de referência (`origens/5f51ef4c-….mp4`, 1,5 s, recortado
  sem as faixas) e a foto principal da avatar Camila Pinheiro, pedindo a mesma cena com ela e sem a legenda.

| Modelo | Saída | Custo | Tempo | Sem referência | Com referência |
|---|---|---|---|---|---|
| `google/gemini-nano-banana-2.1` | 768×1376 | US$ 0,036 / 0,040 | 14 / 20 s | A mais natural, cara de foto de celular | **O melhor:** rosto da Camila, cena, produtos e rótulos iguais, legenda tirada; a expressão acompanha a cena |
| `bytedance-seed/seedream-5-0-flash` | 720×1280 | US$ 0,018 | 19 / 13 s | Boa, mais "anúncio" | **Não serve:** tirou a legenda, mas manteve a mulher do print |
| `qwen/qwen-image-2.1-turbo` | 576×1024 | US$ 0,018 | 17 / 17 s | Boa | Rosto da Camila e cena mantidos, mas copiou o gesto e o sorriso da foto (mão no cabelo) e sai menor |

Escolhido o banana para o modelo de imagem. O Qwen Turbo fica como opção barata, se o custo pesar.
Total do teste: US$ 0,15. As imagens ficaram fora do repositório.

**Maquete 3D como referência de enquadramento** (06/11/2026). A pergunta: uma maquete cinza em 3D
(caixas, um boneco e a câmera posta por números) acerta o enquadramento melhor do que só a descrição?
As maquetes foram feitas em Three.js e fotografadas no Chrome sem tela, no computador (576×1024), e
entraram no projeto "Teste do render" como arquivos (`maquete-a.png`, `-b`, `-c`). Para cada cena, a
mesma descrição em inglês, detalhada no enquadramento, uma vez sem referência e outra com a maquete e
uma frase dizendo que ela é um esboço cinza: copiar câmera, ângulo, lente e posições e virar foto.

| Cena | Só a descrição | Com a maquete |
|---|---|---|
| A: câmera na altura da bancada, sérum grande na frente à esquerda, mulher no terço direito | Acertou | Acertou, mais preso à maquete (câmera mais baixa, janela e armário no lugar) |
| B: do canto do teto, olhando para baixo, mulher pequena sentada abrindo uma caixa | **Errou:** fez vista de cima, a pino, e mudou a sala | **Acertou:** o mesmo canto, as duas paredes, o sofá e o chão vazio; mas a sala saiu nua e cinza como a maquete |
| C: plano geral, mulher pequena embaixo à direita, céu livre para texto | Acertou | Acertou; o horizonte seguiu a maquete (mais alto do que a descrição pedia) |

Leitura: com uma descrição detalhada em inglês, o banana já acerta enquadramentos comuns. A maquete
ganha nos ângulos fora do comum (B) e dá controle exato e repetível; o preço é que ela copia também o
vazio e o cinza da maquete, então a descrição precisa dizer a decoração e as cores, ou a maquete precisa
de objetos. Não testado: a mesma cena de vários ângulos (a vantagem que mais pesa num anúncio com
vários cortes) e a maquete junto com a foto do avatar (a ferramenta aceita uma referência só).

Teste extra da cena B: a mesma maquete, com a decoração na descrição (piso de madeira, sofá verde com
almofadas e manta, mesinha com abajur e caneca, planta, quadros e prateleira com livros, luz de fim de
tarde) e a frase "da maquete vem só a disposição, não as cores nem o vazio". **Acertou:** a câmera, o
canto, o tapete, a mulher e o sofá ficaram no lugar da maquete, e a sala saiu mobiliada e quente. O que
a descrição não citou continuou vazio (o chão da metade de baixo). Regra para as maquetes: a maquete dá
a disposição e a câmera; a descrição dá a decoração, as cores e a luz, e tudo o que não for citado sai vazio.

Custo: 7 imagens em 1K, US$ 0,26.

**Maquete neutra ou em contraste** (06/11/2026, com o `montar_maquete` do PR da maquete rodando no
computador). Três cenas de dificuldade crescente, cada uma com a mesma descrição longa e detalhada
(pessoas, roupas, móveis, cores, luz, lente) e a mesma frase final: "a referência é uma maquete
3D que só define a disposição; manter câmera, ângulo, lente e posições e virar foto real; cores,
materiais, rostos, roupas e decoração vêm da descrição". A maquete foi feita nos dois estilos:
neutro (tudo cinza e bege) e contraste (pessoa em vermelho e azul-marinho, móveis em azul, chão
cor de madeira). Maquetes e imagens no projeto "Teste do render" (`maquete-n1-neutro.png` etc.).

| Cena | Neutro | Contraste |
|---|---|---|
| 1. Cozinha, câmera na altura da ilha, uma mulher mostrando o sérum, quatro objetos na ilha | **Certa:** tudo no lugar, ilha branca | Disposição certa, mas a frente da ilha (que a descrição não pintou) saiu **azul**, e a borda do tampo, marrom: as cores da maquete passaram para a foto |
| 2. Sala vista do canto, de cima, 24 mm; ela sentada no sofá com o celular, ele debruçado apontando; mesa de centro com xícaras e livros, quadro, abajur, planta, janela | Pessoas e móveis certos, mas a câmera chegou mais perto e a mesa mudou de lugar | **Mais fiel** à maquete: câmera aberta, mesa e tapete no lugar; nenhuma cor vazou (tudo estava descrito) |
| 3. Quarto visto do canto do teto, 18 mm; mãe sentada de pernas cruzadas na cama com o sérum, caixa aberta e três produtos no lençol, filha ajoelhada no tapete, pai de braços cruzados; estante, mesinha, janela, guarda-roupa | **Certa:** as três pessoas nas poses, os produtos e a caixa na cama, câmera igual | Também certa, mas a mesinha de cabeceira (sem cor na descrição) saiu **azul** |

Leitura: o banana segue a maquete muito bem, inclusive com três pessoas, poses diferentes e
objetos pequenos, a 18 mm do canto do teto. A cor da pessoa na maquete nunca vazou (roupas
sempre descritas); a dos móveis vazou sempre que a descrição não citou a cor daquela superfície.
O contraste ajudou a fixar a disposição só na cena 2. **Padrão: neutro.** O contraste fica como
opção (`estilo: "contraste"`), para cena cheia em que a descrição cita a cor de tudo. Próximo
teste possível: pessoas em contraste e o resto neutro. Custo: 6 imagens em 1K, US$ 0,24.
