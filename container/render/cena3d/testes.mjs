// Testes da biblioteca da maquete (npm run teste:maquete): validação, corpo no chão, assento,
// mão que alcança o ponto, todas as poses e objetos montando, e o catálogo igual ao do MCP.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { colisoesDosBracos, criarCorpo, definirJunta, direcaoDoRosto, maoEm, pontoDoRosto } from "./corpo.js";
import { campoVertical, montarCena, validarCena } from "./cena.js";
import { OBJETOS } from "./objetos.js";
import { MAOS, POSES, comporPoses } from "./poses.js";

const CAMERA = { posicao: [0, 1.5, 3], alvo: [0, 1, 0] };
const caixa = (o) => new THREE.Box3().setFromObject(o, true);
const pessoa = (r, id) => r.scene.getObjectByName(id);

test("cena certa não tem erros; cada erro diz o campo e o que usar", () => {
  assert.deepEqual(validarCena({ pessoas: [{ id: "ana", pose: ["sentada", "celular"] }], objetos: [{ id: "c", tipo: "cadeira" }], camera: CAMERA }), []);
  const erros = validarCena({
    ambiente: { tipo: "praia" },
    objetos: [{ id: "x", tipo: "foguete" }, { id: "y", tipo: "mesa", cor_errada: 1 }, { tipo: "pote", sobre: "nada" }],
    pessoas: [{ id: "x", pose: "dancando", juntas: { joelhoE: { abre: 10 } }, sentar_em: "y" }],
    camera: { posicao: [0, 1] },
  });
  for (const trecho of ['ambiente.tipo: "praia"', 'objetos[0].tipo: "foguete" não existe', "objetos[1].cor_errada: campo desconhecido", 'objetos[2].sobre: não há objeto com id "nada"', 'pessoas[0].id: "x" repetido', 'pessoas[0].pose: "dancando" não existe', "pessoas[0].juntas.joelhoE.abre: não existe (use dobra)", "pessoas[0].sentar_em: mesa não tem assento", "camera.posicao", "camera.alvo"]) {
    assert.ok(erros.some((e) => e.includes(trecho)), `faltou: ${trecho}\n${erros.join("\n")}`);
  }
  assert.deepEqual(validarCena({ pessoas: [] }), ["camera: obrigatória, {posicao: [x, y, z], alvo: [x, y, z] ou id, lente: mm}"]);
  assert.deepEqual(validarCena({ estilo: "colorido", camera: CAMERA }), ["estilo: use neutro ou contraste"]);
});

test("contraste pinta pessoa e móveis por categoria; cor dada na cena vale nos dois estilos", () => {
  const cena = (estilo) => ({ estilo, objetos: [{ id: "s", tipo: "sofa" }, { id: "m", tipo: "mesa", cor: "#123456" }, { id: "f", tipo: "frasco" }], pessoas: [{ id: "p", posicao: [2, 0] }], camera: CAMERA });
  const cor = (r, id) => {
    let c;
    r.scene.getObjectByName(id).traverse((o) => (c ??= o.material?.color?.getHexString()));
    return c;
  };
  const neutro = montarCena(cena("neutro"));
  const contraste = montarCena(cena("contraste"));
  assert.notEqual(cor(neutro, "s"), cor(contraste, "s"));
  assert.equal(cor(contraste, "m"), "123456");
  assert.equal(cor(neutro, "f"), cor(contraste, "f"));
});

test("em pé, a pessoa pisa no chão e tem a altura pedida", () => {
  for (const [corpo, altura] of [["mulher", 1.65], ["homem", 1.8], ["crianca", 1.2]]) {
    const r = montarCena({ pessoas: [{ id: "p", corpo, altura }], camera: CAMERA });
    const cx = caixa(pessoa(r, "p"));
    assert.ok(Math.abs(cx.min.y) < 0.002, `${corpo}: pé em ${cx.min.y}`);
    assert.ok(Math.abs(cx.max.y - altura) / altura < 0.03, `${corpo}: altura ${cx.max.y}, pedida ${altura}`);
  }
});

