import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { ERROS } from "../src/erros";
import { fishLanguage } from "../src/fish";
import { mp3Duration } from "../src/mp3";
import { resetVoiceCache } from "../src/studio";
import { estimate } from "../src/structures";
import { ELEVENLABS, elevenVoices, EMOTIONS, FISH, fishVoices, MAX_SPEECH, PREVIEW_TEXT, speechText, spokenText } from "../src/structures/voz";
import { call, callFish, cookie, dono, ELEVEN_MODEL, FakeFishApi, FakeHeyGenApi, FISH_MODEL, FakeVideoApi, memberCookie, mp3, postForm, SITE } from "./helpers";

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
    // Sem uso ainda, em ordem alfabética (as mais usadas sobem no navegador).
    const nomes = [...page.matchAll(/data-tag-option="[^"]+">([^<]+)</g)].map((m) => m[1]);
    expect(nomes).toEqual([...nomes].sort((a, b) => a!.localeCompare(b!, "pt")));
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

describe("Fish Audio (fala)", () => {
  const getFish = async (path: string, api: FakeVideoApi, fish: FakeFishApi) => callFish(new Request(`${SITE}${path}`, { headers: { cookie: await cookie() } }), api, fish);
  const postFish = async (fields: Record<string, string>, api: FakeVideoApi, fish: FakeFishApi) => callFish(postForm("/modelo/fish", fields, { cookie: await cookie() }), api, fish);

  it("as vozes oficiais do Fish, do Brasil primeiro; o idioma de cada uma", () => {
    const voices = fishVoices(new FakeFishApi().catalog);
    expect(voices.map((v) => v.name)).toEqual(["Beatriz", "Caio", "Tomás", "Sarah"]);
    expect(voices[1]).toMatchObject({ value: "fish-caio", gender: "male", language: "Português (Brasil)", preview: true });
    expect(fishLanguage("pt", { tags: ["male", "pt-br"] })).toBe("Português (Brasil)");
    expect(fishLanguage("pt", { tags: [], description: "Uma voz clara para atendimento ao cliente." })).toBe("Português (Brasil)");
    expect(fishLanguage("pt", { tags: [], description: "Uma voz clara para apoio ao cliente." })).toBe("Português (Portugal)");
    expect(fishLanguage("pt", { tags: ["pt-pt"], description: "Brazilian" })).toBe("Português (Portugal)");
    expect(fishLanguage("es", {})).toBe("Espanhol");
    expect(estimate(FISH, FISH_MODEL, (n) => ({ texto: "dez letras", voz: "fish-caio" })[n] ?? "")).toBeCloseTo(0.000002 * 10);
  });

  it("gera com a voz do Fish e as emoções em inglês; o menu tem o filtro de idioma, no Brasil", async () => {
    const api = new FakeVideoApi(), fish = new FakeFishApi();
    const page = await (await getFish("/modelo/fish", api, fish)).text();
    expect(page).toContain('name="voz" value="fish-beatriz" data-voice-input');
    expect(page).toContain('id="voz-idioma"');
    expect(page).toContain('<option value="Português (Brasil)" selected>Português (Brasil) (2)</option>');
    const res = await postFish({ voz: "fish-caio", texto: "[risada] Olha que legal!" }, api, fish);
    expect(res.status).toBe(303);
    expect(api.speeches).toEqual([{ model: "fish-audio/drama-3", input: "[laughs] Olha que legal!", voice: "fish-caio" }]);
    const audio = await ultimo();
    expect(audio).toMatchObject({ structure: "fish", status: "completed", video_key: `audios/${audio.id}.mp3` });
    expect(JSON.parse(audio.settings!)).toMatchObject({ voice_id: "fish-caio", voice: "Caio" });
    const lista = await (await getFish(`/vozes/lista?modelo=fish&idioma=${encodeURIComponent("Português (Portugal)")}`, api, fish)).text();
    expect(lista).toContain('data-voice="fish-tomas"');
    expect(lista).not.toContain('data-voice="fish-caio"');
    // O catálogo foi lido uma vez e ficou guardado (na instância e no banco).
    expect(fish.listed).toBe(1);
  });

  it("só vozes do catálogo; a prévia é a amostra do Fish, baixada uma vez", async () => {
    const api = new FakeVideoApi(), fish = new FakeFishApi();
    expect(await (await postFish({ voz: "4b215a58407c4def88e0892def6421b2", texto: "Oi" }, api, fish)).text()).toContain(ERROS.voz);
    expect((await getFish("/vozes/previa/4b215a58407c4def88e0892def6421b2?modelo=fish", api, fish)).status).toBe(404);
    for (let i = 0; i < 2; i++) expect(await (await getFish("/vozes/previa/fish-caio?modelo=fish", api, fish)).text()).toBe("amostra-fish-caio");
    expect(fish.samples).toEqual(["fish-caio"]);
    expect(api.speeches).toHaveLength(0);
  });

  it("com o Fish fora do ar, vale o último catálogo guardado", async () => {
    const api = new FakeVideoApi(), fish = new FakeFishApi();
    await getFish("/modelo/fish", api, fish);
    resetVoiceCache();
    await env.DB.prepare("UPDATE config SET value = json_set(value, '$.at', 0) WHERE key = 'vozes.fish.oficiais'").run();
    fish.failList = true;
    expect(await (await getFish("/modelo/fish", api, fish)).text()).toContain('value="fish-beatriz" data-voice-input');
  });

  describe("voz clonada", () => {
    const gravacao = (texto = "gravacao-da-voz") => new File([new TextEncoder().encode(texto)], "voz.mp3", { type: "audio/mpeg" });
    const postClone = async (fields: Record<string, string | File>, api: FakeVideoApi, fish: FakeFishApi, session?: string) =>
      callFish(postForm("/modelo/fish", { fonte: "clonada", texto: "Bom dia, turma!", ...fields }, { cookie: session ?? (await cookie()) }), api, fish);
    const texto = (b?: ArrayBuffer) => (b ? new TextDecoder().decode(b) : null);

    it("o formulário tem Voz pronta e Voz clonada, como a HeyGen", async () => {
      const page = await (await getFish("/modelo/fish", new FakeVideoApi(), new FakeFishApi())).text();
      expect(page).toContain('name="fonte"');
      expect(page).toContain(">Voz clonada<");
      expect(page).toContain('<option value="nova"');
      expect(page).toContain("Clonar uma voz nova");
      expect(page).toContain('name="amostra"');
      expect(page).toContain("A voz é minha ou tenho autorização para cloná-la.");
    });

    it("a voz nova: a gravação fica no R2, vira voz da pessoa e vai em cada pedido, sem voz pronta", async () => {
      const api = new FakeVideoApi(), fish = new FakeFishApi();
      for (const [fields, erro] of [
        [{ clone: "nova", nome_voz: "Touro", consentimento: "sim" }, ERROS.amostraVoz],
        [{ clone: "nova", amostra: gravacao(), consentimento: "sim" }, ERROS.nomeVoz],
        [{ clone: "nova", amostra: gravacao(), nome_voz: "Touro" }, ERROS.consentimentoVoz],
      ] as [Record<string, string | File>, string][]) expect(await (await postClone(fields, api, fish)).text()).toContain(erro);
      expect(api.speeches).toHaveLength(0);

      expect((await postClone({ clone: "nova", amostra: gravacao(), nome_voz: "Touro", consentimento: "sim" }, api, fish)).status).toBe(303);
      expect(api.speeches[0]).toMatchObject({ model: "fish-audio/drama-3", input: "Bom dia, turma!" });
      expect(api.speeches[0]!.voice).toBeUndefined();
      expect(texto(api.speeches[0]!.reference?.bytes)).toBe("gravacao-da-voz");
      const voz = await env.DB.prepare("SELECT * FROM voices WHERE name = 'Touro'").first<{ id: string; provider: string; provider_voice_id: string; status: string }>();
      expect(voz).toMatchObject({ provider: "fish", status: "ACTIVE" });
      expect(voz!.provider_voice_id).toMatch(/^vozes\/clonadas\/.+\.mp3$/);
      const audio = await ultimo();
      expect(JSON.parse(audio.settings!)).toMatchObject({ source: "clonada", voice: "Touro", voice_row: voz!.id, reference_key: voz!.provider_voice_id });
      expect(await (await getFish(`/video/${audio.id}`, api, fish)).text()).toContain("Voz clonada · Touro");

      // Depois, a voz está na lista, sem pedir a gravação nem o consentimento de novo; o Refazer volta com ela.
      expect(await (await getFish("/modelo/fish", api, fish)).text()).toContain(`<option value="${voz!.id}"`);
      expect((await postClone({ clone: voz!.id }, api, fish)).status).toBe(303);
      expect(texto(api.speeches[1]!.reference?.bytes)).toBe("gravacao-da-voz");
      expect(await (await getFish(`/modelo/fish?refazer=${audio.id}`, api, fish)).text()).toContain(`<option value="${voz!.id}" selected`);
      // A voz do Fish não entra na voz clonada da HeyGen.
      await new Db(env.DB).setPlatform("heygen");
      expect(await (await call(new Request(`${SITE}/modelo/heygen`, { headers: { cookie: await cookie() } }), api, null, new FakeHeyGenApi())).text()).not.toContain(`<option value="${voz!.id}"`);
      // A de outra pessoa não vale.
      await env.DB.prepare("UPDATE voices SET user_id = ? WHERE id = ?").bind(await dono(), voz!.id).run();
      expect(await (await postClone({ clone: voz!.id }, api, fish)).text()).toContain(ERROS.vozClonada);
    });

    it("a voz do avatar: pede o consentimento na primeira vez e manda a gravação do avatar", async () => {
      const api = new FakeVideoApi(), fish = new FakeFishApi(), session = await cookie();
      const res = await call(postForm("/avatares", { nome: "Urso", imagem: new File([new Uint8Array([137, 80, 78, 71])], "urso.png", { type: "image/png" }), voz: gravacao("voz-do-urso") }, { cookie: session }));
      const avatar = res.headers.get("location")!.split("/").pop()!;
      const page = await (await getFish("/modelo/fish", api, fish)).text();
      expect(page).toContain(`<option value="avatar:${avatar}"`);
      expect(page).toContain("Voz de Urso");
      expect(await (await postClone({ clone: `avatar:${avatar}` }, api, fish, session)).text()).toContain(ERROS.consentimentoVoz);
      expect((await postClone({ clone: `avatar:${avatar}`, consentimento: "sim" }, api, fish, session)).status).toBe(303);
      expect(texto(api.speeches[0]!.reference?.bytes)).toBe("voz-do-urso");
      expect(await env.DB.prepare("SELECT provider, asset_id IS NOT NULL AS doAvatar FROM voices WHERE name = 'Voz de Urso'").first()).toEqual({ provider: "fish", doAvatar: 1 });
      // Da segunda vez em diante, sem o consentimento.
      expect((await postClone({ clone: `avatar:${avatar}` }, api, fish, session)).status).toBe(303);
      expect(api.speeches).toHaveLength(2);
    });
  });
});
