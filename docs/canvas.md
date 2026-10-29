# Canvas de edição (proposto, 29/10/2026)

O que o dono descreveu, para virar esboço e depois PRs. Ainda sem tela
aprovada nem código.

## Ideia

Um canvas infinito por projeto, como o Figma, onde a pessoa monta vídeos com
blocos. Cada bloco é gerado uma vez e entra em quantas versões ela quiser: as
variações saem das conexões, não de gerar de novo. Menos tempo de edição e
menos custo.

## Peças

- **Projeto**: um canvas infinito (arrastar, zoom). Cabe qualquer arranjo:
  blocos soltos, vários grupos, várias conexões e vários blocos finais.
- **Bloco**: vídeo, imagem, áudio etc., gerado aqui ou importado. A largura é
  a duração; dá para encurtar no começo e no fim.
- **Juntar**: blocos encostados lado a lado formam uma sequência fixa (corte
  seco), como numa linha do tempo. Juntos, viram um grupo.
- **Sobrepor**: um bloco em cima de outro cobre a imagem dele naquele trecho,
  como um corte para o b-roll; arrastar para os lados escolhe o momento. Um
  b-roll também pode ficar entre dois blocos, como trecho próprio.
- **Som**: em qualquer bloco, tirar o som, manter, sobrepor (música, narração)
  e ajustar o volume. O resultado é o que a pessoa arrumou.
- **Conectar (linhas)**: a linha liga uma parte à seguinte e é o que cria
  variações. Elas se multiplicam: 3 ganchos ligados a um corpo, e o corpo a
  2 CTAs, dão 3 × 2 = 6 vídeos.
- **Bloco final**: recebe as linhas e mostra as versões possíveis. Exporta
  todas ou só uma.

## Regras

- Só os originais (blocos) ficam no banco. As variações não são salvas: são
  montadas na exportação. Para usar uma variação como bloco, a pessoa importa
  o vídeo exportado.
- Montar não chama modelo de vídeo: é ffmpeg no contêiner (custo quase zero).
  Gerar um bloco segue as estruturas de `src/structures/`, com o custo antes.
- O canvas tem de atender a essas exigências antes de qualquer escolha de
  construção (código próprio ou biblioteca, a combinar com o dono).

## Em aberto

- Construção: código próprio ou biblioteca (tldraw, React Flow). Decidir
  depois de um protótipo das partes difíceis.
- Prévia no navegador de uma versão montada (tocar a sequência com cortes,
  sobreposições e volumes) antes de exportar.
- Esboço da tela no canvas de design, para aprovar.
