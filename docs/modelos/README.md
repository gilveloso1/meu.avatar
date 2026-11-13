# Modelos: o que está sendo testado

Registro de todo modelo que o meu.avatar usa ou já testou: para que serve, o
estado, o que se viu e quanto custou. **Um arquivo por modelo**, nesta pasta,
com o resumo abaixo. **Antes de escolher ou montar um modelo, leia aqui.**
Depois de cada teste (bom ou ruim), atualize o arquivo do modelo e o resumo no
mesmo PR; modelo novo ganha arquivo novo.

Estados:

- **No ar**: liberado para todos (`access: "all"`).
- **Em teste**: estrutura no ar só para o administrador (`access: "admin"`), ou
  teste feito pelo terminal, sem estrutura.
- **Bloqueado**: o provedor recusa o uso pretendido. A estrutura fica como
  está (pode servir a outro uso); o motivo e a prova ficam aqui.
- **Desativado**: ninguém gera com ele (`off: true` na estrutura: sem card, sem página, fora do
  agente), mas o código e os testes ficam, e os vídeos que ele fez seguem abrindo, sem o Refazer.
  Religar é tirar o `off`.
- **Descartado**: testado e não serve; a estrutura sai.

Como registrar um teste: data, o que foi pedido (vídeo, foto, ajustes), o
resultado (com a mensagem do provedor, se falhou), o custo real e o próximo
passo. Vídeos de teste não vão para o repositório; diga onde estão (id no D1 ou
caminho no R2).

## Estimativa contra o custo real (revisão de 10/11/2026)

A estimativa do site (`cost` de cada estrutura, `estimate` em `src/structures/index.ts`) conferida,
modelo por modelo, com o custo gravado nos vídeos prontos (banco do site) e com a lista de preços
do OpenRouter do dia. Quando o provedor cobra segundos diferentes dos do vídeo, a regra diz
(`billed`: mínimo e teto). Refazer a conferência depois de cada teste novo.

| Modelo | Estimativa | Custo real | Resultado |
|---|---|---|---|
| Wan 3.0 e Wan 3.0 livre | preço da lista por segundo (US$ 0,05 em 480p, 0,10 em 720p), **mínimo de 5 s** | US$ 0,0425/s em 480p e 0,085 em 720p; 3 s e 4 s cobrados como 5 s | Corrigido: faltava o mínimo de 5 s (3 s em 480p saía US$ 0,15; cobra US$ 0,21). A estimativa segue uns 15% acima do real, porque o desconto depende de por onde o OpenRouter manda o pedido |
| Runway Aleph 2 | preço da lista por segundo, **no máximo 5 s**, mais US$ 0,20 de imagens | US$ 1,40 por pedido de 5,5 a 20,4 s, mais ≈ US$ 0,22 de imagens (US$ 1,62 a 1,66 no site) | Corrigido: 20 s saía US$ 5,80; agora US$ 1,60. A lista ainda diz por segundo: conferir a cada teste |
| ElevenLabs v4 e Fish Audio Drama 3 | preço da lista por caractere do **texto enviado** (emoções em inglês, juntas) | o site grava preço × caracteres enviados (a resposta do provedor não traz o custo) | Corrigido: a estimativa contava o texto digitado. O preço do Fish na lista subiu de US$ 0,000002 para 0,00001 por caractere em 10/11/2026 (os áudios gerados até a madrugada desse dia foram gravados pelo preço antigo); o site lê a lista, então acompanha |
| HeyGen Avatar IV (OpenRouter) | US$ 0,05/s, pela duração estimada da fala | US$ 0,047 a 0,055/s da duração estimada | Bate; a diferença é a duração real da fala |
| HeyGen Avatar IV (API direta) | US$ 0,0385/s, pela fala ou pelo áudio enviado | o site grava US$ 0,0385 × a duração que a HeyGen devolve (não lê a cobrança) | Bate com a regra; a cobrança de verdade só no painel da HeyGen |
| Grok Imagine Video 1.5 Lite | preço da lista por segundo mais a foto | US$ 0,09 por 4 s em 480p | Bate |
| mischief 1 | preço da lista por segundo | US$ 0,015 por 3 s em 480p | Bate |
| Gemini Omni 1.2 Flash e 1.1 | preço da lista por segundo, por resolução | US$ 0,556 por 8 s (1.2) e 0,4054 por 4 s (1.1), em 720p | Bate |
| Nano Banana 2.1 | tokens da imagem × preço (US$ 0,039 em 1K, 0,06 em 2K) | média de US$ 0,0398 em 1K (108 imagens) e 0,0555 em 2K (115) | Bate em 1K; em 2K a estimativa sai uns 8% acima |
| Seedance 2.0 | tokens do vídeo × preço | sem vídeo pronto (bloqueado) | Sem como conferir |
| FLUX Video Edit | preço da lista por segundo (US$ 0,03), pelos segundos do vídeo de origem | sem vídeo pronto (não testado) | Conferir no primeiro teste |

## Resumo

