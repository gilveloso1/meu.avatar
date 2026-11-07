import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { ERROS } from "../src/erros";
import { type Conta, PACOTES, PERMISSOES, pode, permissoesDe, lerAjustes } from "../src/permissoes";
import { ADMIN, call, cookie, FakeVideoApi, memberCookie, postForm, SITE } from "./helpers";

// As permissões no molde dos testes do TabNews (tests/integration/models/authorization.test.js):
// a lógica de pode() sozinha e, no site, cada permissão dada e tirada de uma conta.

const membro = (permissoes: string[] = [], id = 2): Conta => ({ id, role: "member", permissoes });
const admin = (permissoes: string[] = [], id = 1): Conta => ({ id, role: "admin", permissoes });

describe("pode()", () => {
  describe("pacotes", () => {
    it("o membro gera com os modelos liberados e vê os próprios vídeos, e só", () => {
      expect([...permissoesDe(membro())].sort()).toEqual(["ler:video", "usar:modelo"]);
    });

    it("o administrador tem todo o catálogo, menos a marca de suspensa", () => {
      expect([...permissoesDe(admin())].sort()).toEqual(PERMISSOES.filter((p) => p !== "suspensa").sort());
      expect(PACOTES.admin).not.toContain("suspensa");
    });
  });

  describe("ajustes por conta", () => {
    it("a permissão a mais se soma ao pacote", () => {
      expect(pode(membro(), "usar:modelo:teste")).toBe(false);
      expect(pode(membro(["usar:modelo:teste"]), "usar:modelo:teste")).toBe(true);
    });

    it("com \"-\", a permissão sai do pacote", () => {
      expect(pode(admin(["-usar:canvas"]), "usar:canvas")).toBe(false);
      expect(pode(admin(["-usar:canvas"]), "ver:painel")).toBe(true);
    });

    it("o que não está no catálogo é ignorado", () => {
      expect([...permissoesDe(membro(["voar", "-voar", "admin", "*"]))].sort()).toEqual(["ler:video", "usar:modelo"]);
    });

    it("ajuste ilegível no banco vale como nenhum", () => {
      expect(lerAjustes("não é json")).toEqual([]);
      expect(lerAjustes('{"a": 1}')).toEqual([]);
      expect(lerAjustes(null)).toEqual([]);
      expect(lerAjustes('["usar:canvas", 3, null]')).toEqual(["usar:canvas"]);
    });
  });

  describe("com recurso de alguém", () => {
    it("o dono precisa da permissão", () => {
      expect(pode(membro(), "ler:video", { user_id: 2 })).toBe(true);
      expect(pode(membro(["-ler:video"]), "ler:video", { user_id: 2 })).toBe(false);
    });

    it("o de outra conta pede a mesma com :outros", () => {
      expect(pode(membro(), "ler:video", { user_id: 1 })).toBe(false);
      expect(pode(membro(["ler:video:outros"]), "ler:video", { user_id: 1 })).toBe(true);
      expect(pode(admin(), "ler:video", { user_id: 2 })).toBe(true);
      expect(pode(admin(["-ler:video:outros"]), "ler:video", { user_id: 2 })).toBe(false);
    });

    it("permissão sem :outros no catálogo não vale para o de outra conta", () => {
      expect(pode(admin(), "usar:canvas", { user_id: 2 })).toBe(false);
    });

    it("recurso sem dono: ninguém", () => {
      expect(pode(admin(), "ler:video", { user_id: null })).toBe(false);
    });
  });
});

// --- no site ------------------------------------------------------------------------------

const get = (path: string, session: string, accept = "*/*") => call(new Request(`${SITE}${path}`, { headers: { cookie: session, accept } }), new FakeVideoApi());
const ajustar = (email: string, permissoes: string[]) => env.DB.prepare("UPDATE users SET permissoes = ? WHERE email = ?").bind(JSON.stringify(permissoes), email).run();
const MEMBRO = "membro@exemplo.com";

