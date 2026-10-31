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
- **Bloco final**: recebe as linhas e mostra as variações possíveis. Exporta
  todas ou só uma.

## Regras

- Só os originais (blocos) ficam no banco. As variações não são salvas: são
  montadas na exportação e ficam 24 horas para baixar. Para usar uma variação como bloco, a pessoa importa
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
  campos (Final, bloco, grupo, linha). Tocar algo
  (bloco, grupo ou variação) mostra a Prévia; a aba escolhida fica lembrada.
- **Variações no card Final**: cada caminho até o Final é uma variação, numerada na
  ordem das ligações ("Variação 2", o mesmo nome no arquivo exportado; o número muda
  se as ligações mudarem). O card tem até 6 linhas e 8 colunas e usa o maior
  número de linhas que fecha o retângulo (8 = 4 × 2, 15 = 5 × 3, 24 = 6 × 4); sem isso,
  6 linhas e a última coluna incompleta. Com 1 ou 2 colunas, "Variação 1"; com 3,
  "V. 13"; com 4 ou mais, só o número, com a escolhida numa linha em cima. Tocar numa variação toca na Prévia, sem sair do
  canvas, e destaca os blocos e as linhas dela, apagando o resto; o destaque fica
  depois de pausar e sai ao clicar fora do Final. As setas ← e → passam de uma para
  outra, com o Final escolhido. O botão direito no card abre o menu para baixar
  a variação do clique (fora de uma, a escolhida) ou todas, pela mesma exportação; ele não
  toca nem muda a escolhida. Com um bloco, grupo ou linha selecionado, as
  variações em que ele entra ganham um destaque suave no card. Cada Final tem até 48 variações, o mesmo limite de uma
  exportação: a ligação que passaria disso é recusada, com um aviso. Projeto antigo com
  mais ligações mostra as 48 primeiras e o aviso no card.
  Os botões de baixo (Exportar, Duplicar, Excluir) só aparecem na aba Ajustes.
- **Barra de baixo**: desfazer, refazer, zoom, Ver tudo e Organizar, em 48 px. A roda do
  mouse com Ctrl dá cerca de 23% por giro, e o zoom anda até lá em alguns quadros.
- **Organizar**: cada grupo numa coluna, depois de tudo o que vem antes dele e perto dos
  que ligam a ele; cada Final à direita, na altura do que chega a ele. Desfazer volta tudo.
- **Zoom no bloco**: dois cliques num bloco ampliam o canvas até ele ocupar a
  largura (a proporção não muda; se não cabe na altura, fica à vista a onda, embaixo).
  O zoom vai até 800% e a onda é desenhada com 200 px por segundo, para ficar
  nítida de perto. "Ver tudo" volta. Com zoom, sombras, contornos, linhas, a linha
  de reprodução e o botão de tocar mantêm o tamanho da tela; a onda fica dentro dos
  cantos do bloco.
- **Miniaturas**: o quadro do vídeo sai com até 720 px de altura, nítido no zoom de 800%;
  a imagem usa o próprio arquivo.
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
  1 MB); se falhar, um aviso. O nome muda na barra superior (um clique no título; sair do campo salva, Esc desiste) ou
  nos Ajustes, sem nada escolhido, onde também ficam os dados do projeto: criado em,
  modificado em, criado por, blocos e variações.
- **Do computador**: o arquivo vai para o R2 (`projetos/<projeto>/<arquivo>`, tabela
  `project_files`), com os limites do site (imagem 10 MB, vídeo e áudio 50 MB), e o
  bloco usa o endereço de lá; não some ao recarregar.
- **Ajustes do Final**: um card com Variações e Duração, depois Qualidade e formato,
  a última exportação e, presos embaixo, Baixar a variação escolhida e Baixar todas (os
  mesmos nomes do menu). **Qualidade e formato**: os mesmos campos dos modelos:
  Resolução (480p, 720p, 1080p, em botões conectados) e Formato (9:16, 16:9, 1:1,
  4:3, 3:4, no campo de seleção do site, com a explicação e o tamanho em pixels
  embaixo). O lado menor é o da resolução (720p em 16:9 = 1280 × 720). O quadro da
  Prévia segue o formato do Final. Vai no plano do Exportar. O campo de seleção do
  site ficou em `window.mdSelect` para servir também a campos postos depois.
- Cada projeto é só de quem o criou: de outra pessoa, nada abre, salva, recebe
  arquivo ou apaga (testes em `test/canvas.test.ts`).
- Tabelas `projects` e `project_files` (migration 0010).
- **Exportar** (`src/exportar.ts`, `container/exportar.py`, tabela `exports`, migration
  0013): o Worker lê o projeto **salvo** e monta o plano com `exportWork` (`modelo.js`).
  Cada grupo vira um trecho (H.264 sem B-frames e FLAC), guardado em
  `trechos/<hash>.mkv` pelo conteúdo: grupo igual não é refeito, nem entre exportações. A versão também: mesma lista de
  trechos, mesmo arquivo, em `exportacoes/versoes/<hash>.mp4`, reaproveitado por 24 horas;
  exportar sem mudar nada não chama o contêiner. Mudou o que os trechos geram: suba
  `SEGMENT_VERSION` (`src/exportar.ts`). Cada trecho sai em −14 LUFS, como o resto do site,
  com ganho e limitador: a mistura é a que a pessoa fez, e o bloco mais alto diz o nível (só
  um som em 30% fica em 30%).
  Cada versão é a emenda dos trechos: vídeo copiado, só o som vira AAC. A imagem cobre o
  quadro, como na prévia, a 30 quadros por segundo. Um passo por vez: a tela chama o
  próximo assim que o anterior acaba; se ela fechar, o agendamento termina. Bloco só
  entra com vídeo que a pessoa pode usar ou arquivo do próprio projeto. Os vídeos ficam
  24 horas para baixar; cada exportação vai até 50 versões (`MAX_EXPORTAR`), um a um ou em ZIP sem compressão, montado no Worker.
- Código em `src/canvas/` (tela.html, canvas.js, modelo.js, player.js,
  miniaturas.js); `npm run canvas` gera `src/site/canvas.ts`, que o Worker usa. A
  página do canvas libera `data:` nas imagens e `blob:` no fetch (miniaturas e a
  onda do som); as outras páginas não. As frases de erro vêm de `src/erros.ts` pelo config.
- O protótipo (`prototipos/canvas/`) usa a mesma tela, com o exemplo de 6 versões.

## Em aberto

- **Timeline embaixo do canvas, com zoom**, para o vídeo ou o áudio escolhido:
  cortar vendo a onda e os quadros de perto (a próxima etapa da edição fina).

- Esboço da tela no canvas de design, para aprovar.
