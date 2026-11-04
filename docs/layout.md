# Checklist de layout das telas de dados

Para o painel do administrador (`/painel`) e qualquer tela nova de números, listas e cards.
Criado em 04/11/2026, depois de várias versões do painel recusadas pelo dono: cards esticados,
bases desalinhadas, em telas largas cards de ponta a ponta com espaço interno sobrando (em 1920 px,
o nome de um modelo ficava a 1797 px do valor dele) e, na correção, o painel encolhido numa coluna.

Toda tela passa pelos itens abaixo **antes do PR**, medindo no navegador em 375, 768, 900, 1280,
1600 e 1920 px (`resize_window` e as medidas por `javascript_tool`), não só olhando.

## Checklist

1. **Largura toda, como o resto do site.** O painel não encolhe nem fica centrado numa coluna
   estreita: no computador, todo o projeto ocupa a largura da tela. *Corrigido em 04/11/2026: uma
   versão limitou o painel a 1296 px (sugestão da Atlassian) e destoou das outras telas.*
2. **O espaço a mais vira coluna, não card maior (M3).** Até 839 px, um painel. De 840 px para
   cima, dois (`panes`): o principal flexível e o de apoio com largura fixa, 360 px no expandido e
   412 px do grande (1200 px) em diante. Três, só com uma folha lateral. *M3, painéis: "Fixed panes
   at this breakpoint are recommended to be 412dp"; "Don't use more than three panes"; espaço a mais
   não é "making the same thing bigger".*
3. **Distância de leitura.** Numa linha, rótulo e valor ficam perto (no painel de apoio, ou numa
   lista de colunas) ou ligados por uma barra que ocupa o meio (`modelBars` largo: nome, barra,
   vídeos, valor). Nunca um rótulo de um lado e o valor do outro de um card largo, com vazio no meio.
   Texto corrido com 40 a 60 caracteres por linha. *M3: "keep text between 40–60 characters per
   line"; Baymard: 50 a 75 caracteres.*
4. **O card tem o tamanho do conteúdo e nunca rola.** Nada de card esticado para igualar altura,
   de espaço interno sem conteúdo, nem de barra de rolagem dentro do card. *M3, cards: "Card size is
   determined by the elements it contains"; quando o conteúdo passa da tela, "the card scrolls within
   the screen", ou seja, quem rola é a tela.* Cards lado a lado na mesma linha têm a mesma estrutura;
   quando um é maior, é um mosaico (`.dash__mosaic`) e a grade alinha as bases.
5. **Cada painel tem título e corpo.** O título fica parado e o corpo rola por inteiro, com os
   cards dentro; a barra de rolagem começa embaixo do título. *M3: barras podem ocupar "a single
   pane".* Os painéis podem terminar em alturas diferentes.
6. **Hierarquia.** Cada aba abre com a fileira de números (um herói, display-large; os outros,
   display-small), no alto e à esquerda. *NN/g: o essencial "at-a-glance", numa tela.*
7. **Proximidade e ordem.** O que é relacionado fica junto, e as colunas de uma lista vão em ordem
   de importância, com as relacionadas lado a lado. *NN/g: "related columns should be adjacent".*
8. **Uma linha por item, só se couber.** A lista vira uma linha só quando o painel tem 600 px ou
   mais (consulta pelo contêiner, não pela janela); menor que isso, duas linhas. Colunas com
   largura fixa ou fração, nunca `auto` (cada item é uma grade própria).
9. **Números alinhados.** Textos de apoio dos números numa linha só; rótulos sem quebrar.
10. **Layout fixo a partir de 840 px.** A página tem a altura da janela e não rola (como a página
    do vídeo). Abas, chips, números e os títulos dos painéis ficam parados; o corpo de cada painel
    rola. *M3, barra do topo: ela fica e ganha cor quando o conteúdo rola por baixo.* No celular e no
    tablet, a página rola inteira.
11. **Lista que cresce sem limite tem paginação** (15 por página, `pager`): "16–30 de 65" e as
    setas no pé do card, como nas tabelas de dados do Material. Trocar de período ou de aba volta
    para a primeira página.
12. **Mesmo componente para a mesma coisa** (`statCard`, `detailsCard`, `providerCard`,
    `listItem`, `modelBars`), como manda "Reaproveitar componentes" no `CLAUDE.md`.

## Fontes (lidas em 04/11/2026)

- M3, breakpoints e painéis: <https://m3.material.io/foundations/layout/breakpoints>
- M3, cards: <https://m3.material.io/components/cards/guidelines>
- M3, painéis: <https://m3.material.io/foundations/layout/scaffold/panes>
- M3, barra do topo (rolagem): <https://m3.material.io/components/app-bars/guidelines>
- Android, layouts canônicos (painel de apoio 2/3 + 1/3):
  <https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts>
- NN/g, dashboards: <https://www.nngroup.com/articles/dashboards-preattentive/>
- NN/g, tabelas de dados: <https://www.nngroup.com/articles/data-tables/>
- Baymard, largura de linha: <https://baymard.com/blog/line-length-readability>
