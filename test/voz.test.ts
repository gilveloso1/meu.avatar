import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { ERROS } from "../src/erros";
import { mp3Duration } from "../src/mp3";
import { estimate } from "../src/structures";
import { ELEVENLABS, elevenVoices, EMOTIONS, MAX_SPEECH, PREVIEW_TEXT, speechText, spokenText } from "../src/structures/voz";
import { call, cookie, ELEVEN_MODEL, FakeHeyGenApi, FakeVideoApi, memberCookie, mp3, postForm, SITE } from "./helpers";

const TEXTO = "[excited] Gente, eu preciso contar uma coisa! Olha a diferença na minha pele.";

async function post(api: FakeVideoApi, fields: Record<string, string>, session?: string) {
  return call(postForm("/modelo/elevenlabs", fields, { cookie: session ?? (await cookie()) }), api);
}
const get = async (path: string, api: FakeVideoApi | null = new FakeVideoApi(), session?: string, heygen: FakeHeyGenApi | null = null) =>
  call(new Request(`${SITE}${path}`, { headers: { cookie: session ?? (await cookie()) } }), api, null, heygen);
const ultimo = async () => (await new Db(env.DB).recentVideos())[0]!;

describe("MP3", () => {
  it("a duração sai do primeiro quadro, com ou sem ID3", () => {
    expect(mp3Duration(mp3(2))).toBeCloseTo(2);
    const id3 = new Uint8Array(10 + 5 + 32_000);
    id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5]);
    id3.set(new Uint8Array(mp3(2)), 15);
    expect(mp3Duration(id3.buffer)).toBeCloseTo(2);
    expect(mp3Duration(new TextEncoder().encode("não é mp3").buffer as ArrayBuffer)).toBeNull();
  });
});

describe("Emoções da fala", () => {
  it("em português ou em inglês, viram a marcação em inglês; outro texto entre colchetes fica", () => {
    expect(speechText("Oi! [Sussurro] não é filtro [risada]  [laughs]\n[short pause] [produto]")).toBe("Oi! [whispers] não é filtro [laughs, short pause] [produto]");
    expect(spokenText("[excited] Oi, [pausa] gente [produto]")).toBe("Oi, gente [produto]");
    // Emoções seguidas vão juntas num colchete só, como o ElevenLabs pede; separadas por fala, não.
    expect(speechText("[sussurro] [risada] oi [calma]\n[pausa], [suspiro]")).toBe("[whispers, laughs] oi [calm, short pause], [sighs]");
    expect(speechText("[whispers, laughs] oi")).toBe("[whispers, laughs] oi");
    expect(speechText("[sussurro, produto] oi")).toBe("[sussurro, produto] oi");
    expect(spokenText("[whispers, laughs] oi")).toBe("oi");
    expect(new Set(EMOTIONS.map((e) => e.value)).size).toBe(EMOTIONS.length);
  });

  it("o Texto é o editor com as emoções: a lista do #, o destaque com x e o texto no formulário", async () => {
    const page = await (await get("/modelo/elevenlabs")).text();
    expect(page).toContain('data-speech-editor');
    expect(page).toContain('<textarea name="texto" hidden maxlength="5000" data-speech>');
    for (const e of EMOTIONS) expect(page).toContain(`data-tag-option="${e.value}">${e.label}<`);
    expect(page).toContain("Digite # para escolher uma emoção.");
  });

  it("só emoções, sem fala, não vale; as emoções em português chegam traduzidas ao modelo", async () => {
    const api = new FakeVideoApi();
    expect(await (await post(api, { voz: "sarah", texto: "[risada] [pausa]" })).text()).toContain(ERROS.textoFala);
    expect(api.speeches).toHaveLength(0);
    await post(api, { voz: "sarah", texto: "[sussurro][risada] Não é filtro, tá? [risada]" });
    expect(api.speeches[0]!.input).toBe("[whispers, laughs] Não é filtro, tá? [laughs]");
    const audio = await ultimo();
    // A página mostra as emoções em destaque, em português e sem o x; o Copiar e o título levam só a fala.
    const pagina = await (await get(`/video/${audio.id}`, api)).text();
    // As duas juntas aparecem em destaques separados.
    expect(pagina).toContain('<span class="speech-tag" contenteditable="false" data-tag="whispers"><span data-tag-label>sussurro</span></span> <span class="speech-tag" contenteditable="false" data-tag="laughs">');
    expect(pagina).toContain('data-copy="Não é filtro, tá?"');
    // Refazer volta com as emoções em destaque no editor.
    const refazer = await (await get(`/modelo/elevenlabs?refazer=${audio.id}`, api)).text();
    expect(refazer).toContain('data-tag="whispers"><span data-tag-label>sussurro</span><button class="speech-tag__remove');
    expect(refazer).toContain(">[whispers, laughs] Não é filtro, tá? [laughs]</textarea>");
  });
});