test("sentada na cadeira, o quadril fica no assento e os pés perto do chão", () => {
  const r = montarCena({ objetos: [{ id: "c", tipo: "cadeira", posicao: [1, -1], giro: 30 }], pessoas: [{ id: "p", sentar_em: "c" }], camera: CAMERA });
  const p = pessoa(r, "p");
  const pelve = p.getObjectByName("pelve").getWorldPosition(new THREE.Vector3());
  const raio = 0.058 * 1.65;
  assert.ok(Math.abs(pelve.y - raio - OBJETOS.cadeira.assento.altura) < 0.01, `pelve em ${pelve.y}`);
  assert.ok(Math.abs(caixa(p).min.y) < 0.005, `pés em ${caixa(p).min.y}`);
  assert.ok(Math.abs(p.rotation.y - (30 * Math.PI) / 180) < 1e-6);
});

test("a mão chega ao ponto quando alcança e avisa quanto faltou quando não", () => {
  const corpo = criarCorpo({ tipo: "mulher" });
  corpo.raiz.updateWorldMatrix(true, true);
  const alvo = [0.25, 1.2, 0.35];
  assert.equal(maoEm(corpo, "D", alvo), 0);
  const palma = corpo.juntas.maoD.localToWorld(new THREE.Vector3(0, -corpo.medidas.palma * 0.55, 0));
  assert.ok(palma.distanceTo(new THREE.Vector3(...alvo)) < 0.01, `palma a ${palma.distanceTo(new THREE.Vector3(...alvo))} m`);
  assert.ok(maoEm(corpo, "E", [3, 1.2, 0]) > 2);
  const r = montarCena({ pessoas: [{ id: "p", alcancar: { E: [0, 1, 4] } }], camera: CAMERA });
  assert.ok(r.relatorio.avisos.some((a) => a.includes("mão esquerda não alcança")));
});

test("junta fora do limite do corpo é cortada e avisada", () => {
  const corpo = criarCorpo();
  const avisos = definirJunta(corpo, "joelhoD", { dobra: 200 });
  assert.equal(avisos.length, 1);
  assert.ok(Math.abs(corpo.juntas.joelhoD.rotation.x - (155 * Math.PI) / 180) < 1e-6);
});

test("todas as poses, mãos e objetos montam, e o relatório diz onde cada um caiu", () => {
  const objetos = Object.keys(OBJETOS).map((tipo, i) => ({ id: `o${i}`, tipo, posicao: [(i % 8) - 4, -Math.floor(i / 8)] }));
  const corpo = Object.keys(POSES).filter((n) => POSES[n].tipo === "corpo");
  const bracos = Object.keys(POSES).filter((n) => POSES[n].tipo === "bracos");
  const pessoas = bracos.map((b, i) => ({ id: `p${i}`, pose: [corpo[i % corpo.length], b], maos: { E: Object.keys(MAOS)[i % 7] }, posicao: [i - 7, 2] }));
  const cena = { ambiente: { tipo: "sala", largura: 20, profundidade: 14 }, objetos, pessoas: pessoas.slice(0, 8), camera: { posicao: [0, 2, 9], alvo: [0, 0.8, 0], lente: 18 } };
  assert.deepEqual(validarCena(cena), []);
  const r = montarCena(cena, { largura: 1280, altura: 720 });
  assert.equal(r.relatorio.itens.length, objetos.length + 8);
  const p0 = r.relatorio.itens.find((i) => i.id === "p0");
  assert.ok(p0.quadro && p0.rosto, JSON.stringify(p0));
  for (let k = 8; k < pessoas.length; k += 8) montarCena({ ...cena, objetos: [], pessoas: pessoas.slice(k, k + 8) });
});

test("lente de 26 mm num quadro 9:16 dá o campo vertical de um celular", () => {
  const v = campoVertical(26, 720, 1280);
  assert.ok(v > 70 && v < 75, `campo ${v}`);
});

