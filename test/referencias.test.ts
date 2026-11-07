import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { ERROS } from "../src/erros";
import { call, cookie, FakeVideoApi, memberCookie, postForm, SITE } from "./helpers";

// Imagem e vídeo de referência no painel do modelo, sem avatar: o que a pessoa gerou ("Adicionar
// ativo", arrastar da lista, "Usar para gerar") e os arquivos de um vídeo (Refazer).

const FALA = "Oi, gente! Hoje eu vou mostrar como eu faço meus vídeos.";
const WAN = { estilo: "selfie", idioma: "pt-BR", fala: FALA };
const db = () => new Db(env.DB);
const get = (path: string, session: string) => call(new Request(`${SITE}${path}`, { headers: { cookie: session } }));
const foto = (texto: string) => new File([new TextEncoder().encode(texto)], "foto.png", { type: "image/png" });

/** Um vídeo do Wan pronto; `imagem: true` faz dele uma imagem do Nano Banana (o resultado é uma foto). */
async function pronto(session: string, o: { imagem?: boolean; campos?: Record<string, string | File> } = {}) {
  expect((await call(postForm("/modelo/wan", { ...WAN, ...o.campos }, { cookie: session }), new FakeVideoApi())).status).toBe(303);
  const [video] = await db().recentVideos(1);
  const key = o.imagem ? `videos/${video!.id}.png` : `videos/${video!.id}.mp4`;
  await env.MIDIA.put(key, o.imagem ? "imagem-gerada" : "video-gerado", { httpMetadata: { contentType: o.imagem ? "image/png" : "video/mp4" } });
  if (o.imagem) await env.DB.prepare("UPDATE videos SET structure = 'nano-banana' WHERE id = ?").bind(video!.id).run();
  await db().updateVideo(video!.id, { status: "completed", video_key: key });
  return (await db().videoById(video!.id))!;
}

/** O conteúdo da foto que o último vídeo mandou para o modelo. */
async function fotoEnviada(): Promise<string | null> {
  const [video] = await db().recentVideos(1);
  const object = video?.image_key ? await env.MIDIA.get(video.image_key) : null;
  return object ? object.text() : null;
}

describe("referências sem avatar", () => {
  it("uma imagem gerada vira a foto de outro modelo, sem avatar", async () => {
    const session = await cookie();
    const imagem = await pronto(session, { imagem: true });
    const res = await call(postForm("/modelo/wan", { ...WAN, ativo: `gerado:${imagem.id}` }, { cookie: session }), new FakeVideoApi());
    expect(res.status).toBe(303);
    expect(await fotoEnviada()).toBe("imagem-gerada");
    const [video] = await db().recentVideos(1);
    expect(video!.avatar_id).toBeNull();
  });

  it("vídeo gerado não entra num modelo que só aceita foto", async () => {
    const session = await cookie();
    const video = await pronto(session);
    const api = new FakeVideoApi();
    const res = await call(postForm("/modelo/wan", { ...WAN, ativo: `gerado:${video.id}` }, { cookie: session }), api);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(ERROS.ativoIndisponivel);
    expect(api.submitted).toHaveLength(0);
  });

  it("imagem ou arquivo de vídeo de outra pessoa não serve", async () => {
    const dono = await cookie();
    const imagem = await pronto(dono, { imagem: true });
    const comFoto = await pronto(dono, { campos: { imagem: foto("foto-do-dono") } });
    const membro = await memberCookie();
    const api = new FakeVideoApi();
    for (const ativo of [`gerado:${imagem.id}`, `origem:${comFoto.id}:imagem`, `gerado:${crypto.randomUUID()}`, "gerado:qualquer"]) {
      const res = await call(postForm("/modelo/wan", { ...WAN, ativo }, { cookie: membro }), api);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain(ERROS.ativoIndisponivel);
    }
    expect(api.submitted).toHaveLength(0);
    // Nem a prévia do arquivo usado, nem a página do modelo com a escolha alheia.
    expect((await get(`/videos/${comFoto.id}/referencia/imagem`, membro)).status).toBe(404);
    expect((await get(`/videos/${comFoto.id}/referencia/imagem`, dono)).status).toBe(200);
    expect(await (await get(`/modelo/wan?usar=gerado:${imagem.id}`, membro)).text()).not.toContain(`gerado:${imagem.id}`);
  });

  it("Adicionar ativo lista o que a pessoa gerou em todos os modelos, só dos tipos aceitos, com Mostrar mais", async () => {
    const session = await cookie();
    const imagens = [];
    for (let i = 0; i < 13; i++) imagens.push(await pronto(session, { imagem: true }));
    const video = await pronto(session);
    const page = await (await get("/modelo/wan", session)).text();
    expect(page).toContain('data-panel-open="referencias"');
    expect(page).toContain("Adicionar ativo");
    expect(page).toContain(`data-asset="gerado:${imagens[12]!.id}"`);
    expect(page).not.toContain(`data-asset="gerado:${imagens[0]!.id}"`);
    expect(page).not.toContain(`data-asset="gerado:${video.id}"`);
    expect(page).toContain('data-generated-more="12"');
    const mais = await (await get("/gerados?tipo=imagem&de=12", session)).text();
    expect(mais).toContain(`data-asset="gerado:${imagens[0]!.id}"`);
    expect(mais).not.toContain("data-generated-more");
    // A lista é só da pessoa.
    const membro = await memberCookie();
    expect(await (await get("/gerados?tipo=imagem", membro)).text()).not.toContain("gerado:");
    expect(await (await get("/modelo/wan", membro)).text()).not.toContain(`gerado:${imagens[0]!.id}`);
  });

  it("os vídeos prontos da pessoa na lista do modelo podem ser arrastados para o painel; os dos outros, não", async () => {
    const dono = await cookie();
    const video = await pronto(dono);
    expect(await (await get("/modelo/wan", dono)).text()).toContain(`&quot;id&quot;:&quot;gerado:${video.id}&quot;`);
    const membro = await memberCookie();
    const page = await (await get("/modelo/wan", membro)).text();
    expect(page).toContain(`data-video="${video.id}"`);
    expect(page).not.toContain(`gerado:${video.id}`);
  });
});

