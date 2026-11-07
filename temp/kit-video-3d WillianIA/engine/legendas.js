// Legendas estilo "Shorts": poucas palavras por vez, em caixa alta, com a palavra falada em destaque.
// Entrada: palavras = [{ palavra, inicio, fim }] (segundos) — gerado por `node tools/voz.mjs gerar`.

export function criarLegendas(container, palavras, cfg = {}) {
  const porBloco = cfg.palavrasPorBloco ?? 1; // padrão: uma palavra por vez, como nos Shorts de referência
  const maiusculas = cfg.maiusculas ?? false; // padrão: frase normal, como nos Shorts de referência
  const fimDeFrase = /[.!?…]+["”')\]]*$/;

  const blocos = [];
  let atual = [];
  for (const w of palavras) {
    atual.push(w);
    const quebra = fimDeFrase.test(w.palavra) || (/[,;:]$/.test(w.palavra) && atual.length >= 2) || atual.length >= porBloco;
    if (quebra) { blocos.push(atual); atual = []; }
  }
  if (atual.length) blocos.push(atual);

  const janelas = blocos.map((b, i) => {
    const de = b[0].inicio - 0.04;
    const fimFala = b[b.length - 1].fim + 0.35;
    const proximo = blocos[i + 1] ? blocos[i + 1][0].inicio - 0.04 : Infinity;
    return { de, ate: Math.min(fimFala, proximo) };
  });

  container.className = 'legenda';
  if (cfg.corDestaque) container.style.setProperty('--destaque', cfg.corDestaque);
  if (cfg.tamanho) container.style.setProperty('--tam-legenda', String(cfg.tamanho));
  if (cfg.posicaoY !== undefined) container.style.setProperty('--pos-legenda', String(cfg.posicaoY));

  let blocoAtual = -2;
  let spans = [];

  function mostrar(i) {
    container.textContent = '';
    spans = blocos[i].map((w) => {
      const s = document.createElement('span');
      s.textContent = maiusculas ? w.palavra.toUpperCase() : w.palavra;
      container.appendChild(s);
      container.appendChild(document.createTextNode(' '));
      return s;
    });
  }

  return {
    atualizar(t) {
      let i = -1;
      for (let k = 0; k < janelas.length; k++) {
        if (t >= janelas[k].de && t < janelas[k].ate) { i = k; break; }
      }
      if (i !== blocoAtual) {
        blocoAtual = i;
        if (i < 0) { container.textContent = ''; container.style.visibility = 'hidden'; spans = []; }
        else { container.style.visibility = 'visible'; mostrar(i); }
      }
      if (i >= 0) {
        const ws = blocos[i];
        let ativa = -1;
        for (let k = 0; k < ws.length; k++) if (ws[k].inicio <= t) ativa = k;
        spans.forEach((s, k) => s.classList.toggle('ativa', k === ativa));
      }
    },
  };
}
