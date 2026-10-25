import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Accounts, LOCK_MINUTES } from "../src/auth";
import { Db } from "../src/db";
import { ADMIN, call, cookie, postForm, sessionPair, SITE } from "./helpers";

const cadastro = (fields: Partial<Record<"nome" | "email" | "senha" | "confirmar", string>> = {}) =>
  call(postForm("/cadastro", { ...ADMIN, confirmar: ADMIN.senha, ...fields }));

describe("primeiro cadastro", () => {
  it("sem nenhuma conta, /entrar leva ao cadastro", async () => {
    const res = await call(new Request(`${SITE}/entrar`));
    expect(res.headers.get("location")).toBe("/cadastro");
    expect(await (await call(new Request(`${SITE}/cadastro`))).text()).toContain("A primeira conta é a do administrador");
  });

  it("a primeira conta vira admin, entra com cookie seguro e o cadastro fecha", async () => {
    const res = await cadastro();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^__Host-sessao=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);

    const user = await new Db(env.DB).getUserByEmail(ADMIN.email);
    expect(user).toMatchObject({ role: "admin", name: "Gil" });
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user!.passwordHash).not.toContain(ADMIN.senha);

    const home = await call(new Request(`${SITE}/`, { headers: { cookie: sessionPair(res) } }));
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Gil");

    // Fechou: a página avisa e um segundo cadastro é recusado.
    const page = await call(new Request(`${SITE}/cadastro`));
    expect(page.status).toBe(403);
    expect(await page.text()).toContain("Cadastro fechado");
    const outro = await cadastro({ email: "outra@exemplo.com" });
    expect(outro.status).toBe(403);
    expect(outro.headers.get("set-cookie")).toBeNull();
    expect((await call(new Request(`${SITE}/entrar`))).status).toBe(200);
  });

  it("dois cadastros ao mesmo tempo não viram dois admins", async () => {
    const results = await Promise.all([cadastro(), cadastro({ email: "b@exemplo.com" }), cadastro({ email: "c@exemplo.com" })]);
    expect(results.filter((r) => r.status === 303)).toHaveLength(1);
    const { results: users } = await env.DB.prepare("SELECT role FROM users").all();
    expect(users).toEqual([{ role: "admin" }]);
  });

  it("confere nome, e-mail, tamanho da senha e a repetição", async () => {
    for (const [fields, message] of [
      [{ nome: " " }, "Escreva o nome."],
      [{ email: "gil@" }, "Confira o e-mail."],
      [{ senha: "curta", confirmar: "curta" }, "pelo menos 10 caracteres"],
      [{ confirmar: "outra-senha-123" }, "As senhas não são iguais."],
    ] as const) {
      const res = await cadastro(fields);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(message);
    }
    expect(await new Db(env.DB).hasUsers()).toBe(false);
  });
});

describe("entrar e sair", () => {
  it("senha errada e e-mail desconhecido dão a mesma mensagem; a certa abre a sessão", async () => {
    await cookie();
    for (const fields of [{ email: ADMIN.email, senha: "errada-errada" }, { email: "ninguem@exemplo.com", senha: ADMIN.senha }]) {
      const res = await call(postForm("/entrar", fields));
      expect(res.status).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(await res.text()).toContain("E-mail ou senha não conferem.");
    }
    const ok = await call(postForm("/entrar", { email: " GIL@Exemplo.com ", senha: ADMIN.senha }));
    expect(ok.status).toBe(303);
    expect(sessionPair(ok)).toMatch(/^__Host-sessao=/);
  });

  it("Sair encerra a sessão no servidor", async () => {
    const session = await cookie();
    const res = await call(postForm("/sair", {}, { cookie: session }));
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await call(new Request(`${SITE}/`, { headers: { cookie: session } }))).headers.get("location")).toBe("/entrar");
  });

  it("cookie inventado não entra", async () => {
    await cookie();
    const res = await call(new Request(`${SITE}/`, { headers: { cookie: "__Host-sessao=inventado-inventado-inventado-inventad" } }));
    expect(res.headers.get("location")).toBe("/entrar");
  });

  it("recusa formulário vindo de outro site ou sem Origin", async () => {
    const session = await cookie();
    const fora = new Request(`${SITE}/videos`, { method: "POST", body: new FormData(), headers: { origin: "https://mal.exemplo", cookie: session } });
    expect((await call(fora)).status).toBe(403);
    const semOrigin = new Request(`${SITE}/entrar`, { method: "POST", body: new FormData() });
    expect((await call(semOrigin)).status).toBe(403);
    // Origin "null" vale quando o navegador garante que veio do próprio site.
    const nulo = new Request(`${SITE}/entrar`, {
      method: "POST",
      body: new FormData(),
      headers: { origin: "null", "sec-fetch-site": "same-origin" },
    });
    expect((await call(nulo)).status).toBe(400);
  });

  it("páginas sem cache, sem moldura e com o script só pelo nonce", async () => {
    const res = await call(new Request(`${SITE}/`, { headers: { cookie: await cookie() } }));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    const nonce = /script-src 'nonce-([^']+)'/.exec(res.headers.get("content-security-policy")!)![1];
    expect(await res.text()).toContain(`<script nonce="${nonce}">`);
  });
});

describe("bloqueio", () => {
  it("5 senhas erradas bloqueiam por 15 minutos, mesmo com a senha certa", async () => {
    await cookie();
    let now = new Date("2026-10-25T12:00:00Z");
    const accounts = new Accounts(new Db(env.DB), 4, () => now);
    for (let i = 0; i < 4; i++) expect(await accounts.login(ADMIN.email, "errada-errada")).toEqual({ ok: false, reason: "invalid" });
    expect(await accounts.login(ADMIN.email, "errada-errada")).toMatchObject({ ok: false, reason: "locked" });
    expect(await accounts.login(ADMIN.email, ADMIN.senha)).toMatchObject({ ok: false, reason: "locked" });
    now = new Date(now.getTime() + LOCK_MINUTES * 60_000 + 1000);
    expect(await accounts.login(ADMIN.email, ADMIN.senha)).toMatchObject({ ok: true });
  });

  it("a sessão vale 30 dias", async () => {
    await cookie();
    let now = new Date("2026-10-25T12:00:00Z");
    const accounts = new Accounts(new Db(env.DB), 4, () => now);
    const result = await accounts.login(ADMIN.email, ADMIN.senha);
    if (!result.ok) throw new Error("login falhou");
    now = new Date(now.getTime() + 29 * 86_400_000);
    expect(await accounts.session(result.token)).toMatchObject({ email: ADMIN.email });
    now = new Date(now.getTime() + 2 * 86_400_000);
    expect(await accounts.session(result.token)).toBeNull();
  });
});

describe("vídeos", () => {
  it("o vídeo guarda quem pediu", async () => {
    const { FakeVideoApi } = await import("./helpers");
    await call(postForm("/videos", { estilo: "selfie", idioma: "pt-BR", fala: "Oi" }, { cookie: await cookie() }), new FakeVideoApi());
    const [video] = await new Db(env.DB).recentVideos();
    const admin = await new Db(env.DB).getUserByEmail(ADMIN.email);
    expect(video!.user_id).toBe(admin!.id);
  });
});
