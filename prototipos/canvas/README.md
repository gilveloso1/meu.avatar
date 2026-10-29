# Protótipos do canvas de edição

Dois protótipos das partes difíceis do [canvas de edição](../../docs/canvas.md),
fora do site, sem banco e sem gastar créditos. A mesma lógica (`comum/`) e o
mesmo exemplo (3 ganchos → corpo com b-roll, produto e música → 2 CTAs → final,
6 versões) nos dois; muda só quem desenha o canvas e trata os gestos.

- `proprio/`: código próprio (DOM e SVG, sem biblioteca), como o resto do site.
- `tldraw/`: com o tldraw 5.5 (React). Blocos são uma forma própria, ligações
  são as setas dele.
- `comum/modelo.js`: grupos, coberturas, versões e a linha do tempo, tirados só
  da posição dos blocos (testes em `comum/modelo.test.js`).
- `comum/player.js`: a prévia de uma versão no navegador, sem montar arquivo.

## Rodar

```bash
cd prototipos/canvas
npm install
npm run midia    # vídeos de exemplo (ffmpeg) em midia/
npm run build    # dist/proprio e dist/tldraw
npm run teste
python3 -m http.server -d dist 8765   # http://localhost:8765/proprio/
```

## O que se viu (29/10/2026)

- **Os dois fazem o que o canvas pede**: juntar encostando, cobrir soltando
  em cima, somar som embaixo, cortar pelas pontas (o que vem depois acompanha),
  ligar, contar versões e tocar a prévia.
- **O tldraw dá de graça**: seleção de vários, alinhamento, copiar e colar,
  desfazer, minimapa, setas presas aos blocos, teclado e acessibilidade. Mas o
  essencial (encaixe, cobertura, corte, versões, prévia) foi escrito por nós
  nos dois.
- **Contra o tldraw**: exige licença paga para uso comercial (sem chave, em
  produção, ele para de desenhar em 5 s; o protótipo roda no modo de
  desenvolvimento e mostra "Get a license for production"). Traz React e
  ~2,2 MB de script, e as setas e a interface são dele (precisam de ajuste para
  seguir o M3). O corte em grupo e o encaixe tiveram de ser enxertados nos
  ganchos dele (`onResizeEnd`, `onTranslateEnd`).
- **Contra o código próprio**: seleção de vários, copiar e colar, minimapa e
  acessibilidade do canvas ainda faltam e custam trabalho.
