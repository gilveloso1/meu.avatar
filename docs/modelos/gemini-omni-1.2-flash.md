# Gemini Omni 1.2 Flash (`google/gemini-omni-1.2-flash`): avatar falando, clipes curtos

**Estrutura `omni` (`src/structures/omni.ts`), só para o administrador, desde 07/11/2026.**
Ainda sem nenhum vídeo gerado. Uso pretendido: avatar falando a partir da foto e da fala,
com a voz e a boca saindo do modelo (como o [Wan 3.0](wan-3.0.md)), em clipes de até 15 s.

A estrutura começou no 1.1 (`google/gemini-omni-1.1-flash`) e passou para o 1.2 no mesmo
dia: o Google avisa que, **a partir de 03/12/2026, todo pedido ao 1.1 vai para o 1.2** e é
cobrado como 1.2. O 1.2 aceita as mesmas entradas, vai até 15 s (o 1.1 ia até 10 s) e
custa 31% menos.

## O que o OpenRouter diz (`GET /api/v1/videos/models`, 07/11/2026)

- Modelo de vídeo e edição multimodal do Google (de 05/11/2026): texto para vídeo, imagem
  para vídeo, primeiro e último quadro, referências de pessoa e de vídeo (até três clipes),
  editar ou estender um vídeo enviado. Entradas: texto, imagem e vídeo (sem áudio próprio).
  Repassa só o parâmetro `task` (valores não documentados).
- Foto como primeiro ou último quadro (`frame_images`).
- 3 a 15 s; 360p, 720p, 1080p e 4K; só 16:9 e 9:16.
- Sempre com áudio (`generate_audio: true`; não há preço sem áudio).

Preço por segundo, com áudio:

| Resolução | SKU | US$/s | 8 s | 15 s |
|---|---|---|---|---|
| 360p | `duration_seconds_with_audio_360p` | 0,0232 | 0,19 | 0,35 |
| 720p | `duration_seconds_with_audio_720p` | 0,0695 | 0,56 | 1,04 |
| 1080p | `duration_seconds_with_audio` (sem sufixo) | 0,1043 | 0,83 | 1,56 |
| 4K | `duration_seconds_with_audio_4k` | 0,2085 | 1,67 | 3,13 |

### Preço direto no Google (ai.google.dev/gemini-api/docs/pricing, 07/11/2026)

O Google cobra por tokens de saída: 1.931 tokens por segundo em 360p, 5.792 em 720p, 8.688
em 1080p e 17.376 em 4K (1080p e 4K com upsampling), a US$ 12,00 por milhão no 1.2 (no
1.1, US$ 17,50). Os preços do OpenRouter acima são exatamente esses tokens vezes
US$ 12,00/M: **o OpenRouter não cobra a mais**, e o SKU sem sufixo é mesmo o 1080p.

O único provedor no OpenRouter é o Google AI Studio. No playground do OpenRouter, um vídeo
do 1.1 de 1280×720 e 5 s custou US$ 0,5068 (o preço do 1.1, 0,10136 × 5).

## Estrutura (07/11/2026)

**Duas versões, um seletor (07/11/2026):** enquanto a 1.2 estiver instável, a 1.1 volta como
segunda versão da mesma estrutura (`omniVersion` em `src/structures/omni.ts`): `omni` (1.2, a
principal) e `omni-11` (1.1, `family: "omni"`). A página tem o seletor **Versão** (1.1 | 1.2)
no alto do painel, que abre a página da outra versão; o card da tela inicial e a lista de
vídeos são os dois juntos. Cada versão tem as durações e os preços do modelo dela (1.1: 3 a
10 s, US$ 0,10/s em 720p). O Google passa a 1.1 para a 1.2 em 03/12/2026: até lá, tirar a
`omni-11` (os vídeos dela continuam com a estrutura gravada).


Formulário: **Instruções** (obrigatórias: a cena, o jeito de falar e o estilo, escritos por
quem usa; ao escolher o avatar, voltam com as últimas usadas com ele neste modelo), **Idioma
da fala** (português, inglês, espanhol ou **Sem fala**) e **Texto** (até 250 caracteres,
cerca de 15 s; só aparece com um idioma e aí é obrigatório), foto do avatar (obrigatória,
primeiro quadro), duração, resolução (da menor para a maior: o modelo lista 720p, 1080p,
4K, 360p) e formato, todos da lista do modelo (padrão 8 s, 720p e o formato da configuração).

