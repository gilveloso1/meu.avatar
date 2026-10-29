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

## Construção e visual (29/10/2026)

- **Código próprio**, sem biblioteca (DOM e SVG, como o resto do site), escolhido
  pelo dono depois de comparar com o tldraw. O protótipo está em
  [prototipos/canvas/](../prototipos/canvas/README.md).
- **A interface segue o M3 onde for possível**: os componentes são os do site
  (`src/site/style.ts`: barra superior, botões, campos contornados, barra do
  player, folha lateral de 400 px, snackbar) e os que faltavam seguem as specs
  do M3 Expressive (switch, diálogo básico, tooltip simples, barra de
  ferramentas flutuante, lista expressiva). O que é só do canvas (blocos,
  portas, linhas) usa os tokens do M3: forma, elevação, tipografia e estados.
- **Visual e cores do M3.** Blocos do mesmo tipo têm a mesma cor e variam no tom
  para diferenciar: vídeo na paleta primária, imagem na secundária, áudio na
  terciária, 6 tons cada (`--bloco-<tipo>-<1 a 6>` e `--bloco-<tipo>-on`,
  gerados por `npm run tema`). O mesmo arquivo repete o tom; arquivo novo pega
  o tom menos usado do tipo. O bloco final vai em primary.
  Os quadros do vídeo e a imagem aparecem na cor do bloco (só a luz deles fica);
  com o mouse em cima ou escolhido, nas cores de verdade.

- **Área e prévia**: o grupo ganha um retângulo tracejado em volta de tudo o
  que entra nele (sequência, coberturas e som), com o chip do nome em cima. O
  bloco escolhido tem o botão de tocar no meio; o chip do grupo também. A prévia
  toca só aquilo, e uma linha em primary anda sobre o bloco ou o grupo.

## Em aberto

- Prévia no navegador: funciona nos protótipos (um elemento de mídia por
  trecho, desenhados num canvas 9:16).
- Esboço da tela no canvas de design, para aprovar.
