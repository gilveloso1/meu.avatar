/**
 * Inspeção da animação em código (docs/api.md, inspecionar_animacao): a mesma página do render
 * (pagina()), aberta no Chrome do HyperFrames sem fazer vídeo. A cada instante, tl.seek(t) e a
 * geometria do DOM: os elementos visíveis e os problemas que no exemplo de 8 s só se viram por
 * imagem (título que quebrou, "%" fora do card, texto cortado embaixo). A resposta é texto curto:
 * no primeiro instante, todos os elementos; nos outros, só o que mudou. O mosaico de quadros, só
 * quando pedido.
 *
 * As páginas são servidas pela interceptação do Puppeteer (endereço de mentira, sem rede): pelo
 * file:// o Chrome recusa as fontes.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = "http://animacao.local/";
/** A altura de cada quadro no mosaico, a mesma do ver_quadros (container/exportar.py). */
const ALTURA_QUADRO = 360;
const MAX_ELEMENTOS = 80;
const MAX_ERROS = 5;

let chrome = null;
/**
 * O Chrome que o HyperFrames baixou na imagem (`hyperframes browser ensure`). No computador,
 * CHROME aponta para o Chrome instalado (o servidor roda fora do contêiner para testar).
 */
export function caminhoDoChrome(hyperframes) {
  if (process.env.CHROME) return Promise.resolve(process.env.CHROME);
  chrome ??= new Promise((resolve, reject) => {
    const p = spawn(hyperframes, ["browser", "path"], { env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" } });
    let saida = "";
    p.stdout.on("data", (b) => (saida += b));
    p.on("error", reject);
    p.on("close", (code) => {
      const linha = saida.trim().split("\n").pop()?.trim();
      if (code === 0 && linha) resolve(linha);
      else reject(new Error(`hyperframes browser path saiu com ${code}`));
    });
  }).catch((err) => {
    chrome = null;
    throw err;
  });
  return chrome;
}

/**
 * Roda dentro da página. Põe em window.__inspecao a linha do tempo e a medição de um instante;
 * os nomes dos elementos (id, ou tag.classe com [n] quando se repete) valem para todos os instantes.
 */
function instalar({ familias, maxElementos }) {
  const IGNORA = new Set(["SCRIPT", "STYLE", "BR", "TEMPLATE", "LINK", "META"]);
  const GENERICAS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "emoji", "math", "inherit", "initial"]);
  const ESPECIAIS = new Set(["duration", "ease", "delay", "stagger", "repeat", "repeatDelay", "yoyo", "yoyoEase", "overwrite", "immediateRender", "lazy", "runBackwards", "startAt", "data", "id", "paused", "reversed", "inherit", "keyframes", "callbackScope", "parent"]);
  const root = document.getElementById("root");
  const r2 = (n) => Math.round(n * 100) / 100;
  const nomes = new Map();
  const contagem = new Map();
  const base = (e) => (e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${e.classList[0] ? `.${e.classList[0]}` : ""}`);
  for (const e of root.querySelectorAll("*")) contagem.set(base(e), (contagem.get(base(e)) ?? 0) + 1);
  const vistos = new Map();
  function nome(e) {
    if (e === root) return "#root";
    if (nomes.has(e)) return nomes.get(e);
    const b = base(e);
    const n = (vistos.get(b) ?? 0) + 1;
    vistos.set(b, n);
    const s = !e.id && (contagem.get(b) ?? 1) > 1 ? `${b}[${n}]` : b;
    nomes.set(e, s);
    return s;
  }
  for (const e of root.querySelectorAll("*")) nome(e);

  function linhaDoTempo() {
    const tweens = [];
    let fim = 0;
    // escala: quanto um segundo da linha vale na página (timeScale de quem está por fora; a escala que o
    // site põe para esticar a animação com a fala é um timeScale nos filhos de tl).
    const percorre = (linha, desloca, escala) => {
      for (const c of linha.getChildren(false, true, true)) {
        const inicio = desloca + c.startTime() * escala;
        const passo = escala / (c.timeScale() || 1);
        if (c instanceof gsap.core.Timeline) {
          percorre(c, inicio, passo);
          continue;
        }
        const alvos = c.targets().filter((a) => a instanceof Element);
        // O tl.set({}, {}, duração) da página e os objetos do agente não são elementos.
        if (!alvos.length) continue;
        const termina = inicio + c.totalDuration() * passo;
        fim = Math.max(fim, termina);
        const props = [...new Set([...Object.keys(c.vars), ...Object.keys(c.vars.startAt ?? {})])].filter((k) => !ESPECIAIS.has(k) && !k.startsWith("on"));
        const quem = alvos.slice(0, 3).map(nome).join(" ") + (alvos.length > 3 ? ` +${alvos.length - 3}` : "");
        const quando = termina - inicio < 0.005 ? `${r2(inicio)}` : `${r2(inicio)}-${r2(termina)}`;
        tweens.push(`${quando} ${quem} ${props.join(",")}`);
      }
    };
    percorre(window.__timelines.main, 0, 1);
    return { tweens, fim: r2(fim) };
  }

  const opacidade = (e) => {
    let o = 1;
    for (let x = e; x && x !== root.parentElement; x = x.parentElement) o *= Number(getComputedStyle(x).opacity);
    return o;
  };
  const textoProprio = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const pinta = (e, cs) =>
    ["IMG", "SVG", "svg", "CANVAS", "VIDEO"].includes(e.tagName) ||
    cs.backgroundImage !== "none" ||
    !/rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor) ||
    (parseFloat(cs.borderTopWidth) > 0 && !/rgba\(.*,\s*0\)/.test(cs.borderTopColor));
  /** As caixas das linhas do texto do próprio elemento (sem o dos filhos). */
  const caixasDoTexto = (e) =>
    [...e.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .flatMap((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        return [...r.getClientRects()].filter((c) => c.width > 0 && c.height > 0);
      });
  function linhas(e) {
    const r = document.createRange();
    r.selectNodeContents(e);
    const tops = [...r.getClientRects()].filter((c) => c.width > 0 && c.height > 0).map((c) => [c.top, c.height]);
    tops.sort((a, b) => a[0] - b[0]);
    let n = 0;
    let ultimo = -Infinity;
    for (const [t, h] of tops) {
      if (t - ultimo > h / 2) n++;
      ultimo = t;
    }
    return n;
  }
  const une = (a, b) => (!a ? b : b ? { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) } : a);
  const juntas = (cs) => cs.reduce((a, c) => une(a, c), null);
  /** Quanto a caixa passa da moldura, em cada lado, só acima de 1 px. */
  function passa(c, m) {
    const lados = [
      [m.left - c.left, "à esquerda"],
      [c.right - m.right, "à direita"],
      [m.top - c.top, "em cima"],
      [c.bottom - m.bottom, "embaixo"],
    ].filter(([d]) => d > 1);
    return lados.length ? lados.map(([d, l]) => `${Math.round(d)} px ${l}`).join(", ") : null;
  }
  const familia = (cs) => cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");

  async function medir(t) {
    window.__timelines.main.seek(t, false);
    await document.fonts.ready;
    const R = root.getBoundingClientRect();
    const elementos = [];
    const problemas = [];
    const textos = [];
    let mais = 0;
    const problema = (tipo, e, detalhe) => problemas.push({ tipo, alvo: typeof e === "string" ? e : nome(e), detalhe });
    for (const e of root.querySelectorAll("*")) {
      if (IGNORA.has(e.tagName) || e.closest("svg") !== e && e.closest("svg")) continue;
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility !== "visible" || cs.display === "contents") continue;
      const caixa = e.getBoundingClientRect();
      if (caixa.width < 1 || caixa.height < 1) continue;
      const o = opacidade(e);
      if (o < 0.02) continue;
      const temTexto = textoProprio(e);
      const linhasDoTexto = temTexto ? caixasDoTexto(e) : [];
      const visivel = une(caixa, juntas(linhasDoTexto));
      // Toda fora da tela ainda não entrou (ou já saiu): não é visível nem problema.
      if (visivel.right <= R.left || visivel.left >= R.right || visivel.bottom <= R.top || visivel.top >= R.bottom) continue;
      // Um pai com overflow escondido corta; inteiro fora dele, também não aparece.
      let cortador = null;
      let fora = false;
      for (let p = e.parentElement; p && p !== root; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflowX === "visible" && ps.overflowY === "visible") continue;
        const pr = p.getBoundingClientRect();
        // Com transform (scale), a caixa na tela difere das medidas do layout: a escala converte.
        const sx = p.offsetWidth ? pr.width / p.offsetWidth : 1;
        const sy = p.offsetHeight ? pr.height / p.offsetHeight : 1;
        const m = { left: pr.left + p.clientLeft * sx, top: pr.top + p.clientTop * sy, right: pr.left + (p.clientLeft + p.clientWidth) * sx, bottom: pr.top + (p.clientTop + p.clientHeight) * sy };
        if (visivel.right <= m.left || visivel.left >= m.right || visivel.bottom <= m.top || visivel.top >= m.bottom) fora = true;
        else if (!cortador && passa(visivel, m)) cortador = [p, passa(visivel, m)];
      }
      if (fora) continue;
      const interessa = temTexto || e.id || pinta(e, cs);
      if (!interessa) continue;
      const n = temTexto ? linhas(e) : 0;
      if (elementos.length < maxElementos) {
        const texto = temTexto ? e.innerText.replace(/\s+/g, " ").trim() : "";
        elementos.push(
          `${nome(e)} ${Math.round(caixa.left - R.left)},${Math.round(caixa.top - R.top)} ${Math.round(caixa.width)}x${Math.round(caixa.height)}` +
            (o < 0.995 ? ` op${r2(o)}` : "") +
            (n > 1 ? ` ${n}linhas` : "") +
            (texto ? ` "${texto.length > 60 ? `${texto.slice(0, 59)}…` : texto}"` : ""),
        );
      } else mais++;
      const foraDaTela = passa(visivel, R);
      if (foraDaTela) problema("fora_da_tela", e, foraDaTela);
      if (cortador) problema("cortado_pelo_pai", e, `${nome(cortador[0])}: ${cortador[1]}`);
      if (!temTexto) continue;
      const clamp = Number(cs.webkitLineClamp);
      const limite = Number(e.dataset.linhas) || (clamp > 0 ? clamp : 0) || (/nowrap|pre$/.test(cs.whiteSpace) ? 1 : 0);
      if (limite && n > limite) problema("quebrou", e, `${n} linhas, cabe ${limite}`);
      const palavras = e.innerText.trim().split(/\s+/).length;
      if (n > palavras) problema("palavra_partida", e, `${palavras} palavra(s) em ${n} linhas`);
      if (!(clamp > 0) && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) {
        if (e.scrollHeight > e.clientHeight + 1) problema("texto_cortado", e, `faltam ${e.scrollHeight - e.clientHeight} px embaixo`);
        else if (e.scrollWidth > e.clientWidth + 1) problema("texto_cortado", e, `faltam ${e.scrollWidth - e.clientWidth} px de largura`);
      }
      const f = familia(cs);
      if (!GENERICAS.has(f.toLowerCase())) {
        if (!familias.includes(f)) problema("fonte", f, "não existe aqui; caiu em outra");
        else if (!document.fonts.check(`${cs.fontStyle} ${cs.fontWeight} 16px "${f}"`)) problema("fonte", f, "não carregou; caiu em outra");
      }
      textos.push([e, linhasDoTexto]);
    }
    // Texto sobre texto: linhas de dois elementos visíveis que se cobrem (acima de 15% da menor).
    for (let i = 0; i < textos.length; i++) {
      for (let j = i + 1; j < textos.length; j++) {
        const [a, la] = textos[i];
        const [b, lb] = textos[j];
        if (a.contains(b) || b.contains(a)) continue;
        const cobre = la.some((x) =>
          lb.some((y) => {
            const w = Math.min(x.right, y.right) - Math.max(x.left, y.left);
            const h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
            return w > 0 && h > 0 && w * h > 0.15 * Math.min(x.width * x.height, y.width * y.height);
          }),
        );
        if (cobre) problema("texto_sobre_texto", a, nome(b));
      }
    }
    return { elementos, problemas, mais };
  }

  window.__inspecao = { linhaDoTempo, medir };
}

/** Os instantes medidos viram a resposta curta: o primeiro inteiro; depois, só o que mudou e o que saiu. */
export function resumir(medidas) {
  const instantes = [];
  let antes = new Map();
  for (const { t, elementos, mais } of medidas) {
    const agora = new Map(elementos.map((s) => [s.slice(0, s.indexOf(" ")), s]));
    const mudou = elementos.filter((s) => antes.get(s.slice(0, s.indexOf(" "))) !== s);
    const saiu = [...antes.keys()].filter((k) => !agora.has(k));
    instantes.push({ t, ...(instantes.length ? { mudou } : { elementos }), ...(saiu.length ? { saiu } : {}), ...(mais ? { mais } : {}) });
    antes = agora;
  }
  const problemas = new Map();
  for (const { t, problemas: ps } of medidas) {
    for (const p of ps) {
      const chave = `${p.tipo} ${p.alvo}`;
      if (problemas.has(chave)) problemas.get(chave).t.push(t);
      else problemas.set(chave, { tipo: p.tipo, alvo: p.alvo, t: [t], detalhe: p.detalhe });
    }
  }
  return { instantes, problemas: [...problemas.values()] };
}

/**
 * Abre a página e mede cada instante. Com quadros, devolve também o mosaico (JPG em base64),
 * os instantes lado a lado sobre cinza (o fundo é transparente), como o ver_quadros.
 */
export async function inspecionar({ hyperframes, fontes, gsap, html, duracao, largura, altura, instantes, quadros, familias }) {
  const navegador = await puppeteer.launch({
    executablePath: await caminhoDoChrome(hyperframes),
    headless: "shell",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  try {
    const page = await navegador.newPage();
    await page.setViewport({ width: largura, height: altura, deviceScaleFactor: 1 });
    const erros = [];
    const erro = (m) => erros.length < MAX_ERROS && !erros.includes(m) && erros.push(m.slice(0, 300));
    page.on("pageerror", (e) => erro(String(e?.message ?? e)));
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erro(m.text()));
    page.on("requestfailed", (r) => r.url().startsWith("data:") || erro(`não carregou ${r.url().slice(0, 120)} (sem internet)`));
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const url = req.url();
      if (url.startsWith("data:")) return req.continue();
      if (!url.startsWith(BASE)) return req.abort();
      const caminho = decodeURIComponent(url.slice(BASE.length).split("?")[0]);
      try {
        if (caminho === "index.html") return req.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
        if (caminho === "gsap.min.js") return req.respond({ status: 200, contentType: "text/javascript", body: await readFile(gsap) });
        const fonte = /^fontes\/([\w-]+\.ttf)$/.exec(caminho);
        if (fonte) return req.respond({ status: 200, contentType: "font/ttf", body: await readFile(join(fontes, fonte[1])) });
      } catch {}
      req.respond({ status: 404, body: "" });
    });
    await page.goto(`${BASE}index.html`, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    // A duração da animação vem antes do tl.set da página, que estica tl até a do bloco.
    await page.evaluate(instalar, { familias, maxElementos: MAX_ELEMENTOS });
    const linha = await page.evaluate(() => window.__inspecao.linhaDoTempo());
    if (quadros) await page.addStyleTag({ content: "html{background:#6b6b6b !important}" });
    const medidas = [];
    const imagens = [];
    for (const t of instantes) {
      medidas.push({ t, ...(await page.evaluate((x) => window.__inspecao.medir(x), t)) });
      if (quadros) imagens.push(await page.screenshot({ type: "jpeg", quality: 80, encoding: "base64", clip: { x: 0, y: 0, width: largura, height: altura, scale: ALTURA_QUADRO / altura } }));
    }
    const { instantes: mudancas, problemas } = resumir(medidas);
    if (linha.fim > duracao + 0.01) problemas.unshift({ tipo: "passa_do_bloco", alvo: "tl", t: [], detalhe: `a animação termina em ${linha.fim} s; o bloco tem ${duracao} s` });
    for (const m of erros) problemas.unshift({ tipo: "erro_de_script", alvo: "página", t: [], detalhe: m });
    const resposta = { largura, altura, duracao: { bloco: duracao, animacao: linha.fim }, problemas, instantes: mudancas, linhaDoTempo: linha.tweens };
    if (!quadros) return resposta;
    const mosaico = await navegador.newPage();
    const w = Math.round((largura * ALTURA_QUADRO) / altura);
    await mosaico.setViewport({ width: w * imagens.length, height: ALTURA_QUADRO, deviceScaleFactor: 1 });
    await mosaico.setContent(`<body style="margin:0;display:flex">${imagens.map((b) => `<img src="data:image/jpeg;base64,${b}" style="width:${w}px;height:${ALTURA_QUADRO}px;display:block">`).join("")}</body>`, { waitUntil: "load" });
    return { ...resposta, quadros: await mosaico.screenshot({ type: "jpeg", quality: 70, encoding: "base64" }) };
  } finally {
    await navegador.close();
  }
}