Prompt (`omniPrompt`), **sem orientação padrão de estilo nem de voz**: as instruções; a fala só
com a mecânica (`omniSpeech`: o idioma, a boca acompanhando e as palavras exatas) ou, sem
fala, `OMNI_SILENT` (boca fechada, sem diálogo); e `OMNI_NO_TEXT` (sem legenda nem texto na
tela, que vêm depois, na edição). Sem fala, o vídeo guarda o texto vazio e o idioma
`sem-fala` (o Refazer volta com "Sem fala"). Sem tratamento de áudio e sem Edição rápida.

Mudou em 07/11/2026, depois do primeiro teste: saiu o Estilo, saiu a orientação de voz baixa
e calma do Wan, as instruções ficaram obrigatórias, entrou o "Sem fala" e as resoluções foram
ordenadas. O teste abaixo foi feito antes, com o estilo Selfie e a orientação do Wan: o áudio
limpo e baixo (−20 LUFS) pode mudar sem ela.

Depois: salvar instruções com nome no avatar (várias por avatar, como um ativo novo), para
escolher entre estilos.

Custo na tela: o preço da resolução por segundo vezes a duração. Em 720p, 8 s: US$ 0,56.

## Teste de 07/11/2026

Pelo site, publicado só para o administrador. Foto principal da Marina ("Apresentadora
financeira", 941×1672), estilo Selfie, português, 8 s, 720p, 9:16. Fala: a primeira frase do
vídeo de referência do Wan (`43d41b41`), encurtada para 19 palavras: "Já tem hora marcada: o
resultado da eleição para presidente sai entre oito e meia e nove da noite!".

| Vídeo (D1) | Job | Tempo | Custo real |
|---|---|---|---|
| `7121a3d8-ff36-429d-9fba-e2a6de42eb96` | `gen-vid-1794068958-wgMaaePyiGAZT3XEVWrc` | 54 s | US$ 0,556 (igual ao estimado) |

- **Imagem:** 720×1280, exatamente 8 s. Rosto, óculos, colar, roupa e cenário iguais aos da
  foto; câmera parada; gestos de mão naturais e, no fim, as mãos descem e ela sorri.
- **Fala:** a transcrição bate palavra por palavra ("Já tem hora marcada. O resultado da
  eleição para presidente sai entre 8h30 e 9h da noite."), dos 0,4 s aos 6,8 s; sobra 1,3 s
  em silêncio no fim. A boca acompanhando a fala ainda precisa ser conferida assistindo.
- **Áudio como veio** (ffmpeg): −20,1 LUFS, pico de −3,3 dBFS, sem clipping, estéreo 48 kHz.
  Bem diferente do Wan (−5 LUFS, com clipping, ver [docs/prompt.md](../prompt.md)): limpo,
  só mais baixo que o alvo de −14 LUFS.

## Testes de 07/11/2026, depois dos ajustes (sem orientação padrão)

Publicado o formulário novo (versão `9b8553d2`). Marina, 4 s, 720p, 9:16, instruções em
português, como quem usa escreve. **As quatro tentativas falharam**, sem custo, todas com
"Video generation failed" e sem outro motivo no job do OpenRouter:

| Vídeo (D1) | Fala | Pedido | Falhou em |
|---|---|---|---|
| `fa3f8946` | "O resultado sai hoje, entre oito e meia e nove!" | 17:06:30 | 17:08:06 |
| `3e551e0b` | Sem fala | 17:06:56 | 17:08:06 |
| `683563aa` | a mesma fala (de novo) | 17:09:12 | 17:10:07 |
| `8f821fcc` | Sem fala (de novo) | 17:09:35 | 17:11:05 |
| `1f9d65f0` | a mesma fala, **instruções em inglês** | 17:13:45 | 17:15:08 |
| `8fd2b2cb` | a mesma, instruções em inglês, **8 s** | 17:30:45 | 17:31:31 |

Os prompts saíram como planejado (instruções, a fala só com a mecânica ou `OMNI_SILENT`, e
`OMNI_NO_TEXT`). A página do modelo no OpenRouter mostrava, na hora, **54% de
disponibilidade nas últimas 24 h** (o 1.1, 87%): metade dos pedidos falha no Google. Mas
quatro falhas seguidas pesam contra só o acaso. Diferenças para o teste que deu certo: 4 s
(lá, 8 s) e instruções em português (lá, tudo em inglês, menos a fala). As instruções de
quem usa vão como foram escritas; a regra dos prompts do projeto é mandar ao gerador em
inglês. O quinto pedido, com as instruções em inglês, também falhou: o idioma não é a causa
(ou não sozinho). O sexto, igual ao quinto mas com 8 s, também falhou: a duração não é a
causa. A foto é a mesma em todos (o mesmo arquivo, conferido pelo hash), e a disponibilidade
do modelo no OpenRouter estava entre 81% e 97% nas horas antes. Entre o vídeo que deu certo e
os que falharam, só mudou o texto do pedido (o prompt curto, sem a orientação do Wan) e o
horário.

**Controle (17:34, pelo terminal, `npm run gerar`):** o pedido exato do `7121a3d8` (o mesmo
prompt, a mesma foto, 8 s, 720p) **deu certo** logo depois das falhas: job
`gen-vid-1794072860-p5ooVBrlEUlPNwQbO9uD`, US$ 0,556, vídeo só no computador (scratchpad).
O provedor estava no ar: **o Omni recusa o prompt curto** (instruções, a fala com a
mecânica e o pedido de nada de texto na tela), com ou sem fala, em português ou inglês, de
4 ou 8 s. Falta achar qual parte.

**Testes pelo terminal (17:37, 360p, 4 s, a mesma foto):**

| Teste | Pedido | Resultado |
|---|---|---|
| 1 | O pedido antigo inteiro | Pronto, US$ 0,093 (`gen-vid-1794073015-zXGB7k37ET5nNEIqnnXF`) |
| 2 | Curto + "Video: photorealistic, steady framing, natural skin texture." | Falhou |
| 3 | Curto + a orientação de som (sem música, efeitos, eco, distorção) | Falhou |
| 4 | Curto + a câmera (parada, plano médio, sem cortes) | Falhou |
| 5 | Curto sem "No on-screen text…" | Falhou |

"Curto": as instruções "Financial news anchor in a studio, speaking with energy and
confidence while looking at the camera and gesturing with her hands." e a fala com a
mecânica. Nenhuma parte do pedido antigo, sozinha, resolve. **Todos os pedidos que falharam
falam em notícias** ("notícias financeiras", "news anchor"); o antigo, não. Hipótese: o
filtro do Google barra vídeo realista de alguém apresentando notícias (risco de notícia
falsa), sem dizer o motivo.

**Confirmação (17:43, 360p, 4 s):** a hipótese não se sustentou sozinha.

| Teste | Pedido | Resultado |
|---|---|---|
| A | Curto, sem notícias ("Woman in a studio, speaking with energy…") | Falhou |
| B | O antigo, com "is a news anchor and" na primeira frase | Falhou |

O curto falha mesmo sem notícias. O que só o antigo tem: a frase cita "the person in the
photo", e a fala vai como "The person on camera says softly…: "…"" seguida de "Lip sync. The
speech is in Brazilian Portuguese and says exactly the quoted words." (no curto: "The person
speaks in Brazilian Portuguese, with lip sync, and says exactly: "…"").

**Frase da fala (17:46, 360p, 4 s):**

| Teste | Pedido | Resultado |
|---|---|---|
| C | O antigo, com a frase da fala nova | Pronto, US$ 0,093 (`gen-vid-1794073568-LNk6JSH555b8XbsovYeu`) |
| D | Curto ("Woman in a studio…"), com a frase da fala antiga | Pronto, US$ 0,093 (`gen-vid-1794073569-YsUwDbf4NVlvUjAavmdR`) |
| E | Curto, frase nova, começando por "The person in the photo is…" | Falhou |

**O pedido curto funciona com a fala no formato antigo**: `The person on camera says …:
"<fala>"` e, numa linha à parte, `Lip sync. The speech is in <idioma> and says exactly the
quoted words.` Com a frase nova (`The person speaks in <idioma>, with lip sync, and says
exactly: "<fala>"`) o curto falha sempre (A, E e todos do site); no pedido longo, passa (C).
Citar a foto não ajuda (E). Falta testar a fala antiga sem "softly, in a calm, low voice"
(estilo de voz, que deve vir das instruções) e o sem fala sem notícias.

**Com o formato corrigido no código (17:49, 360p, 4 s):** com fala, pronto, US$ 0,093
(`gen-vid-1794073783-Dv3VycoLs0RUUqkWqFWx`; `The person on camera says: "…"` e `Lip sync. The
speech is in Brazilian Portuguese and says exactly the quoted words.`, sem "softly"). Sem fala
("Woman in a studio listens in silence…" + `OMNI_SILENT` + `OMNI_NO_TEXT`), falhou.

Gasto real dos testes pelo terminal: US$ 0,93 (o controle de 8 s em 720p e quatro de 360p).

**Plano único e "No dialogue or voiceover." (17:55, 360p, 4 s):** os dois falharam, com e sem
fala. O com fala era o mesmo pedido que passou às 17:49, só com "In a single continuous shot,
no scene cuts." (a frase do guia do Google) a mais.

**Balanço de 07/11/2026 (22 pedidos ao 1.2, a mesma foto):**

| Pedido | Prontos | Falhas |
|---|---|---|
| O antigo, longo (com a orientação do Wan), ou ele com a frase da fala nova | 4 | 1 (com "news anchor") |
| Curto (só instruções e mecânica, com ou sem uma parte do antigo) | 2 | 15 |

Testes isolados não bastam para achar a causa: o mesmo tipo de pedido passou e falhou com
minutos de diferença. O padrão que se sustenta é o pedido longo passar e o curto falhar quase
sempre. O OpenRouter marca o modelo como de raciocínio obrigatório; uma hipótese, sem prova,
é que o pedido curto deixa o modelo inventar mais (planos, narrativa) e cair no filtro.
Fazer outro teste agora seria seguir no escuro; o próximo passo é decidir o caminho.

**Pedido longo com as instruções no lugar do estilo (17:59, 360p, 4 s):** falhou com e sem
fala. Com fala, era o antigo inteiro, só com a primeira frase trocada por "Woman in a studio,
speaking with energy and confidence while looking at the camera and gesturing with her
hands." e o plano único. **Controle logo depois (18:00):** o antigo exato, pronto, US$ 0,093
(`gen-vid-1794074360-2mAEIxc0dv2t1EkcKdql`); 5 de 5 com ele.

O que passa com constância é a primeira frase do estilo Selfie do Wan: "Vertical
selfie-style video. The person in the photo looks straight into the camera, keeps the
starting position and talks calmly and naturally, like a casual social media update.
Locked-off static camera, medium close-up, no zoom, no cuts. Subtle natural head movement and
blinking." Ela prende o vídeo à foto (a pessoa da foto, a posição de partida, a câmera
parada). As instruções de teste mandavam gesticular e falar com energia, e não citavam a foto.

Gasto real dos testes pelo terminal no dia: US$ 1,11.

**1.1 pelo site, com o seletor Versão (18:46, publicado na versão `17fac402`):** a Marina,
instruções em português ("Apresentadora num estúdio, fala com confiança olhando para a câmera
e gesticula com as mãos."), fala "O resultado sai hoje, entre oito e meia e nove!", 4 s,
720p, 9:16, o pedido longo do código. **Pronto em 37 s, US$ 0,405** (igual ao estimado),
vídeo `87fdc2b3-ef9b-450e-9cfa-cf3168f52278`. 720×1280, 4 s; rosto, óculos e roupa iguais aos
da foto, um plano só, gesticulando; a fala sai inteira (a transcrição escreve "8,5" para
"oito e meia"), sem silêncio sobrando. Áudio −20,4 LUFS, pico −3,0 dBFS.

## Teste de 10/11/2026: o formato do código ainda falha

Pelo terminal (`npm run gerar`), a mesma foto da Marina, 4 s, 360p, 9:16, os dois pedidos ao
mesmo tempo (21:58 UTC), instruções em português ("Apresentadora num estúdio, fala com confiança
olhando para a câmera e gesticula com as mãos.") e a fala "O resultado sai hoje, entre oito e
meia e nove!". **Os dois falharam em 40 s, sem custo**, com "Video generation failed":

| Pedido | Job | Resultado |
|---|---|---|
| O do código (`omniPrompt`): instruções, `OMNI_SINGLE_SHOT`, a fala citada e a orientação de qualidade | `gen-vid-1794347889-EPgFEyoduDBjz2wVNzZg` | Falhou |
| O mesmo, com "The person in the photo starts from the position in the photo, in the same place and framing. No cuts." antes das instruções, no lugar do `OMNI_SINGLE_SHOT` | `gen-vid-1794347889-ECAzcd0Wt0jDK2szGHNA` | Falhou |

- O formato que está no código continua falhando, três dias depois do lançamento: não era só a
  instabilidade dos primeiros dias.
- Citar a pessoa da foto e a posição de partida numa frase nova, sem o resto da frase do estilo
  Selfie, não bastou (uma tentativa).
- Não houve controle com o pedido antigo exato no mesmo horário (só dois pedidos autorizados):
  não dá para separar o formato de uma queda do provedor naquele minuto.

**Controle e `task` (22:07 UTC, os dois ao mesmo tempo, 4 s, 360p, a mesma foto e a mesma fala):**

| Pedido | Job | Resultado |
|---|---|---|
| O antigo exato (`buildPrompt` com o estilo Selfie, sem instruções), sem `task` | `gen-vid-1794348441-4oDFD2mLaxrclUBFwtvZ` | **Pronto**, US$ 0,0927 (vídeo só no ambiente de teste) |
| O do código (`omniPrompt` com as instruções), com `provider.options["google-ai-studio"].task = "image_to_video"` | `gen-vid-1794348441-QkOCuYXN6pKh3bB8wq1J` | Falhou |

- O provedor estava no ar: **a falha é do formato do pedido**, não de uma queda. O antigo exato
  passou de novo (6 de 6 desde 07/11).
- O `task` não resolveu. Não dá para saber se o OpenRouter repassou a opção (a resposta não
  diz, e o nome do provedor nas opções, `google-ai-studio`, é o da página do provedor, sem
  confirmação): o resultado vale como "não ajudou", não como "o parâmetro não serve".
- Pesquisa do dia (só os resumos da busca; as páginas não abrem deste ambiente): o Omni barra
  rosto que pareça de pessoa real também na imagem enviada, com relatos de falso positivo em
  avatar próprio e de recusas sem motivo no fórum do Google. Combina com o que se vê aqui: o que
  passa é a frase que manda animar a pessoa da foto parada, de frente, falando calma.

Gasto do dia: US$ 0,09 (quatro pedidos, um pronto).

**O antigo com as instruções depois da frase do Selfie (22:10 UTC, 4 s, 360p):** falhou, sem
custo (`gen-vid-1794348600-VFqhHGdMmqJwaOBjHm7q`). Era o `buildPrompt` com `extra` (o caminho do
Wan): a frase do Selfie inteira, depois "Apresentadora num estúdio, fala com confiança olhando
para a câmera e gesticula com as mãos.", a fala citada e a orientação de qualidade. Uma tentativa
só, três minutos depois do controle que passou.

**Conclusão de 10/11/2026:** no 1.2, com esta foto, só passa o pedido da selfie parada, sem
nenhuma instrução de quem usa (6 de 6). Qualquer pedido com as instruções falhou: no lugar da
frase do Selfie, depois dela, com `task`, com outra frase citando a foto (0 de 4 no dia; em
07/11, 2 de 17). Não se sabe se o que derruba é o conteúdo destas instruções (apresentadora,
gesticular, que contraria "mantém a posição") ou qualquer texto a mais. Gasto do dia: US$ 0,09
(cinco pedidos, um pronto).

O formulário do Omni é feito de instruções livres, e é isso que o 1.2 não está aceitando. A
decisão é do dono: fixar o Omni na selfie parada (sem o campo Instruções), seguir testando outras
instruções (cada teste pede autorização) ou deixar o modelo de lado até o Google estabilizar.

## O que a documentação diz (pesquisa de 07/11/2026, depois dos testes)

Fontes: a página do Omni no Google (ai.google.dev/gemini-api/docs/omni) e o notebook oficial
`Get_started_Omni.ipynb` (github.com/google-gemini/cookbook). Nenhuma das duas ensina a
escrever fala; os guias de terceiros discordam (aspas ligariam a sincronia, ou virariam
legenda queimada). O que o Google diz e muda o pedido:

- **Vários planos por padrão:** sem pedir, o Omni monta cortes e narrativa. Para um plano só:
  "In a single unbroken scene", "In a single continuous shot", "No scene cuts". O pedido
  curto não tem isso (o antigo tinha "no cuts").
- **Negativas no próprio prompt** (não há negative prompt): "No dialogue or voiceover.",
  "No text overlay on screen.", "No extra sound effects".
- **Áudio:** sem descrever, o modelo escolhe a trilha (guias de terceiros: costuma pôr música).
- **Idioma:** só o inglês é avaliado; outros "podem funcionar, com resultado variável".
- **Imagem:** o modelo decide como usar a imagem pelo texto; para animar a foto, descrever o
  movimento (não redescrever a foto). O parâmetro `task` (`image_to_video`) existe só como
  último recurso; no OpenRouter vai como opção do provedor.
- **Filtros:** de segurança no prompt e no vídeo gerado, variando por região; pedido
  barrado é bloqueado. "Imagens com certas pessoas reconhecíveis" não são aceitas.
- **OpenRouter:** um relato (blog polonês) de "Video generation failed" em todo pedido ao 1.2
  no dia do lançamento; nada oficial. O OpenRouter não repassa o motivo da falha.

## Próximo passo

Gerar um vídeo com fala e instruções (sem a orientação de voz do Wan) e um sem fala; medir o
áudio de novo e decidir o tratamento (`treatAudio`); depois, liberar para todos (`access: "all"`).
