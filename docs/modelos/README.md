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
- **Descartado**: testado e não serve; a estrutura sai.

Como registrar um teste: data, o que foi pedido (vídeo, foto, ajustes), o
resultado (com a mensagem do provedor, se falhou), o custo real e o próximo
passo. Vídeos de teste não vão para o repositório; diga onde estão (id no D1 ou
caminho no R2).

## Resumo

| Modelo | Uso | Estado | Estrutura |
|---|---|---|---|
| [Wan 3.0](wan-3.0.md) (`alibaba/wan-3.0`) | Avatar falando, a partir da foto e da fala | No ar | `wan.ts` |
| [HeyGen Avatar IV](heygen-avatar-iv.md) (`heygen/avatar-iv`) | Avatar falando, voz pronta da HeyGen | Em teste | `heygen.ts` |
| [Seedance 2.0](seedance-2.0.md) (`bytedance/seedance-2.0`) | Trocar avatar (vídeo + foto) | **Bloqueado** para vídeo com rosto realista | `seedance.ts` |
| [Runway Aleph 2](runway-aleph-2.md) (`runway/aleph-2`) | Trocar avatar (vídeo + 5 quadros com o rosto trocado) | Em teste: a receita do terceiro teste troca o avatar e mantém o áudio. Cobrou US$ 1,40 por pedido até 20 s, mais ≈ US$ 0,22 de imagens | `aleph.ts` |
| [Gemini Nano Banana 2.1](gemini-nano-banana-2.1.md) (`google/gemini-nano-banana-2.1`) | Trocar o rosto nos quadros-chave do Aleph 2 | Em teste, dentro do `aleph.ts` | — |
| `anthropic/claude-haiku-5.5` | Conferir o fundo dos quadros-chave do Aleph 2 | Em teste, dentro do `aleph.ts` (ver [runway-aleph-2.md](runway-aleph-2.md)) | — |
| [Higgsfield Genjutsu](higgsfield-genjutsu.md) (fora do OpenRouter) | Trocar avatar | Não testado | — |
