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

## Próximo passo

Gerar um vídeo com fala e instruções (sem a orientação de voz do Wan) e um sem fala; medir o
áudio de novo e decidir o tratamento (`treatAudio`); depois, liberar para todos (`access: "all"`).