describe("ElevenLabs v4 (fala)", () => {
  it("as vozes vêm do modelo, com o gênero da biblioteca, e o custo é por caractere", () => {
    expect(elevenVoices(ELEVEN_MODEL).map((v) => [v.value, v.gender])).toEqual([["brian", "male"], ["river", ""], ["sarah", "female"]]);
    expect(elevenVoices(null)).toEqual([]);
    expect(estimate(ELEVENLABS, ELEVEN_MODEL, (n) => ({ texto: "  dez letras  ", voz: "sarah" })[n] ?? "")).toBeCloseTo(0.00008 * 10);
    expect(estimate(ELEVENLABS, ELEVEN_MODEL, () => "")).toBeUndefined();
  });

  it("o formulário tem a voz, o texto e o botão de gerar áudio, sem Adicionar ativo", async () => {
    const page = await (await get("/modelo/elevenlabs")).text();
    expect(page).toContain('name="voz" value="brian" data-voice-input');
    expect(page).toContain('name="texto"');
    expect(page).toContain("Gerar áudio");
    expect(page).toContain("Os áudios gerados aparecem aqui.");
    expect(page).toContain('data-panel-open="avatares"');
    expect(page).not.toContain("Adicionar ativo</span>");
    expect(page).toContain("&quot;unit&quot;:&quot;áudio&quot;");
    // O card do modelo em Modelos.
    const home = await (await get("/")).text();
    expect(home).toContain('href="/modelo/elevenlabs"');
    expect(home).toContain("0 áudios");
  });

  it("gera o áudio na hora, com a voz escolhida, e guarda o MP3 com a duração e o custo", async () => {
    const api = new FakeVideoApi();
    const res = await post(api, { voz: "sarah", texto: `  ${TEXTO}\n` });
    expect(res.status).toBe(303);
    expect(api.speeches).toEqual([{ model: "elevenlabs/eleven-v4", input: TEXTO, voice: "sarah" }]);
    expect(api.submitted).toHaveLength(0);
    const audio = await ultimo();
    expect(audio).toMatchObject({ structure: "elevenlabs", status: "completed", prompt: TEXTO, duration: 2, video_key: `audios/${audio.id}.mp3` });
    expect(audio.cost).toBeCloseTo(0.00008 * TEXTO.length, 4);
    expect(JSON.parse(audio.settings!)).toMatchObject({ voice_id: "sarah", voice: "Sarah" });

    const file = await get(`/videos/${audio.id}.mp3`, api);
    expect(file.headers.get("content-type")).toBe("audio/mpeg");
    // A página é a do vídeo, com o áudio no lugar do player, sem resolução nem formato.
    const pagina = await (await get(`/video/${audio.id}`, api)).text();
    expect(pagina).toContain(`<audio src="/videos/${audio.id}.mp3" controls></audio>`);
    expect(pagina).not.toContain('class="vbar"');
    expect(pagina).toContain(`href="/videos/${audio.id}.mp3?baixar" download`);
    expect(pagina).not.toContain(">Resolução<");
    // Na lista do modelo; a aba Vídeos não o mostra. Refazer volta com o texto e a voz.
    expect(await (await get("/modelo/elevenlabs", api)).text()).toContain(`/video/${audio.id}?de=`);
    expect(await (await get("/videos", api)).text()).not.toContain(audio.id);
    const refazer = await (await get(`/modelo/elevenlabs?refazer=${audio.id}`, api)).text();
    expect(refazer).toContain(">Gente, eu preciso contar uma coisa! Olha a diferença na minha pele.");
    expect(refazer).toContain('name="voz" value="sarah"');
  });

  it("recusa sem texto, texto longo e voz que o modelo não tem, sem chamar a API", async () => {
    const api = new FakeVideoApi();
    for (const [fields, erro] of [
      [{ voz: "sarah", texto: " " }, ERROS.textoFala],
      [{ voz: "sarah", texto: "a".repeat(MAX_SPEECH + 1) }, ERROS.falaLonga(MAX_SPEECH)],
      [{ voz: "rachel", texto: TEXTO }, ERROS.voz],
    ] as [Record<string, string>, string][]) {
      const page = await (await post(api, fields)).text();
      expect(page).toContain(erro);
    }
    expect(api.speeches).toHaveLength(0);
  });

  it("falha da API vira áudio com falha, com a frase do catálogo", async () => {
    const api = new FakeVideoApi();
    api.failSpeech = "OpenRouter respondeu HTTP 500";
    await post(api, { voz: "sarah", texto: TEXTO });
    const audio = await ultimo();
    expect(audio).toMatchObject({ status: "failed", video_key: null });
    const pagina = await (await get(`/video/${audio.id}`, api)).text();
    expect(pagina).toContain(ERROS.audioGeradoFalhou);
    expect(pagina).not.toContain("HTTP 500");
  });

  it("o menu de vozes é o do modelo; a amostra é gerada uma vez e guardada", async () => {
    const api = new FakeVideoApi();
    const lista = await (await get("/vozes/lista?modelo=elevenlabs&genero=female", api)).text();
    expect(lista).toContain('data-voice="sarah"');
    expect(lista).not.toContain('data-voice="brian"');
    expect(lista).toContain('data-voice-play="/vozes/previa/sarah?modelo=elevenlabs"');
    // Todas multilíngues: sem o título do grupo; o menu na página vem sem o filtro de idioma.
    expect(lista).not.toContain("vgroup__title");
    const pagina = await (await get("/modelo/elevenlabs", api)).text();
    expect(pagina).not.toContain('id="voz-idioma"');
    expect(pagina).toContain('<input type="hidden" value="" data-voice-language>');
    for (let i = 0; i < 2; i++) {
      const res = await get("/vozes/previa/sarah?modelo=elevenlabs", api);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/mpeg");
    }
    expect(api.speeches).toEqual([{ model: "elevenlabs/eleven-v4", input: PREVIEW_TEXT, voice: "sarah" }]);
    expect((await get("/vozes/previa/rachel?modelo=elevenlabs", api)).status).toBe(404);
    // Só modelos com voz: o de vídeo não tem menu.
    expect((await get("/vozes/lista?modelo=wan", api)).status).toBe(404);
  });

  it("quem não testa modelos não vê a página, o menu nem a amostra", async () => {
    const api = new FakeVideoApi();
    const member = await memberCookie();
    expect((await get("/modelo/elevenlabs", api, member)).status).toBe(404);
    expect((await post(api, { voz: "sarah", texto: TEXTO }, member)).status).toBe(404);
    expect((await get("/vozes/lista?modelo=elevenlabs", api, member)).status).toBe(404);
    expect((await get("/vozes/previa/sarah?modelo=elevenlabs", api, member)).status).toBe(404);
    expect(api.speeches).toHaveLength(0);
  });

  it("o áudio pronto entra no HeyGen como Meu áudio e no acervo do agente", async () => {
    const api = new FakeVideoApi();
    await post(api, { voz: "sarah", texto: TEXTO });
    const audio = await ultimo();
    // No "Adicionar ativo" dos modelos que aceitam áudio (o HeyGen direto), entre os gerados.
    const gerados = await (await get("/gerados?tipo=audio&de=0", api)).text();
    expect(gerados).toContain(`data-asset="gerado:${audio.id}"`);
    expect(gerados).toContain('data-asset-hint="Áudio gerado"');
    await new Db(env.DB).setPlatform("heygen");
    const heygen = new FakeHeyGenApi();
    const foto = new File([new Uint8Array([1, 2, 3])], "eu.png", { type: "image/png" });
    const res = await call(postForm("/modelo/heygen", { fonte: "audio", ativo: `gerado:${audio.id}`, imagem: foto, expressividade: "low", resolucao: "720p", formato: "9:16" }, { cookie: await cookie() }), api, null, heygen);
    expect(res.status).toBe(303);
    expect(heygen.assets.find((a) => a.type === "audio/mpeg")).toBeDefined();
    expect(heygen.videos[0]!.audio_asset_id).toBeDefined();
  });
});