| Modelo | Uso | Estado | Estrutura |
|---|---|---|---|
| [Wan 3.0](wan-3.0.md) (`alibaba/wan-3.0`) | Avatar falando, a partir da foto e da fala | No ar | `wan.ts` |
| [Wan 3.0 livre](wan-3.0.md#wan-30-livre-wan-livrets-10112026) (`alibaba/wan-3.0`) | Cena livre para o agente: texto, primeiro e último quadro, referências, som, semente | Em teste, só o administrador. Primeiro e último quadro e sem som funcionam (10/11/2026); US$ 0,0425/s em 480p, mínimo de 5 s; falta testar referências | `wan-livre.ts` |
| [HeyGen Avatar IV](heygen-avatar-iv.md) (`heygen/avatar-iv`) | Avatar falando, voz pronta da HeyGen | Em teste. A API direta da HeyGen sai mais barata (US$ 0,0385/s, contra US$ 0,05/s) e aceita áudio próprio e voz clonada | `heygen.ts` |
| [Seedance 2.0](seedance-2.0.md) (`bytedance/seedance-2.0`) | Trocar avatar (vídeo + foto) | **Bloqueado** para vídeo com rosto realista | `seedance.ts` |
| [Runway Aleph 2](runway-aleph-2.md) (`runway/aleph-2`) | Trocar avatar (vídeo + 5 quadros com o rosto trocado) | **Desativado** em 13/11/2026: caro (US$ 1,62 por vídeo) e com quadros-chave montados por nós, o que a Direção pede para evitar. A receita do terceiro teste trocava o avatar e mantinha o áudio | `aleph.ts` |
| [FLUX Video Edit](flux-video-edit.md) (`black-forest-labs/flux-video-edit`) | Editar um vídeo pronto pelo texto (tirar, pôr ou trocar objetos, pessoas e o cenário) | Em teste, só o administrador, no site e no agente (`gerar_video` com `video`), desde 13/11/2026. Ainda sem teste real; US$ 0,03/s | `flux.ts` |
| [Gemini Nano Banana 2.1](gemini-nano-banana-2.1.md) (`google/gemini-nano-banana-2.1`) | Trocar o rosto nos quadros-chave do Aleph 2; esboço inicial dos vídeos (com ou sem foto de referência) | Em teste, dentro do `aleph.ts`. Estrutura de imagem só para o administrador: o melhor na comparação de 06/11/2026 (US$ 0,04 por imagem em 1K) | `imagem.ts` |
| `anthropic/claude-haiku-5.5` | Conferir o fundo dos quadros-chave do Aleph 2 | Em teste, dentro do `aleph.ts` (ver [runway-aleph-2.md](runway-aleph-2.md)) | — |
| [Grok Imagine Video 1.5 Lite](grok-imagine-video-1.5-lite.md) (`x-ai/grok-imagine-video-1.5-lite`) | Cena sem fala, a partir da foto | Em teste: fez as duas cenas pelo terminal (US$ 0,03/s em 720p); vem com som mesmo sem áudio. Estrutura só para o administrador, no ar desde 06/11/2026 | `grok.ts` |
| [mischief 1](mischief-1.md) (`tbc/mischief-1`) | Cena sem fala nem som, a partir da foto, só 16:9 e 3 ou 5 s | Em teste, só o administrador, desde 10/11/2026. Mãos no nível do Wan por US$ 0,015 (3 s, 480p) em uns 20 s; a foto vertical sai cortada em 16:9 | `mischief.ts` |
| [Gemini Omni 1.2 Flash](gemini-omni-1.2-flash.md) (`google/gemini-omni-1.2-flash`) | Avatar falando, parado e de frente (foto e fala), e cena sem pessoa pelas instruções, em clipes de 3 a 15 s. Com a foto de uma pessoa, o 1.2 recusa instruções livres (testes de 10/11/2026) | Em teste: estrutura só para o administrador desde 07/11/2026, primeiro vídeo em 07/11 (8 s, US$ 0,56, pronto em 54 s, fala exata, áudio limpo a −20 LUFS). US$ 0,07/s em 720p, com áudio (o mesmo preço do Google direto). O 1.1 fica no seletor Versão enquanto o 1.2 está instável (o Google passa o 1.1 para o 1.2 em 03/12/2026) | `omni.ts` |
| [Veo 3.1 Lite](veo-3.1-lite.md) (`google/veo-3.1-lite`) | Cena sem fala, a partir da foto | Em teste pelo terminal: fez uma cena e o filtro recusou a outra (US$ 0,03/s em 720p) | — |
| `bytedance-seed/seedream-5-0-flash` | Esboço inicial | Descartado para esboço com referência: manteve a pessoa do print em vez do avatar (ver [gemini-nano-banana-2.1.md](gemini-nano-banana-2.1.md)) | — |
| `qwen/qwen-image-2.1-turbo` | Esboço inicial | Opção barata (US$ 0,018): manteve o rosto, mas copiou o gesto da foto e sai em 576×1024 (ver [gemini-nano-banana-2.1.md](gemini-nano-banana-2.1.md)) | — |
| [ElevenLabs v4](elevenlabs-v4.md) (`elevenlabs/eleven-v4`) | Fala a partir do texto (o áudio vira o vídeo no HeyGen, como Meu áudio) | Em teste: estrutura só para o administrador desde 08/11/2026, 21 vozes prontas, US$ 0,00008 por caractere (uns US$ 0,07 por minuto). Sem voz clonada pelo OpenRouter | `voz.ts` |
| [Fish Audio Drama 3](fish-audio-drama-3.md) (`fish-audio/drama-3`) | Fala a partir do texto, com direção de atuação | Em teste: estrutura só para o administrador desde 08/11/2026, com as vozes oficiais do Fish (português do Brasil e de Portugal, inglês e espanhol, lidas do Fish); US$ 0,00001 por caractere na lista de 10/11/2026 (era 0,000002 nos testes de 08 a 10/11; uns US$ 0,01 por minuto). Voz clonada no ar desde 08/11/2026 (a gravação vai em cada pedido) | `voz.ts` |
| [Higgsfield Genjutsu](higgsfield-genjutsu.md) (fora do OpenRouter) | Trocar avatar | Não testado | — |
