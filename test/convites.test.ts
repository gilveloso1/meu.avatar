import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { ERROS } from "../src/erros";
import { ADMIN, call, cookie, memberCookie, postForm, SITE, sessionPair } from "./helpers";

// Convites (porte do estuda.mais) e a aba Contas do painel: o administrador cria a conta e gera o
// link; a pessoa cria a senha por ele. O mesmo link serve para "esqueci a senha".

const get = (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session ? { cookie: session } : {} }));
const SENHA = "uma-senha-bem-longa";

/** Convida pela aba Contas e devolve o código do link mostrado na página. */
async function convidar(admin: string, nome = "Ana", email = "ana@exemplo.com"): Promise<string> {
  const res = await call(postForm("/painel/contas", { nome, email }, { cookie: admin }));
  expect(res.status).toBe(200);
  return /\/convite\/([\w-]{20,})/.exec(await res.text())![1]!;
}
const criarSenha = (token: string, senha = SENHA, confirmar = senha) => call(postForm(`/convite/${token}`, { senha, confirmar }));
const conta = (email: string) => env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<{ id: number; role: string; password_hash: string | null; permissoes: string }>();

describe("convite", () => {
  it("o administrador convida; a pessoa cria a senha pelo link e já entra", async () => {
    const admin = await cookie();
    const token = await convidar(admin);
    expect(await conta("ana@exemplo.com")).toMatchObject({ role: "member", password_hash: null, permissoes: "[]" });
    const page = await (await get(`/convite/${token}`)).text();
    expect(page).toContain("Criar a senha");
    expect(page).toContain("ana@exemplo.com");
    const res = await criarSenha(token);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect((await get("/", sessionPair(res))).status).toBe(200);
    // E entra de novo pelo login normal.
    expect((await call(postForm("/entrar", { email: "ana@exemplo.com", senha: SENHA }))).status).toBe(303);
  });

  it("o banco guarda só o hash do código", async () => {
    const token = await convidar(await cookie());
    const row = await env.DB.prepare("SELECT token_hash FROM invites").first<{ token_hash: string }>();
    expect(row!.token_hash).toBe(await sha256(token));
    expect(row!.token_hash).not.toBe(token);
  });

  it("o link funciona uma vez só", async () => {
    const token = await convidar(await cookie());
    expect((await criarSenha(token)).status).toBe(303);
    const de_novo = await get(`/convite/${token}`);
    expect(de_novo.status).toBe(404);
    expect(await de_novo.text()).toContain("Este link não vale mais.");
    expect((await criarSenha(token, "outra-senha-qualquer")).status).toBe(404);
  });

  it("depois de 72 horas o link não vale", async () => {
    const token = await convidar(await cookie());
    await env.DB.prepare("UPDATE invites SET expires_at = ?").bind(new Date(Date.now() - 1000).toISOString()).run();
    expect((await get(`/convite/${token}`)).status).toBe(404);
    expect((await criarSenha(token)).status).toBe(404);
    expect((await conta("ana@exemplo.com"))!.password_hash).toBeNull();
  });

  it("um link novo derruba o anterior", async () => {
    const admin = await cookie();
    const primeiro = await convidar(admin);
    const id = (await conta("ana@exemplo.com"))!.id;
    const res = await call(postForm(`/painel/contas/${id}/link`, {}, { cookie: admin }));
    const segundo = /\/convite\/([\w-]{20,})/.exec(await res.text())![1]!;
    expect(segundo).not.toBe(primeiro);
    expect((await get(`/convite/${primeiro}`)).status).toBe(404);
    expect((await get(`/convite/${segundo}`)).status).toBe(200);
  });

  it("confere a repetição e o tamanho da senha", async () => {
    const token = await convidar(await cookie());
    const diferente = await criarSenha(token, SENHA, "outra-coisa-longa");
    expect(diferente.status).toBe(400);
    expect(await diferente.text()).toContain(ERROS.senhasDiferentes);
    const curta = await criarSenha(token, "curta");
    expect(curta.status).toBe(400);
    expect((await get(`/convite/${token}`)).status).toBe(200);
  });

  it("e-mail que já tem conta não vira outra", async () => {
    const admin = await cookie();
    const res = await call(postForm("/painel/contas", { nome: "Outro", email: ADMIN.email }, { cookie: admin }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(ERROS.emailEmUso);
  });

  it("esqueci a senha: o link novo troca a senha e derruba as sessões abertas", async () => {
    const admin = await cookie();
    expect((await criarSenha(await convidar(admin))).status).toBe(303);
    const antiga = sessionPair(await call(postForm("/entrar", { email: "ana@exemplo.com", senha: SENHA })));
    const id = (await conta("ana@exemplo.com"))!.id;
    const token = /\/convite\/([\w-]{20,})/.exec(await (await call(postForm(`/painel/contas/${id}/link`, {}, { cookie: admin }))).text())![1]!;
    expect(await (await get(`/convite/${token}`)).text()).toContain("Trocar a senha");
    expect((await criarSenha(token, "senha-nova-bem-longa")).status).toBe(303);
    expect((await get("/", antiga)).headers.get("location")).toBe("/entrar");
    expect((await call(postForm("/entrar", { email: "ana@exemplo.com", senha: SENHA }))).status).toBe(400);
    expect((await call(postForm("/entrar", { email: "ana@exemplo.com", senha: "senha-nova-bem-longa" }))).status).toBe(303);
  });

  it("conta suspensa não usa o link", async () => {
    const admin = await cookie();
    const token = await convidar(admin);
    const id = (await conta("ana@exemplo.com"))!.id;
    await call(postForm(`/painel/contas/${id}/suspender`, {}, { cookie: admin }));
    expect((await get(`/convite/${token}`)).status).toBe(404);
    expect((await criarSenha(token)).status).toBe(404);
  });

  it("formulário de outro site não cria a senha", async () => {
    const token = await convidar(await cookie());
    const res = await call(new Request(`${SITE}/convite/${token}`, { method: "POST", body: new URLSearchParams({ senha: SENHA, confirmar: SENHA }), headers: { origin: "https://outro.site" } }));
    expect(res.status).toBe(403);
    expect((await conta("ana@exemplo.com"))!.password_hash).toBeNull();
  });

  it("a tela de entrar diz o que fazer quando esquece a senha", async () => {
    await cookie();
    expect(await (await get("/entrar")).text()).toContain("Esqueceu a senha? Peça um link novo ao administrador.");
  });
});

describe("aba Contas: quem pode", () => {
  it("a conta comum não vê nem age (a página nem existe)", async () => {
    await cookie();
    const membro = await memberCookie();
    expect((await get("/painel/contas", membro)).status).toBe(404);
    expect((await call(postForm("/painel/contas", { nome: "X", email: "x@exemplo.com" }, { cookie: membro }))).status).toBe(404);
    expect(await conta("x@exemplo.com")).toBeNull();
  });

  it("sem login, vai para /entrar", async () => {
    await cookie();
    expect((await get("/painel/contas")).headers.get("location")).toBe("/entrar");
    expect((await call(postForm("/painel/contas", { nome: "X", email: "x@exemplo.com" }))).headers.get("location")).toBe("/entrar");
  });

  it("sem gerenciar:contas, nem o administrador (e a aba some)", async () => {
    const admin = await cookie();
    await env.DB.prepare("UPDATE users SET permissoes = '[\"-gerenciar:contas\"]' WHERE email = ?").bind(ADMIN.email).run();
    expect((await get("/painel/contas", admin)).status).toBe(404);
    expect((await call(postForm("/painel/contas", { nome: "X", email: "x@exemplo.com" }, { cookie: admin }))).status).toBe(404);
    expect(await (await get("/painel", admin)).text()).not.toContain('href="/painel/contas');
  });

  it("o administrador não age sobre a própria conta por aqui", async () => {
    const admin = await cookie();
    const id = (await conta(ADMIN.email))!.id;
    for (const acao of ["link", "suspender", "testador", "canvas"]) {
      expect((await call(postForm(`/painel/contas/${id}/${acao}`, {}, { cookie: admin }))).status).toBe(404);
    }
    expect((await get("/", admin)).status).toBe(200);
  });

  it("as ações não dependem de corpo no pedido", async () => {
    const admin = await cookie();
    await convidar(admin);
    const id = (await conta("ana@exemplo.com"))!.id;
    const res = await call(new Request(`${SITE}/painel/contas/${id}/link`, { method: "POST", headers: { origin: SITE, cookie: admin } }));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/\/convite\/[\w-]{20,}/);
  });

  it("conta que não existe: 404", async () => {
    const admin = await cookie();
    expect((await call(postForm("/painel/contas/999/suspender", {}, { cookie: admin }))).status).toBe(404);
  });
});

describe("aba Contas: ações", () => {
  it("lista as contas com o estado de cada uma", async () => {
    const admin = await cookie();
    await convidar(admin);
    const page = await (await get("/painel/contas", admin)).text();
    expect(page).toContain("ana@exemplo.com");
    expect(page).toContain("Convite até");
    expect(page).toContain(`${ADMIN.nome} (você)`);
    expect(page).toContain("Gerar convite");
  });

  it("suspender encerra a sessão da pessoa; reativar devolve o acesso", async () => {
    const admin = await cookie();
    await criarSenha(await convidar(admin));
    const sessao = sessionPair(await call(postForm("/entrar", { email: "ana@exemplo.com", senha: SENHA })));
    const id = (await conta("ana@exemplo.com"))!.id;
    expect((await call(postForm(`/painel/contas/${id}/suspender`, {}, { cookie: admin }))).headers.get("location")).toBe("/painel/contas");
    expect((await get("/", sessao)).headers.get("location")).toBe("/entrar");
    expect(await (await get("/painel/contas", admin)).text()).toContain("Suspensa");
    await call(postForm(`/painel/contas/${id}/reativar`, {}, { cookie: admin }));
    expect((await call(postForm("/entrar", { email: "ana@exemplo.com", senha: SENHA }))).status).toBe(303);
  });

  it("testador e Canvas ligam e desligam, sem mexer no resto", async () => {
    const admin = await cookie();
    await convidar(admin);
    const id = (await conta("ana@exemplo.com"))!.id;
    await call(postForm(`/painel/contas/${id}/testador`, {}, { cookie: admin }));
    await call(postForm(`/painel/contas/${id}/canvas`, {}, { cookie: admin }));
    expect(JSON.parse((await conta("ana@exemplo.com"))!.permissoes).sort()).toEqual(["usar:canvas", "usar:modelo:teste"]);
    await call(postForm(`/painel/contas/${id}/testador`, {}, { cookie: admin }));
    expect(JSON.parse((await conta("ana@exemplo.com"))!.permissoes)).toEqual(["usar:canvas"]);
    const page = await (await get("/painel/contas", admin)).text();
    expect(page).toContain("Membro, Canvas");
    expect(page).toContain("Tirar o Canvas");
  });
});
