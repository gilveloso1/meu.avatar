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

/** Um avatar com uma foto. */
async function avatarCom(session: string) {
  const res = await post("/avatares", { nome: "Camila", imagem: foto() }, session);
  const id = res.headers.get("location")!.split("/").pop()!;
  const [asset] = await db().assetsByAvatar(id);
  return { id, asset: asset! };
}
async function pasta(session: string, avatar: string, nome: string) {
  const res = await post(`/avatares/${avatar}/pastas`, { nome }, session);
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe(`/avatares/${avatar}`);
  return (await db().folders(avatar)).find((f) => f.name === nome.replace(/\s+/g, " ").trim())!;
}
/** Mais um arquivo no avatar, dentro da pasta (ou fora). */
async function arquivo(session: string, avatar: string, nome: string, pastaId = "") {
  await post(`/avatares/${avatar}/arquivos${pastaId ? `?pasta=${pastaId}` : ""}`, { arquivo: foto(nome) }, session);
  return (await db().assetsByAvatar(avatar)).find((a) => a.name === nome)!;
}

describe("pastas dos ativos", () => {
  it("a pasta é um item da lista de ativos, antes dos arquivos, com o ícone de pasta; aberta, mostra só o que está nela", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const campanha = await pasta(session, id, "  Campanha  de verão ");
    expect(campanha.name).toBe("Campanha de verão");
    const dentro = await arquivo(session, id, "dentro.png", campanha.id);
    expect(dentro.folder_id).toBe(campanha.id);

    // Na lista: a pasta como card e como linha, no grupo fixo do começo, e só o ativo de fora dela.
    const lista = await (await get(`/avatares/${id}`, session)).text();
    const fixo = /<section class="vgroup" data-group data-pinned>([\s\S]*?)<\/section>/.exec(lista)![1]!;
    expect(fixo).toContain(`<a class="frame frame--folder interactive" href="/avatares/${id}?pasta=${campanha.id}" data-kind="pasta" data-drop="${campanha.id}"`);
    expect(fixo).toContain(`<a class="vrow interactive" href="/avatares/${id}?pasta=${campanha.id}" data-kind="pasta"`);
    expect(fixo).toContain('<span class="icon">folder</span>');
    expect(fixo).toContain(">Campanha de verão<");
    expect(fixo).toContain('data-count="1"');
    expect(fixo).toContain("1 item");
    expect(lista.indexOf("data-group data-pinned")).toBeLessThan(lista.indexOf(`/arquivos/${asset.id}/mover`));
    expect(lista).not.toContain(`/arquivos/${dentro.id}/mover`);
    // O contador conta os arquivos, não as pastas.
    expect(lista).toContain('<span class="pane__count" data-library-count>1</span>');
    expect(lista).toContain('type="button" data-folder-new');
    // O diálogo de apagar só diz quantos itens a pasta tem (o script põe o número) e dá as opções.
    expect(lista).toContain('data-with-items="Apagar os itens também?"');
    expect(lista).toMatch(/name="itens" value="manter"[^>]*>Apagar pasta<[\s\S]{0,200}name="itens" value="apagar" hidden>/);
    expect(lista).not.toContain('class="crumbs"');
    // Os rótulos dos diálogos não usam data-rename: é o atributo do campo Nome (o script o trata como formulário).
    expect(lista).not.toMatch(/<(?:h2|button)[^>]* data-rename/);

    // Dentro da pasta: o caminho de volta (com renomear e apagar), só os arquivos dela e nada de pasta nova.
    const aberta = await (await get(`/avatares/${id}?pasta=${campanha.id}`, session)).text();
    expect(aberta).toMatch(new RegExp(`class="crumbs" data-folder="/avatares/${id}/pastas/${campanha.id}"[\\s\\S]*href="/avatares/${id}" data-drop="">Ativos<[\\s\\S]*aria-current="page">Campanha de verão<`));
    expect(aberta).toContain('data-folder-act="renomear"');
    expect(aberta).toContain('data-folder-act="apagar"');
    expect(aberta).toContain(`/arquivos/${dentro.id}/mover`);
    expect(aberta).not.toContain(`/arquivos/${asset.id}/mover`);
    expect(aberta).not.toContain("data-group data-pinned");
    expect(aberta).not.toContain('type="button" data-folder-new');
    // Pasta vazia, e pasta que não existe (a lista de ativos).
    const vazia = await pasta(session, id, "Vazia");
    expect(await (await get(`/avatares/${id}?pasta=${vazia.id}`, session)).text()).toContain("Pasta vazia");
    expect(await (await get(`/avatares/${id}?pasta=${crypto.randomUUID()}`, session)).text()).toContain(`/arquivos/${asset.id}/mover`);
    // Só com pastas (nenhum arquivo fora delas), a lista segue montada, com as pastas.
    await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: vazia.id }, session);
    const soPastas = await (await get(`/avatares/${id}`, session)).text();
    expect(soPastas).toContain("data-group data-pinned");
    expect(soPastas).not.toContain("Nenhum ativo ainda");
  });

  it("move o ativo pelo diálogo e arrastando; o arquivo enviado de dentro da pasta fica nela", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const fotos = await pasta(session, id, "Fotos");

    const mover = await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: fotos.id, volta: "" }, session);
    expect(mover.status).toBe(303);
    expect(mover.headers.get("location")).toBe(`/avatares/${id}`);
    expect((await db().asset(id, asset.id))!.folder_id).toBe(fotos.id);

    // A página do ativo diz a pasta, fecha nela e tem o "Mover para" (onde ele já está, desligado).
    const ver = await (await get(`/avatares/${id}/arquivos/${asset.id}/ver`, session)).text();
    expect(ver).toMatch(/Pasta<[\s\S]{0,200}Fotos/);
    expect(ver).toContain(`href="/avatares/${id}?pasta=${fotos.id}" aria-label="Fechar"`);
    expect(ver).toMatch(new RegExp(`name="destino" value="${fotos.id}" disabled`));
    expect(ver).toContain('name="destino" value="">');
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
  });

  it("renomeia a pasta; não há pasta dentro de pasta", async () => {
    const session = await cookie();
    const { id } = await avatarCom(session);
    const a = await pasta(session, id, "A");
    const renomear = await post(`/avatares/${id}/pastas/${a.id}/nome`, { nome: "Anúncios", volta: a.id }, session);
    expect(renomear.headers.get("location")).toBe(`/avatares/${id}?pasta=${a.id}`);
    expect((await db().folders(id)).map((f) => f.name)).toEqual(["Anúncios"]);
    const semNome = await post(`/avatares/${id}/pastas/${a.id}/nome`, { nome: "  " }, session);
    expect(semNome.status).toBe(400);
    expect(await semNome.text()).toContain(ERROS.pastaNome);
    // Pedir uma pasta "dentro" de outra cria na lista; mover pasta não existe.
    await post(`/avatares/${id}/pastas`, { nome: "B", pasta: a.id }, session);
    expect((await db().folders(id)).map((f) => f.name)).toEqual(["Anúncios", "B"]);
    expect((await post(`/avatares/${id}/pastas/${a.id}/mover`, { destino: "" }, session)).status).toBe(404);
  });

  it("apagar a pasta devolvendo os itens: eles voltam para a lista e nenhum arquivo é apagado", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const a = await pasta(session, id, "A");
    await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: a.id }, session);
    const outro = await arquivo(session, id, "outro.png", a.id);

    const res = await post(`/avatares/${id}/pastas/${a.id}/apagar`, { itens: "manter" }, session);
    expect(res.headers.get("location")).toBe(`/avatares/${id}`);
    expect(await db().folders(id)).toEqual([]);
    expect((await db().assetsByAvatar(id)).map((x) => x.folder_id)).toEqual([null, null]);
    expect(await env.MIDIA.get(asset.key)).not.toBeNull();
    expect(await env.MIDIA.get(outro.key)).not.toBeNull();
    expect((await db().avatarById(id))!.photo_asset).toBe(asset.id);
    const lista = await (await get(`/avatares/${id}`, session)).text();
    expect(lista).toContain(`/arquivos/${asset.id}/mover`);
    expect(lista).toContain(`/arquivos/${outro.id}/mover`);
  });

  it("apagar a pasta com os itens: só os dela somem, com os arquivos; o vídeo salvo continua nos Vídeos", async () => {
    const session = await cookie();
    const { id, asset } = await avatarCom(session);
    const a = await pasta(session, id, "A");
    const fora = await arquivo(session, id, "fora.png");
    const dentro = await arquivo(session, id, "dentro.png", a.id);
    await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: a.id }, session);
    // Um vídeo gerado, salvo no avatar e posto na pasta: o ativo é um vínculo, sem arquivo próprio.
    const dono = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").first<{ id: number }>())!.id;
    await db().insertVideo({ id: "um-video", prompt: "Oi", model: "alibaba/wan-3.0", duration: 5, resolution: "480p", aspect_ratio: "9:16", image_key: null, user_id: dono, request_prompt: "x", style: null, language: null, extra: null, structure: "wan", settings: null, avatar_id: null });
    await env.DB.prepare("INSERT INTO avatar_assets (id, avatar_id, kind, key, name, type, size, source_video, folder_id, created_at) VALUES ('vinculo', ?, 'video', 'videos/de-um-video.mp4', 'Vídeo salvo', 'video/mp4', 10, 'um-video', ?, ?)").bind(id, a.id, new Date().toISOString()).run();
    await env.MIDIA.put("videos/de-um-video.mp4", "mp4");

    // Sem dizer "apagar", os itens ficam: o padrão nunca apaga arquivo.
    const b = await pasta(session, id, "B");
    await post(`/avatares/${id}/pastas/${b.id}/apagar`, {}, session);
    expect((await db().assetsByAvatar(id)).length).toBe(4);
    expect(await db().videoById("um-video")).not.toBeNull();

    const res = await post(`/avatares/${id}/pastas/${a.id}/apagar`, { itens: "apagar" }, session);
    expect(res.headers.get("location")).toBe(`/avatares/${id}`);
    expect(await db().folders(id)).toEqual([]);
    expect((await db().assetsByAvatar(id)).map((x) => x.id)).toEqual([fora.id]);
    expect(await env.MIDIA.get(dentro.key)).toBeNull();
    expect(await env.MIDIA.get(asset.key)).toBeNull();
    expect(await env.MIDIA.get(fora.key)).not.toBeNull();
    expect(await env.MIDIA.get("videos/de-um-video.mp4")).not.toBeNull();
    expect(await db().videoById("um-video")).not.toBeNull();
    // A foto principal estava na pasta: o lugar dela esvazia, como ao apagar o ativo.
    expect((await db().avatarById(id))!.photo_asset).toBeNull();

    // Apagar o avatar leva as pastas junto.
    await pasta(session, id, "C");
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
    await env.DB.batch(Array.from({ length: MAX_FOLDERS }, (_, i) => env.DB.prepare("INSERT INTO folders (id, avatar_id, name, created_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, `Pasta ${i}`, agora)));
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
    // Pasta de outro avatar da mesma pessoa: não é destino nem se mexe por este avatar.
    expect((await post(`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: deOutro.id }, session)).status).toBe(404);
    expect((await post(`/avatares/${id}/pastas/${deOutro.id}/apagar`, { itens: "apagar" }, session)).status).toBe(404);
    expect((await post(`/avatares/${id}/pastas/${deOutro.id}/nome`, { nome: "X" }, session)).status).toBe(404);
    await post(`/avatares/${id}/arquivos?pasta=${deOutro.id}`, { arquivo: foto("solto.png") }, session);
    expect((await db().assetsByAvatar(id)).find((x) => x.name === "solto.png")!.folder_id).toBeNull();

    // Outra conta não vê nem mexe.
    const member = await memberCookie();
    expect((await get(`/avatares/${id}?pasta=${a.id}`, member)).status).toBe(404);
    for (const [path, fields] of [
      [`/avatares/${id}/pastas`, { nome: "Invasão" }],
      [`/avatares/${id}/pastas/${a.id}/nome`, { nome: "Invasão" }],
      [`/avatares/${id}/pastas/${a.id}/apagar`, { itens: "apagar" }],
      [`/avatares/${id}/arquivos/${asset.id}/mover`, { destino: a.id }],
    ] as [string, Record<string, string>][]) expect((await post(path, fields, member)).status).toBe(404);
    expect((await db().folders(id)).map((f) => f.name)).toEqual(["A"]);
    expect((await db().asset(id, asset.id))!.folder_id).toBeNull();
    expect(await env.MIDIA.get(asset.key)).not.toBeNull();
  });
});