describe("Usar para gerar", () => {
  it("só aparece aberto de um modelo que aceita o tipo, e volta para ele com o arquivo", async () => {
    const session = await cookie();
    const imagem = await pronto(session, { imagem: true });
    const doModelo = await (await get(`/video/${imagem.id}?de=${encodeURIComponent("/modelo/wan")}`, session)).text();
    expect(doModelo).toContain(`href="/modelo/wan?usar=gerado:${imagem.id}"`);
    expect(doModelo).toContain("Usar para gerar");
    expect(await (await get(`/video/${imagem.id}?de=/videos`, session)).text()).not.toContain("?usar=gerado:");
    expect(await (await get(`/video/${imagem.id}`, session)).text()).not.toContain("?usar=gerado:");

    const video = await pronto(session);
    expect(await (await get(`/video/${video.id}?de=/modelo/wan`, session)).text()).not.toContain("?usar=gerado:");
    expect(await (await get(`/video/${video.id}?de=/modelo/seedance`, session)).text()).toContain(`href="/modelo/seedance?usar=gerado:${video.id}"`);

    const painel = await (await get(`/modelo/wan?usar=gerado:${imagem.id}`, session)).text();
    expect(painel).toContain(`gerado:${imagem.id}`);
    expect(painel).toContain("Imagem gerada");
  });

  it("não aparece para quem não gerou o vídeo", async () => {
    const imagem = await pronto(await cookie(), { imagem: true });
    await env.DB.prepare("UPDATE videos SET structure = 'wan' WHERE id = ?").bind(imagem.id).run();
    expect(await (await get(`/video/${imagem.id}?de=/modelo/seedance`, await memberCookie())).text()).not.toContain("?usar=gerado:");
  });

  it("não aparece quando o arquivo do vídeo não existe: o botão nunca leva a nada", async () => {
    const session = await cookie();
    const video = await pronto(session);
    await env.MIDIA.delete(video.video_key!);
    expect(await (await get(`/video/${video.id}?de=/modelo/seedance`, session)).text()).not.toContain("?usar=gerado:");
  });
});

