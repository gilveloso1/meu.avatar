# Grok Imagine Video 1.5 Lite (`x-ai/grok-imagine-video-1.5-lite`): cenas sem fala

**Estrutura `grok` (`src/structures/grok.ts`), só para o administrador, desde 06/11/2026.**
Testado antes pelo terminal (`npm run gerar`). Uso: a cena
em que o avatar só reage, sem falar (o HeyGen Avatar IV sempre precisa de texto ou de
áudio e fala o que receber; ver [heygen-avatar-iv.md](heygen-avatar-iv.md)).

Pelo OpenRouter (`GET /api/v1/videos/models`, 06/11/2026): foto como primeiro quadro
(`frame_images`), 480p, 720p e 1080p, 1 a 15 s, sete formatos (9:16 entre eles).
US$ 0,03/s em 720p (US$ 0,14/s em 1080p), mais US$ 0,01 por foto.

## Testes de 06/11/2026

720p, 9:16, `generate_audio: false`. Vídeos só no computador (scratchpad da sessão), fora
do D1 e do R2.

| Teste | Foto | Duração | Custo real | Job |
|---|---|---|---|---|
| 1 | Avatar com os produtos na mesa (a dos testes do HeyGen) | 6 s | US$ 0,19 | `gen-vid-1793970519-DjyFe8sPL3MxO0X0RL0J` |
| 2 | A cena do susto (luva na boca, rosto iluminado pelo celular) do vídeo `d030b5f1` | 4 s | US$ 0,13 | `gen-vid-1793970628-jkplicgEN14cqt5OF96f` |

- **Teste 1:** fez o movimento pedido (sorri, olha os produtos e volta para a câmera),
  com a boca fechada, o rosto e os rótulos iguais aos da foto. Saiu em 720×1264, não
  720×1280.
- **Teste 2:** o movimento do vídeo `d030b5f1` ("Imóvel, sem piscar. Prende a respiração,
  as narinas abrem de leve e os olhos tremem um pouco, fixos no celular"): ficou parada,
  luva na boca, olhos arregalados e tremendo de leve, a mesma luz. É a cena que o HeyGen
  não fez (lá ela começou sem a mão na boca e disse "Sem fala.").
- **Som:** mesmo com `generate_audio: false` o vídeo vem com faixa de áudio. No teste 1,
  som de ambiente (média de −24 dB, pico de −11 dB); no 2, quase silêncio (−59 dB). Na
  cena muda, o som precisa sair ou ficar por baixo na edição.
- Ficou pronto em menos de 1 min.

## Estrutura (06/11/2026)

Formulário: Movimento (obrigatório, até 1.000 caracteres), foto do avatar (obrigatória,
primeiro quadro), duração, resolução e formato, todos da lista do modelo. O prompt é o
movimento seguido do guia `GROK_GUIDE` (não fala, mesma pessoa e cena da foto, sem cortes
nem texto). O vídeo guarda o texto vazio e o movimento em `extra`. Sem tratamento de áudio
e sem Edição rápida.

Custo na tela: o preço da resolução por segundo vezes a duração, mais o da foto
(`CostRule.extraSku`). Em 720p, 6 s: US$ 0,19.

## Próximo passo

Gerar o primeiro vídeo pelo site e decidir se libera para todos (`access: "all"`).
