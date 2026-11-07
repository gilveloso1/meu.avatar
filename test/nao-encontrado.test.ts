import { describe, expect, it } from "vitest";
import { ERROS } from "../src/erros";
import { call, cookie, memberCookie, SITE } from "./helpers";

// A página de não encontrado: o navegador abrindo um endereço que não existe (ou que a conta
// não pode ver) recebe uma página do site; o script da página e os arquivos, o texto curto.

const NAVEGADOR = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const abrir = (path: string, session?: string, accept = NAVEGADOR) =>
  call(new Request(`${SITE}${path}`, { headers: { accept, ...(session ? { cookie: session } : {}) } }));

describe("não encontrado", () => {
  it("o navegador recebe a página, com a barra do site e o caminho de volta", async () => {
    const res = await abrir("/nao-existe", await cookie());
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    const page = await res.text();
    expect(page).toContain('<p class="empty__code">404</p>');
    expect(page).toContain("Página não encontrada.");
    expect(page).toContain("Confira o endereço ou volte ao início.");
    expect(page).toContain('href="/">Voltar ao início</a>');
    expect(page).toContain('aria-label="Seções"');
    // Nenhuma seção marcada na barra.
    expect(/<nav class="nav-pills"[^]*?<\/nav>/.exec(page)![0]).not.toContain("aria-current");
    expect(ERROS.naoEncontrado).toBe("Página não encontrada. Confira o endereço ou volte ao início.");
  });

  it("vale para um vídeo que não existe", async () => {
    const res = await abrir(`/video/${crypto.randomUUID()}`, await cookie());
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Página não encontrada.");
  });

  it("vale para o que a conta não pode abrir (os projetos, para a conta comum)", async () => {
    const res = await abrir("/projetos", await memberCookie());
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Página não encontrada.");
  });

  it("o script da página e os arquivos continuam com o texto curto", async () => {
    const session = await cookie();
    const res = await abrir(`/videos/${crypto.randomUUID()}/rosto`, session, "*/*");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("não encontrado");
  });

  it("sem login, continua indo para /entrar", async () => {
    const res = await abrir("/nao-existe");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/entrar");
  });
});
