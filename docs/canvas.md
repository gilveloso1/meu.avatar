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
  Clicar num ponto vazio dentro da área de um grupo escolhe o grupo e leva a linha
  de reprodução até ali; o tocar (ou o Espaço) toca dali.
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

- **Folha da direita**: abas Prévia e Ajustes (abas principais fixas do M3, como na
  página do vídeo), sem título em cima. Na Prévia, o vídeo 9:16 ocupa a altura que
  sobra, com margens de 12 px; nos Ajustes, o título do que estiver escolhido e os
  campos (versões do Final, bloco, grupo, linha). Tocar algo
  (bloco, grupo ou versão) mostra a Prévia; a aba escolhida fica lembrada.
  Os botões de baixo (Exportar, Duplicar, Excluir) só aparecem na aba Ajustes.
- **Zoom no bloco**: dois cliques num bloco ampliam o canvas até ele ocupar a
  largura (a proporção não muda; se não cabe na altura, fica à vista a onda, embaixo).
  O zoom vai até 2000% e a onda é desenhada com 200 px por segundo, para ficar
  nítida de perto. "Ver tudo" volta. Com zoom, sombras, contornos, linhas, a linha
  de reprodução e o botão de tocar mantêm o tamanho da tela; a onda fica dentro dos
  cantos do bloco.
- **Onda do som**: sem ícone, de borda a borda do bloco, no corte de agora (o x da
  onda é o mesmo tempo do vídeo), para cortar vendo onde a fala começa e termina.
- **Prévia sem tela preta**: cada trecho é um vídeo empilhado no quadro (o
  navegador desenha, sem copiar para canvas); cada um já espera parado no começo
  do trecho; a troca só acontece quando o próximo tem imagem (até lá fica o
  anterior); se um trecho precisa carregar, o relógio da prévia espera por ele.

## No site (em teste)

- **Projetos** (`/projetos`), na barra superior depois de Modelos e Vídeos, só para
  o administrador (para os outros, 404): os projetos da pessoa em cards (o editado
  por último primeiro), com busca pelo nome, "Novo projeto" e, no menu de cada um,
  Abrir e Apagar (com uma página de confirmação; leva o projeto e os arquivos
  enviados para ele, os vídeos não).
- **Canvas de um projeto** (`/canvas/<id>`; `/canvas` sozinho leva à lista): a barra
  tem o nome do projeto, Bloco final, Do computador e Seus vídeos. Salva sozinho
  pouco depois de cada mudança (`POST /projetos/<id>/salvar`, o canvas em JSON, até
  1 MB); se falhar, um aviso. O nome muda nos Ajustes, sem nada escolhido.
- **Do computador**: o arquivo vai para o R2 (`projetos/<projeto>/<arquivo>`, tabela
  `project_files`), com os limites do site (imagem 10 MB, vídeo e áudio 50 MB), e o
  bloco usa o endereço de lá; não some ao recarregar.
- **Vídeo exportado**: nos Ajustes do Final, os mesmos campos dos modelos:
  Resolução (480p, 720p, 1080p, em botões conectados) e Formato (9:16, 16:9, 1:1,
  4:3, 3:4, no campo de seleção do site, com a explicação e o tamanho em pixels
  embaixo). O lado menor é o da resolução (720p em 16:9 = 1280 × 720). O quadro da
  Prévia segue o formato do Final. Vai no plano do Exportar. O campo de seleção do
  site ficou em `window.mdSelect` para servir também a campos postos depois.
- Cada projeto é só de quem o criou: de outra pessoa, nada abre, salva, recebe
  arquivo ou apaga (testes em `test/canvas.test.ts`).
- Tabelas `projects` e `project_files` (migration 0010). Os vídeos exportados não
  ficam no banco: são baixados (próxima etapa).
- Código em `src/canvas/` (tela.html, canvas.js, modelo.js, player.js,
  miniaturas.js); `npm run canvas` gera `src/site/canvas.ts`, que o Worker usa. A
  página do canvas libera `data:` nas imagens e `blob:` no fetch (miniaturas e a
  onda do som); as outras páginas não. As frases de erro vêm de `src/erros.ts` pelo config.
- O protótipo (`prototipos/canvas/`) usa a mesma tela, com o exemplo de 6 versões.

## Em aberto

- **Timeline embaixo do canvas, com zoom**, para o vídeo ou o áudio escolhido:
  cortar vendo a onda e os quadros de perto (a próxima etapa da edição fina).

- **Exportar de verdade**: o contêiner monta cada versão com ffmpeg, no tamanho
  escolhido, e a pessoa baixa; o vídeo não fica salvo.
- Esboço da tela no canvas de design, para aprovar.
