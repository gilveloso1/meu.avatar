# Protótipos do canvas de edição

Protótipo das partes difíceis do [canvas de edição](../../docs/canvas.md),
fora do site, sem banco e sem gastar créditos, com um exemplo de 3 ganchos →
corpo com b-roll, produto e música → 2 CTAs → final (6 versões).

- A tela e o código são os do site, em `src/canvas/` (o protótipo só monta a
  página com o exemplo e a mídia); ver [docs/canvas.md](../../docs/canvas.md).

## Rodar

```bash
npm install                       # na raiz
cd prototipos/canvas
npm run midia    # vídeos de exemplo (ffmpeg) em midia/
npm run build    # dist/proprio
python3 -m http.server -d dist 8765   # http://localhost:8765/proprio/
```

## Código próprio ou tldraw (29/10/2026)

Houve um segundo protótipo com o tldraw 5.5 (no histórico do git, pasta
`tldraw/`), com a mesma lógica. O dono escolheu o código próprio.

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
