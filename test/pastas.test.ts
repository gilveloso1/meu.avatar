import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { ERROS } from "../src/erros";
import { MAX_FOLDERS } from "../src/site/site";
import { call, cookie, memberCookie, postForm, SITE } from "./helpers";

const db = () => new Db(env.DB);
const foto = (nome = "principal.png") => new File([new TextEncoder().encode("foto")], nome, { type: "image/png" });
const get = (path: string, session: string) => call(new Request(`${SITE}${path}`, { headers: { cookie: session } }));
const post = (path: string, fields: Record<string, string | File>, session: string, headers: Record<string, string> = {}) => call(postForm(path, fields, { cookie: session, ...headers }));

/** Um avatar com uma foto, e as pastas pedidas (cada uma dentro da anterior, se `dentro`). */
async function avatarCom(session: string) {
  const res = await post("/avatares", { nome: "Camila", imagem: foto() }, session);
  const id = res.headers.get("location")!.split("/").pop()!;
  const [asset] = await db().assetsByAvatar(id);
  return { id, asset: asset! };
}
async function pasta(session: string, avatar: string, nome: string, dentro = "") {
  const res = await post(`/avatares/${avatar}/pastas`, { nome, pasta: dentro }, session);
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe(`/avatares/${avatar}${dentro ? `?pasta=${dentro}` : ""}`);
  return (await db().folders(avatar)).find((f) => f.name === nome.replace(/\s+/g, " ").trim() && (f.parent_id ?? "") === dentro)!;
}

