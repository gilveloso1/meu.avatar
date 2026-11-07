// Prepara o texto da narração para a voz sintética falar certo (números por extenso, sem símbolos).
// A mesma função é usada pelo Kokoro e pelo ElevenLabs, então as legendas sempre batem com o que foi falado.

const UNID = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [];
  if (c) partes.push(CENT[c]);
  if (r) {
    if (r < 20) partes.push(UNID[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DEZ[d]} e ${UNID[u]}` : DEZ[d]);
    }
  }
  return partes.join(' e ');
}

export function numeroPorExtenso(n) {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return String(n);
  if (n === 0) return 'zero';
  const escalas = [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']];
  const partes = [];
  let resto = n;
  for (const [v, sing, plur] of escalas) {
    const q = Math.floor(resto / v);
    if (q) {
      if (v === 1e3) partes.push(q === 1 ? 'mil' : `${ate999(q)} mil`);
      else partes.push(`${ate999(q)} ${q === 1 ? sing : plur}`);
      resto %= v;
    }
  }
  if (resto) partes.push(ate999(resto));
  // "e" antes do último bloco quando ele é pequeno (ex.: dois mil e cem; mil e quinhentos)
  if (partes.length > 1 && (resto === 0 || resto < 100 || resto % 100 === 0)) {
    const ult = partes.pop();
    return `${partes.join(' ')} e ${ult}`.replace(/ e (milhões?|bilhões?|bilhão|milhão|mil)\b/, ' $1');
  }
  return partes.join(' ');
}

export function normalizarNarracao(texto) {
  const avisos = [];
  let t = texto
    .replace(/\r/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/&/g, ' e ')
    .replace(/%/g, ' por cento')
    .replace(/\bR\$\s*([\d.,]+)/g, (_, v) => `${v} reais`)
    .replace(/\bkm\/h\b/gi, 'quilômetros por hora')
    .replace(/\bkm\b/gi, 'quilômetros')
    .replace(/(\d)\s*m²/g, '$1 metros quadrados')
    .replace(/(\d)\s*kg\b/gi, '$1 quilos')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s{2,}/g, ' ');

  // números: 1.000 / 2,5 / 20
  t = t.replace(/\d[\d.]*(?:,\d+)?/g, (m) => {
    const limpo = m.replace(/\.(?=\d{3}(\D|$))/g, '');
    const [inteira, dec] = limpo.split(',');
    const n = Number(inteira);
    if (!Number.isFinite(n)) return m;
    let r = numeroPorExtenso(n);
    if (dec) r += ` vírgula ${dec.split('').map((d) => UNID[Number(d)]).join(' ')}`;
    avisos.push(`número "${m}" escrito por extenso`);
    return r;
  });
  return { texto: t.trim(), avisos };
}