test("o catálogo da descrição do MCP é o mesmo da biblioteca", () => {
  const mcp = readFileSync(new URL("../../../src/mcp.ts", import.meta.url), "utf8");
  const lista = (nome) => mcp.match(new RegExp(`const ${nome} = "([^"]+)"`))[1].split(", ");
  assert.deepEqual(lista("MAQUETE_OBJETOS"), Object.keys(OBJETOS));
  assert.deepEqual(lista("MAQUETE_POSES_CORPO"), Object.keys(POSES).filter((n) => POSES[n].tipo === "corpo"));
  assert.deepEqual(lista("MAQUETE_POSES_BRACOS"), Object.keys(POSES).filter((n) => POSES[n].tipo === "bracos"));
  assert.deepEqual(lista("MAQUETE_MAOS"), Object.keys(MAOS));
});

test("braço que entra no corpo é detectado; o rig tira sozinho, e o que a cena fixou vira aviso", () => {
  const corpo = criarCorpo({ tipo: "mulher", porte: 1.4 });
  definirJunta(corpo, "bracoE", { abre: -25 });
  const antes = colisoesDosBracos(corpo);
  assert.ok(antes.length > 0, "o braço fechado para dentro devia entrar no quadril");
  assert.ok(antes[0].entra > 0.005);
  const solto = montarCena({ pessoas: [{ id: "p", porte: 1.5, pose: ["sentada_chao_joelhos"] }], camera: CAMERA });
  assert.ok(!(solto.relatorio.avisos ?? []).some((a) => a.includes(" entra ")), JSON.stringify(solto.relatorio.avisos));
  const fixo = montarCena({ pessoas: [{ id: "p", porte: 1.4, juntas: { bracoE: { abre: -25 } } }], camera: CAMERA });
  assert.ok(fixo.relatorio.avisos.some((a) => a.startsWith("p: braço esquerdo entra")), JSON.stringify(fixo.relatorio.avisos));
});

test("pose ajustada por porte usa os ângulos do porte e interpola os do meio", () => {
  const a = comporPoses(["bracos_cruzados"], 1).juntas.bracoE;
  const g = comporPoses(["bracos_cruzados"], 1.35).juntas.bracoE;
  const meio = comporPoses(["bracos_cruzados"], 1.175).juntas.bracoE;
  assert.deepEqual(a, POSES.bracos_cruzados.porPorte["1"].bracoE);
  assert.equal(meio.dobra, (a.dobra + g.dobra) / 2);
  assert.deepEqual(comporPoses(["bracos_cruzados"], 1.5).juntas.bracoE, g);
});

test("objeto posicionado na mão: o braço vai até ele, e a selfie olha para o que segura", () => {
  const cena = {
    objetos: [{ id: "cel", tipo: "celular", posicao: [-0.3, 1.45, 0.4], na_mao: { pessoa: "a", lado: "D" } }],
    pessoas: [{ id: "a", pose: ["em_pe", "selfie"] }],
    camera: CAMERA,
  };
  assert.deepEqual(validarCena(cena), []);
  const r = montarCena(cena);
  const corpo = r.corpos.a;
  const cel = r.scene.getObjectByName("cel");
  const centro = caixa(cel).getCenter(new THREE.Vector3());
  const palma = corpo.juntas.maoD.localToWorld(new THREE.Vector3(0, -corpo.medidas.palma * 0.55, 0));
  assert.ok(palma.distanceTo(centro) < 0.06, `palma a ${palma.distanceTo(centro)} m do celular`);
  assert.equal(centro.y > 1.4, true, "o celular ficou onde a cena pôs");
  assert.ok(!(r.relatorio.avisos ?? []).some((a) => a.includes("não alcança")), JSON.stringify(r.relatorio.avisos));
  const rosto = pontoDoRosto(corpo);
  const praCel = centro.clone().sub(rosto).normalize();
  assert.ok(direcaoDoRosto(corpo).dot(praCel) > 0.7, "o rosto vira para o celular");
});