async function tokenDe(email: string): Promise<string> {
  const code = `ma_${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT ?, id, 'teste', ?, ? FROM users WHERE email = ?")
    .bind(crypto.randomUUID(), await sha256(code), new Date().toISOString(), email)
    .run();
  return code;
}
const api = (path: string, code: string) => call(new Request(`${SITE}${path}`, { headers: { authorization: `Bearer ${code}` } }));

describe("usar:modelo:teste", () => {
  it("o membro testador abre o modelo em teste; sem o ajuste, não", async () => {
    const session = await memberCookie();
    expect((await get("/modelo/heygen", session)).status).toBe(404);
    expect(await (await get("/", session)).text()).not.toContain('href="/modelo/heygen"');
    await ajustar(MEMBRO, ["usar:modelo:teste"]);
    expect((await get("/modelo/heygen", session)).status).toBe(200);
    expect(await (await get("/", session)).text()).toContain('href="/modelo/heygen"');
  });
});

describe("usar:canvas", () => {
  it("dado ao membro, abre os projetos e a aba aparece", async () => {
    const session = await memberCookie();
    expect((await get("/projetos", session)).status).toBe(404);
    await ajustar(MEMBRO, ["usar:canvas"]);
    expect((await get("/projetos", session)).status).toBe(200);
    expect(await (await get("/", session)).text()).toContain('href="/projetos"');
  });

  it("tirado do administrador, os projetos somem", async () => {
    const session = await cookie();
    await ajustar(ADMIN.email, ["-usar:canvas"]);
    expect((await get("/projetos", session)).status).toBe(404);
    expect(await (await get("/", session)).text()).not.toContain('href="/projetos"');
  });
});

describe("ver:painel", () => {
  it("dado ao membro, o painel abre e o item aparece no menu", async () => {
    const session = await memberCookie();
    await ajustar(MEMBRO, ["ver:painel"]);
    expect((await get("/painel", session)).status).toBe(200);
    expect(await (await get("/", session)).text()).toContain('href="/painel"');
  });

  it("tirado do administrador, o painel não existe", async () => {
    const session = await cookie();
    await ajustar(ADMIN.email, ["-ver:painel"]);
    expect((await get("/painel", session)).status).toBe(404);
    expect(await (await get("/", session)).text()).not.toContain('href="/painel"');
  });
});

describe("usar:api", () => {
  it("dado ao membro, o token abre a API; tirado do administrador, não", async () => {
    await cookie();
    await memberCookie();
    const doMembro = await tokenDe(MEMBRO);
    expect((await api("/api/v1/projetos", doMembro)).status).toBe(404);
    await ajustar(MEMBRO, ["usar:api"]);
    expect((await api("/api/v1/projetos", doMembro)).status).toBe(200);
    const doAdmin = await tokenDe(ADMIN.email);
    await ajustar(ADMIN.email, ["-usar:api"]);
    expect((await api("/api/v1/projetos", doAdmin)).status).toBe(404);
  });
});

describe("ler:video:outros", () => {
  async function videoDoAdmin(): Promise<string> {
    const session = await cookie();
    expect((await call(postForm("/modelo/wan", { estilo: "selfie", idioma: "pt-BR", fala: "Fala do administrador." }, { cookie: session }), new FakeVideoApi())).status).toBe(303);
    return (await env.DB.prepare("SELECT id FROM videos ORDER BY created_at DESC LIMIT 1").first<{ id: string }>())!.id;
  }

  it("dado ao membro, ele vê o vídeo de outra conta, só para ver", async () => {
    const id = await videoDoAdmin();
    const session = await memberCookie();
    expect((await get(`/video/${id}`, session)).status).toBe(404);
    await ajustar(MEMBRO, ["ler:video:outros"]);
    const res = await get(`/video/${id}`, session);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Fala do administrador.");
    expect(page).not.toContain("?refazer=");
  });

  it("tirado do administrador, o vídeo de outra conta não abre", async () => {
    const id = await videoDoAdmin();
    await memberCookie();
    await env.DB.prepare("UPDATE videos SET user_id = (SELECT id FROM users WHERE email = ?) WHERE id = ?").bind(MEMBRO, id).run();
    const session = await cookie();
    expect((await get(`/video/${id}`, session)).status).toBe(200);
    await ajustar(ADMIN.email, ["-ler:video:outros"]);
    expect((await get(`/video/${id}`, session)).status).toBe(404);
  });
});

describe("suspensa", () => {
  it("a sessão aberta deixa de valer na hora", async () => {
    const session = await cookie();
    expect((await get("/", session)).status).toBe(200);
    await ajustar(ADMIN.email, ["suspensa"]);
    const res = await get("/", session);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/entrar");
  });

  it("o login responde como senha errada, mesmo com a senha certa", async () => {
    await cookie();
    await ajustar(ADMIN.email, ["suspensa"]);
    const certa = await call(postForm("/entrar", { email: ADMIN.email, senha: ADMIN.senha }));
    const errada = await call(postForm("/entrar", { email: ADMIN.email, senha: "outra-senha-qualquer" }));
    expect(certa.status).toBe(errada.status);
    expect(certa.headers.get("set-cookie")).toBeNull();
    expect(await certa.text()).toContain(ERROS.loginIncorreto);
  });

  it("o token da API deixa de valer", async () => {
    await cookie();
    const code = await tokenDe(ADMIN.email);
    expect((await api("/api/v1/projetos", code)).status).toBe(200);
    await ajustar(ADMIN.email, ["suspensa"]);
    expect((await api("/api/v1/projetos", code)).status).toBe(401);
  });

  it("tirar a marca devolve o acesso", async () => {
    const session = await cookie();
    await ajustar(ADMIN.email, ["suspensa"]);
    await ajustar(ADMIN.email, []);
    expect((await get("/", session)).status).toBe(200);
  });
});