describe("pastas dos ativos", () => {
  it("cria pasta, e pasta dentro de pasta; a lista mostra só o que está na pasta aberta, com o caminho", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const campanha = await pasta(session, id, "  Campanha  de verão ");
    expect(campanha.name).toBe("Campanha de verão");
    const fotos = await pasta(session, id, "Fotos", campanha.id);
    expect(fotos.parent_id).toBe(campanha.id);

    // Na raiz: o card da pasta de cima (com o que tem dentro), o ativo e nenhum caminho.
    const raiz = await (await get(`/avatares/${id}`, session)).text();
    expect(raiz).toContain(`href="/avatares/${id}?pasta=${campanha.id}"`);
    expect(raiz).toContain("1 item");
    expect(raiz).not.toContain(`href="/avatares/${id}?pasta=${fotos.id}" draggable`);
    expect(raiz).toContain(`data-move="/avatares/${id}/arquivos/${asset.id}/mover"`);
    expect(raiz).not.toContain('class="crumbs"');
    // Os rótulos dos diálogos não usam data-rename: é o atributo do campo Nome (o script o trata como formulário).
    expect(raiz).not.toMatch(/<(?:h2|button)[^>]* data-rename/);

    // Dentro da pasta: o caminho, a pasta de dentro e, sem arquivos, "Pasta vazia".
    const dentro = await (await get(`/avatares/${id}?pasta=${fotos.id}`, session)).text();
    expect(dentro).toMatch(new RegExp(`class="crumbs"[\\s\\S]*href="/avatares/${id}" data-drop=""[\\s\\S]*href="/avatares/${id}\\?pasta=${campanha.id}" data-drop="${campanha.id}"[\\s\\S]*aria-current="page">Fotos<`));
    expect(dentro).toContain("Pasta vazia");
    expect(dentro).not.toContain(`/arquivos/${asset.id}/mover`);
    // Pasta que não existe: a raiz.
    expect(await (await get(`/avatares/${id}?pasta=${crypto.randomUUID()}`, session)).text()).toContain(`/arquivos/${asset.id}/mover`);
  });

  it("move o ativo pelo diálogo e arrastando; o arquivo enviado de dentro da pasta fica nela", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const fotos = await pasta(session, id, "Fotos");

    const mover = await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: fotos.id, volta: "" }, session);
    expect(mover.status).toBe(303);
    expect(mover.headers.get("location")).toBe(`/avatares/${id}`);
    expect((await db().asset(id, asset.id))!.folder_id).toBe(fotos.id);
    expect(await (await get(`/avatares/${id}`, session)).text()).not.toContain(`/arquivos/${asset.id}/mover`);
    expect(await (await get(`/avatares/${id}?pasta=${fotos.id}`, session)).text()).toContain(`/arquivos/${asset.id}/mover`);

    // A página do ativo diz a pasta, fecha nela e tem o "Mover para" (onde ele já está, desligado).
    const ver = await (await get(`/avatares/${id}/arquivos/${asset.id}/ver`, session)).text();
    expect(ver).toContain("Ativos › Fotos");
    expect(ver).toContain(`href="/avatares/${id}?pasta=${fotos.id}" aria-label="Fechar"`);
    expect(ver).toMatch(new RegExp(`name="destino" value="${fotos.id}"[^>]* disabled`));
    const pelaPagina = await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: "", de: `/avatares/${id}/arquivos/${asset.id}/ver` }, session);
    expect(pelaPagina.headers.get("location")).toBe(`/avatares/${id}/arquivos/${asset.id}/ver`);
    expect((await db().asset(id, asset.id))!.folder_id).toBeNull();

    // Arrastar: o script manda e recebe 204, sem página.
    const arrastar = await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: fotos.id }, session, { "x-fetch": "1" });
    expect(arrastar.status).toBe(204);
    expect((await db().asset(id, asset.id))!.folder_id).toBe(fotos.id);

    // Destino que não é pasta deste avatar não serve; "de" de fora do avatar é ignorado.
    expect((await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: crypto.randomUUID() }, session)).status).toBe(404);
    expect((await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: "", de: "https://exemplo.com/x" }, session)).headers.get("location")).toBe(`/avatares/${id}?pasta=${fotos.id}`);

    const envio = await post(`/avatares/${id}/arquivos?pasta=${fotos.id}`, { arquivo: foto("outra.png") }, session);
    expect(envio.headers.get("location")).toBe(`/avatares/${id}?pasta=${fotos.id}`);
    expect((await db().assetsByAvatar(id)).find((a) => a.name === "outra.png")!.folder_id).toBe(fotos.id);
  });

  it("renomeia e move a pasta, nunca para dentro dela mesma", async () => {
    const session = await cookie();
    const { id } = await avatarCom(session);
    const a = await pasta(session, id, "A");
    const b = await pasta(session, id, "B", a.id);
    const c = await pasta(session, id, "C");

    await post(`/avatares/${id}/pastas/${a.id}/nome`, { nome: "Anúncios", volta: "" }, session);
    expect((await db().folders(id)).find((f) => f.id === a.id)!.name).toBe("Anúncios");
    const semNome = await post(`/avatares/${id}/pastas/${a.id}/nome`, { nome: "  " }, session);
    expect(semNome.status).toBe(400);
    expect(await semNome.text()).toContain(ERROS.pastaNome);

    // Para dentro dela mesma ou de uma pasta que está nela: recusado, nada muda.
    for (const destino of [a.id, b.id]) expect((await post(`/avatares/${id}/pastas/${a.id}/mover`, { destino }, session)).status).toBe(400);
    expect((await db().folders(id)).find((f) => f.id === a.id)!.parent_id).toBeNull();
    expect((await post(`/avatares/${id}/pastas/${a.id}/mover`, { destino: c.id }, session)).status).toBe(303);
    expect((await db().folders(id)).find((f) => f.id === a.id)!.parent_id).toBe(c.id);
    // O diálogo lista a árvore inteira, com o caminho de cada pasta (o script desliga a movida e as de dentro).
    const pagina = await (await get(`/avatares/${id}`, session)).text();
    expect(pagina).toContain(`name="destino" value="${b.id}" data-path="/${c.id}/${a.id}/${b.id}"`);
    expect(pagina).toContain('name="destino" value="" data-path=""');
  });

  it("apagar a pasta não apaga arquivo: o que estava nela sobe um nível", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const a = await pasta(session, id, "A");
    const b = await pasta(session, id, "B", a.id);
    const c = await pasta(session, id, "C", b.id);
    await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: b.id }, session);

    const res = await post(`/avatares/${id}/pastas/${b.id}/apagar`, {}, session);
    expect(res.headers.get("location")).toBe(`/avatares/${id}?pasta=${a.id}`);
    const pastas = await db().folders(id);
    expect(pastas.map((f) => f.name).sort()).toEqual(["A", "C"]);
    expect(pastas.find((f) => f.id === c.id)!.parent_id).toBe(a.id);
    expect((await db().asset(id, asset.id))!.folder_id).toBe(a.id);
    expect(await env.MIDIA.get(asset.key)).not.toBeNull();

    // Apagar o avatar leva as pastas junto.
    await post(`/avatares/${id}/apagar`, {}, session);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM folders").first("n")).toBe(0);
  });

  it("recusa pasta sem nome e pastas demais", async () => {
    const session = await cookie();
    const { id } = await avatarCom(session);
    const semNome = await post(`/avatares/${id}/pastas`, { nome: " " }, session);
    expect(semNome.status).toBe(400);
    expect(await semNome.text()).toContain(ERROS.pastaNome);
    const agora = new Date().toISOString();
    await env.DB.batch(Array.from({ length: MAX_FOLDERS }, (_, i) => env.DB.prepare("INSERT INTO folders (id, avatar_id, parent_id, name, created_at) VALUES (?, ?, NULL, ?, ?)").bind(crypto.randomUUID(), id, `Pasta ${i}`, agora)));
    const demais = await post(`/avatares/${id}/pastas`, { nome: "Mais uma" }, session);
    expect(demais.status).toBe(400);
    expect(await demais.text()).toContain(ERROS.pastasDemais);
    expect((await db().folders(id)).length).toBe(MAX_FOLDERS);
  });

  it("as pastas são só de quem criou o avatar, e uma pasta de outro avatar não serve de destino", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const a = await pasta(session, id, "A");
    const outro = await avatarCom(session);
    const deOutro = await pasta(session, outro.id, "De outro avatar");
    // Pasta de outro avatar da mesma pessoa: não é destino, nem pasta de cima, nem se mexe por este avatar.
    expect((await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: deOutro.id }, session)).status).toBe(404);
    expect((await post(`/avatares/${id}/pastas/${a.id}/mover`, { destino: deOutro.id }, session)).status).toBe(404);
    expect((await post(`/avatares/${id}/pastas/${deOutro.id}/apagar`, {}, session)).status).toBe(404);
    await post(`/avatares/${id}/pastas`, { nome: "Na raiz", pasta: deOutro.id }, session);
    expect((await db().folders(id)).find((f) => f.name === "Na raiz")!.parent_id).toBeNull();

    // Outra conta não vê nem mexe.
    const member = await memberCookie();
    expect((await get(`/avatares/${id}?pasta=${a.id}`, member)).status).toBe(404);
    for (const [path, fields] of [
      [`/avatares/${id}/pastas`, { nome: "Invasão" }],
      [`/avatares/${id}/pastas/${a.id}/nome`, { nome: "Invasão" }],
      [`/avatares/${id}/pastas/${a.id}/mover`, { destino: "" }],
      [`/avatares/${id}/pastas/${a.id}/apagar`, {}],
      [`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: a.id }],
    ] as [string, Record<string, string>][]) expect((await post(path, fields, member)).status).toBe(404);
    expect((await db().folders(id)).map((f) => f.name).sort()).toEqual(["A", "Na raiz"]);
    expect((await db().asset(id, asset.id))!.folder_id).toBeNull();
  });
});
