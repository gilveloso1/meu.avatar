/**
 * Foto da maquete 3D (docs/api.md, montar_maquete): a cena em JSON (cena3d/cena.js) montada numa
 * página com o Three.js, desenhada pelo WebGL de software do Chrome (SwiftShader, sem GPU) e
 * fotografada em PNG. Devolve a imagem e o relatório do enquadramento.
 *
 * Como na inspeção, a página e os módulos são servidos pela interceptação do Puppeteer, num
 * endereço de mentira e sem rede.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { caminhoDoChrome } from "./inspecionar.mjs";
import { validarCena } from "./cena3d/cena.js";

const APP = dirname(fileURLToPath(import.meta.url));
const BASE = "http://maquete.local/";
const PASTAS = {
  "three/addons/": join(APP, "node_modules/three/examples/jsm"),
  "three/": join(APP, "node_modules/three/build"),
  "cena3d/": join(APP, "cena3d"),
};
const PRAZO_MS = 90_000;

/** A página: o JSON da cena vai num <script> de dados, com "<" escapado. */
export function paginaMaquete(cena, largura, altura) {
  const dados = JSON.stringify(cena).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;width:${largura}px;height:${altura}px;overflow:hidden;background:#000}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"./three/three.module.js","three/addons/":"./three/addons/"}}</script>
</head><body>
<script type="application/json" id="cena">${dados}</script>
<script type="module">
import * as THREE from "three";
import { montarCena } from "./cena3d/cena.js";
try {
  const cena = JSON.parse(document.getElementById("cena").textContent);
  const { scene, camera, relatorio } = montarCena(cena, { largura: ${largura}, altura: ${altura} });
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(${largura}, ${altura});
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  document.body.appendChild(renderer.domElement);
  renderer.render(scene, camera);
  window.__maquete = { relatorio };
} catch (err) {
  window.__maquete = { erro: String(err && err.stack || err) };
}
</script>
</body></html>
`;
}

function arquivo(caminho) {
  for (const [prefixo, pasta] of Object.entries(PASTAS)) {
    if (!caminho.startsWith(prefixo)) continue;
    const alvo = normalize(join(pasta, caminho.slice(prefixo.length)));
    return alvo.startsWith(pasta + sep) ? alvo : null;
  }
  return null;
}

/** Valida, monta e fotografa. Lança Error com o motivo se a página quebrar. */
export async function maquete({ hyperframes, cena, largura, altura }) {
  const erros = validarCena(cena);
  if (erros.length) return { erros };
  const navegador = await puppeteer.launch({
    executablePath: await caminhoDoChrome(hyperframes),
    // O Chrome do computador (CHROME) não tem mais o modo "shell"; o da imagem é o headless-shell.
    headless: process.env.CHROME ? true : "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await navegador.newPage();
    await page.setViewport({ width: largura, height: altura, deviceScaleFactor: 1 });
    const falhas = [];
    page.on("pageerror", (e) => falhas.push(String(e?.message ?? e).slice(0, 300)));
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const url = req.url();
      if (!url.startsWith(BASE)) return req.abort();
      const caminho = decodeURIComponent(url.slice(BASE.length).split("?")[0]);
      try {
        if (caminho === "index.html") return req.respond({ status: 200, contentType: "text/html; charset=utf-8", body: paginaMaquete(cena, largura, altura) });
        const local = arquivo(caminho);
        if (local) return req.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body: await readFile(local) });
      } catch {}
      req.respond({ status: 404, body: "" });
    });
    await page.goto(`${BASE}index.html`, { waitUntil: "load", timeout: PRAZO_MS });
    await page.waitForFunction(() => window.__maquete, { timeout: PRAZO_MS });
    const r = await page.evaluate(() => window.__maquete);
    if (r.erro || falhas.length) throw new Error(r.erro ?? falhas.join("\n"));
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: largura, height: altura } });
    return { png: Buffer.from(png), relatorio: r.relatorio };
  } finally {
    await navegador.close();
  }
}