describe("Refazer", () => {
  /** Os ids e itens que a página do modelo devolve escolhidos (data-picks). */
  const escolhas = (page: string) => JSON.parse((/data-picks="([^"]*)"/.exec(page)?.[1] ?? "{}").replaceAll("&quot;", '"').replaceAll("&amp;", "&")) as { avatar?: string; assets?: string[]; items?: { id: string; name: string; hint: string }[] };

  it("com o ativo do avatar, volta o mesmo avatar e o mesmo ativo, e a foto vai de novo para o modelo", async () => {
    const session = await cookie();
    const avatar = await call(postForm("/avatares", { nome: "Camila", imagem: foto("foto-do-avatar") }, { cookie: session }));
    const avatarId = avatar.headers.get("location")!.split("/").pop()!;
    const principal = (await db().avatarById(avatarId))!.photo_asset!;
    const feito = await pronto(session, { campos: { avatar: avatarId, ativo: principal } });
    const picks = escolhas(await (await get(`/modelo/wan?refazer=${feito.id}`, session)).text());
    expect(picks).toMatchObject({ avatar: avatarId, assets: [principal], items: [] });

    const res = await call(postForm("/modelo/wan", { ...WAN, avatar: avatarId, ativo: principal }, { cookie: session }), new FakeVideoApi());
    expect(res.status).toBe(303);
    expect(await fotoEnviada()).toBe("foto-do-avatar");
    const [novo] = await db().recentVideos(1);
    expect(novo!.avatar_id).toBe(avatarId);
  });

  it("com o ativo apagado depois, volta a cópia que o vídeo guarda", async () => {
    const session = await cookie();
    const avatar = await call(postForm("/avatares", { nome: "Camila", imagem: foto("foto-do-avatar") }, { cookie: session }));
    const avatarId = avatar.headers.get("location")!.split("/").pop()!;
    const principal = (await db().avatarById(avatarId))!.photo_asset!;
    const feito = await pronto(session, { campos: { avatar: avatarId, ativo: principal } });
    await call(postForm(`/avatares/${avatarId}/arquivos/${principal}/apagar`, {}, { cookie: session }));
    const picks = escolhas(await (await get(`/modelo/wan?refazer=${feito.id}`, session)).text());
    expect(picks.assets).toEqual([`origem:${feito.id}:imagem`]);
    expect(picks.items![0]).toMatchObject({ hint: "Do vídeo original" });
    expect(await (await get(`/videos/${feito.id}/referencia/imagem`, session)).text()).toBe("foto-do-avatar");
  });

  it("com arquivo enviado solto, volta o arquivo com o nome dele, sem avatar, e segue assim no próximo Refazer", async () => {
    const session = await cookie();
    const feito = await pronto(session, { campos: { imagem: foto("foto-solta") } });
    const picks = escolhas(await (await get(`/modelo/wan?refazer=${feito.id}`, session)).text());
    expect(picks).toMatchObject({ avatar: "", assets: [`origem:${feito.id}:imagem`] });
    expect(picks.items![0]).toMatchObject({ name: "foto.png", hint: "Arquivo enviado" });

    expect((await call(postForm("/modelo/wan", { ...WAN, ativo: `origem:${feito.id}:imagem` }, { cookie: session }), new FakeVideoApi())).status).toBe(303);
    expect(await fotoEnviada()).toBe("foto-solta");
    const [novo] = await db().recentVideos(1);
    expect(escolhas(await (await get(`/modelo/wan?refazer=${novo!.id}`, session)).text()).items![0]).toMatchObject({ name: "foto.png", hint: "Arquivo enviado" });
  });

  it("com imagem gerada, volta a mesma imagem gerada", async () => {
    const session = await cookie();
    const imagem = await pronto(session, { imagem: true });
    const feito = await pronto(session, { campos: { ativo: `gerado:${imagem.id}` } });
    const picks = escolhas(await (await get(`/modelo/wan?refazer=${feito.id}`, session)).text());
    expect(picks.assets).toEqual([`gerado:${imagem.id}`]);
    expect(picks.items![0]).toMatchObject({ hint: "Imagem gerada" });
  });

  it("de um vídeo de outra pessoa, volta só com o texto e os ajustes", async () => {
    const feito = await pronto(await cookie(), { campos: { imagem: foto("foto-do-dono") } });
    const page = await (await get(`/modelo/wan?refazer=${feito.id}`, await memberCookie())).text();
    expect(page).toContain(FALA);
    expect(page).not.toContain(`origem:${feito.id}`);
    expect(page).not.toContain("data-picks");
  });
});
