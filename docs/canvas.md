# Canvas de edição

O que o dono descreveu (29/10/2026) e o que já está no site.

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
  toca só aquilo, e uma linha em primary anda sobre o bloco ou o grupo; a
  linha tem uma alça em cima e pode ser arrastada. Tocando, o botão vira pausar.
- **Áudio do vídeo**: todo vídeo com som mostra o próprio áudio numa faixa presa
  logo embaixo da imagem, na mesma cor e tom do vídeo (corta e anda junto).
  - "Desvincular o áudio" cria uma **cópia** do som como bloco de áudio comum
    (terciária), logo embaixo e com o mesmo corte, sem ligação com o vídeo; o vídeo
    só deixa de mostrar e tocar o próprio som. As faixas que já havia descem uma.
  - No vídeo, "Vincular ao áudio" volta a mostrar e tocar o som dele; a cópia não
    muda (se as duas tocam no mesmo grupo, um aviso diz que o som está duas vezes).
  - No áudio que veio de um vídeo, "Vincular ao vídeo" volta a mostrar o vídeo do
    mesmo arquivo, com o corte e o volume dele, logo abaixo do grupo; o vídeo de
    onde veio não muda. A faixa que fica vazia fecha.
  - Apagar um não afeta o outro. O som somado tem até 8 faixas embaixo do grupo.
- **Corte**: no bloco escolhido, puxar a borda da esquerda ou da direita (sem
  desenho; o cursor vira a seta de redimensionar). A borda de seleção vai por dentro.

## No site (em teste)

- `/canvas`, só o administrador (para os outros, 404), com um card "Canvas de
  edição" (Em teste) na tela inicial. A barra tem Bloco final, Do computador e
  Seus vídeos (os vídeos prontos dos modelos que a pessoa usa).
- Começa vazio, com o aviso "Comece pelos seus vídeos" e o Final à direita.
- Nada fica salvo ainda: ao recarregar, volta vazio. O Exportar mostra o plano.
- Código em `src/canvas/` (tela.html, canvas.js, modelo.js, player.js,
  miniaturas.js); `npm run canvas` gera `src/site/canvas.ts`, que o Worker usa. A
  página libera `data:` nas imagens e `blob:` no fetch (miniaturas e a onda do
  som); as outras páginas não. As frases de erro vêm de `src/erros.ts` pelo config.
- O protótipo (`prototipos/canvas/`) usa a mesma tela, com o exemplo de 6 versões.

## Em aberto

- Salvar projetos (tabela no D1), arquivos do computador no R2 e o Exportar de
  verdade (ffmpeg no contêiner).
- Esboço da tela no canvas de design, para aprovar.
