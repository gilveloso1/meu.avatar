# Veo 3.1 Lite (`google/veo-3.1-lite`): cenas sem fala

Em teste desde 06/11/2026, pelo terminal (`npm run gerar`), sem estrutura. Mesmo uso do
[Grok Imagine 1.5 Lite](grok-imagine-video-1.5-lite.md): a cena em que o avatar só reage.

Pelo OpenRouter (06/11/2026): foto como primeiro ou último quadro, 720p e 1080p, só
4, 6 ou 8 s, 16:9 e 9:16. Sem áudio, US$ 0,03/s em 720p (com áudio, US$ 0,05/s).
Repassa `personGeneration`, `negativePrompt` e `enhancePrompt`.

## Testes de 06/11/2026

720p, 9:16, `generate_audio: false`, as mesmas fotos e movimentos do Grok.

| Teste | Foto | Duração | Resultado | Job |
|---|---|---|---|---|
| 1 | Avatar com os produtos na mesa | 6 s | Pronto, US$ 0,18 | `gen-vid-1793970519-pLvYnMZy4quXoMxMH8du` |
| 2 | A cena do susto do vídeo `d030b5f1` | 4 s | **Recusado**: "Video generation completed with no output (content may have been filtered)", sem custo no job | `gen-vid-1793970628-rPnFKiPhLynku6kg4n6l` |

- **Teste 1:** fez o movimento pedido, com a boca fechada, o rosto e os rótulos iguais;
  720×1280, sem faixa de áudio. Pronto em cerca de 1 min.
- **Teste 2:** o filtro do Google recusou. Não se sabe se foi a foto (mão cobrindo a boca,
  cara de susto) ou a pessoa; não foi tentado `personGeneration`.

## Próximo passo

Recusa sem motivo numa cena comum de reação pesa contra: o Grok Lite fez a mesma cena
pelo mesmo preço. Só voltar a ele se o Grok falhar.
