# Checklist de layout das telas de dados

Para o painel do administrador (`/painel`) e qualquer tela nova de números, listas e cards.
Criado em 04/11/2026, depois de várias versões do painel recusadas pelo dono: cards esticados,
bases desalinhadas, em telas largas cards de ponta a ponta com espaço interno sobrando (em 1920 px,
o nome de um modelo ficava a 1797 px do valor dele) e, na correção, o painel encolhido numa coluna.

Toda tela passa pelos itens abaixo **antes do PR**, medindo no navegador em 375, 768, 1280, 1600 e
1920 px (`resize_window` e as medidas por `javascript_tool`), não só olhando.

## Checklist

1. **Largura toda, como o resto do site.** O painel não encolhe nem fica centrado numa coluna
   estreita: no computador, todo o projeto ocupa a largura da tela. *Corrigido em 04/11/2026: uma
   versão limitou o painel a 1296 px (sugestão da Atlassian) e destoou das outras telas.*
2. **O espaço a mais vira coluna, não card maior (M3).** Até 839 px, um painel. De 840 px para
   cima, dois: o principal com 2/3 e o de apoio com 1/3. Do extra-grande (1600 px) para cima, três,
   quando o apoio tem dois grupos (`panes(principal, [grupo, grupo])`). *M3: "Additional space
   doesn't just mean making the same thing bigger"; "Extra-large breakpoints: Consider using three
   panes"; Android: o principal com "about two thirds".*
3. **Distância de leitura.** Numa linha, rótulo e valor ficam perto (num painel de 1/3, ou numa
   lista de colunas) ou ligados por uma barra que ocupa o meio (`modelBars` largo: nome, barra,
   vídeos, valor). Nunca um rótulo de um lado e o valor do outro de um card largo, com vazio no meio.
   Texto corrido com 40 a 60 caracteres por linha. *M3: "keep text between 40–60 characters per
   line"; Baymard: 50 a 75 caracteres.*
4. **O card tem o tamanho do conteúdo.** Nada de card esticado para igualar altura nem de espaço
   interno sem conteúdo. *M3: "Card size is determined by the elements it contains".* Cards lado a
   lado na mesma linha têm a mesma estrutura (mesmas linhas), então a mesma altura; quando um é
   maior, é um mosaico (`.dash__mosaic`) e a grade alinha as bases. Exceção pedida pelo dono: no layout fixo, o
   card de lista que fecha uma coluna (máquinas, falhas, tokens) desce até o fim dela, para as
   colunas terminarem na mesma linha; a paginação fica no pé dele.
5. **Painéis são colunas independentes.** O principal e o de apoio podem terminar em alturas
   diferentes (são painéis, não cards de uma mesma linha); dentro de cada um, os grupos se empilham
   com 8 px entre cards.
6. **Hierarquia.** Cada aba abre com a fileira de números (um herói, display-large; os outros,
   display-small), no alto e à esquerda. *NN/g: o essencial "at-a-glance", numa tela.*
7. **Proximidade e ordem.** O que é relacionado fica junto, e as colunas de uma lista vão em ordem
   de importância, com as relacionadas lado a lado. *NN/g: "related columns should be adjacent".*
8. **Uma linha por item, só se couber.** A lista vira uma linha só quando o painel tem 600 px ou
   mais (consulta pelo contêiner, não pela janela); menor que isso, duas linhas. Colunas com
   largura fixa ou fração, nunca `auto` (cada item é uma grade própria).
9. **Números alinhados.** Textos de apoio dos números numa linha só; rótulos sem quebrar.
10. **Layout fixo a partir de 840 px.** A página tem a altura da janela e não rola (como a página
    do vídeo). Abas, chips, números e os títulos dos grupos ficam parados; **só o corpo rola**: a
    lista dentro do card que cresce (`dash__fill`), com o pé do card (paginação, totais, notas)
    sempre visível. A barra de rolagem nunca começa num título. No celular e no tablet, a página
    rola inteira.
11. **Lista que cresce sem limite tem paginação** (15 por página, `pager`): "16–30 de 65" e as
    setas no pé do card, como nas tabelas de dados do Material. Trocar de período ou de aba volta
    para a primeira página.
12. **Mesmo componente para a mesma coisa** (`statCard`, `detailsCard`, `providerCard`,
    `listItem`, `modelBars`), como manda "Reaproveitar componentes" no `CLAUDE.md`.

## Fontes (lidas em 04/11/2026)

- M3, breakpoints e painéis: <https://m3.material.io/foundations/layout/breakpoints>
- M3, cards: <https://m3.material.io/components/cards/guidelines>
- Android, layouts canônicos (painel de apoio 2/3 + 1/3):
  <https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts>
- NN/g, dashboards: <https://www.nngroup.com/articles/dashboards-preattentive/>
- NN/g, tabelas de dados: <https://www.nngroup.com/articles/data-tables/>
- Baymard, largura de linha: <https://baymard.com/blog/line-length-readability>
