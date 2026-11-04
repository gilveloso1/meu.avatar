import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { handle } from "../src/index";
import type { MaquinasApi } from "../src/maquinas";
import { call, cookie, FakeVideoApi, memberCookie, SITE } from "./helpers";

const get = (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session === undefined ? {} : { cookie: session } }), new FakeVideoApi());

/** Um vídeo direto no banco, criado `daysAgo` dias atrás. */
async function video(id: string, o: { status: string; structure: string; cost?: number; duration?: number; daysAgo?: number; audio?: string; settings?: string }) {
  const at = new Date(Date.now() - (o.daysAgo ?? 0) * 86_400_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, structure, settings, cost, audio_status, created_at, updated_at) VALUES (?, ?, 'Oi', 'm', ?, '480p', '9:16', ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, o.status, o.duration ?? 10, o.structure, o.settings ?? null, o.cost ?? null, o.audio ?? null, at, at)
    .run();
}

describe("painel do administrador", () => {
  it("quem não é administrador não vê o painel nem o item no menu", async () => {
    const member = await memberCookie();
    expect((await get("/painel", member)).status).toBe(404);
    expect((await get("/painel/custos", member)).status).toBe(404);
    expect(await (await get("/", member)).text()).not.toContain('href="/painel"');
  });

  it("sem login, vai para a entrada", async () => {
    const res = await get("/painel");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/entrar");
  });

  it("o administrador acha o painel no menu do perfil", async () => {
    expect(await (await get("/", await cookie())).text()).toContain('href="/painel"');
  });

  it("soma o gasto por modelo e conta os vídeos do período", async () => {
    await video("a0000000-0000-4000-8000-000000000001", { status: "completed", structure: "wan", cost: 0.5, duration: 60 });
    await video("a0000000-0000-4000-8000-000000000002", { status: "completed", structure: "heygen", cost: 1.25, audio: "failed", settings: '{"platform":"heygen"}' });
    await video("a0000000-0000-4000-8000-000000000003", { status: "failed", structure: "wan", settings: "{quebrado" });
    await video("a0000000-0000-4000-8000-000000000004", { status: "completed", structure: "wan", cost: 9, daysAgo: 40 });

    const recent = await new Db(env.DB).panelStats(new Date(Date.now() - 30 * 86_400_000).toISOString());
    expect(recent.models).toEqual([
      { structure: "heygen", videos: 1, cost: 1.25 },
      { structure: "wan", videos: 2, cost: 0.5 },
    ]);
    // O HeyGen pela API direta conta para a HeyGen; o resto (e settings vazio ou quebrado), para o OpenRouter.
    expect(recent.platforms.sort((a, b) => a.platform.localeCompare(b.platform))).toEqual([
      { platform: "heygen", videos: 1, cost: 1.25 },
      { platform: "openrouter", videos: 2, cost: 0.5 },
    ]);
    expect(recent.videos).toMatchObject({ total: 3, done: 2, failed: 1, busy: 0, seconds: 70, audioFailed: 1 });

    const all = await new Db(env.DB).panelStats(null);
    expect(all.videos.total).toBe(4);
    expect(all.models.find((m) => m.structure === "wan")?.cost).toBe(9.5);
  });

  it("a página mostra o total e troca de período pelos chips", async () => {
    const admin = await cookie();
    await video("b0000000-0000-4000-8000-000000000001", { status: "completed", structure: "wan", cost: 2 });
    await video("b0000000-0000-4000-8000-000000000002", { status: "completed", structure: "wan", cost: 3, daysAgo: 10 });

    const week = await (await get("/painel?periodo=7", admin)).text();
    expect(week).toContain("US$ 2,00");
    expect(week).toMatch(/href="\/painel\?periodo=7" aria-current="true"/);

    const month = await (await get("/painel", admin)).text();
    expect(month).toContain("US$ 5,00");
    expect(month).toMatch(/href="\/painel\?periodo=30" aria-current="true"/);
  });

  it("a Visão geral junta a cauda em Outros, e Custos mostra todos os modelos", async () => {
    const admin = await cookie();
    const ids = ["wan", "heygen", "seedance", "aleph", "veo", "kling", "luma"];
    for (const [i, structure] of ids.entries()) {
      await video(`c0000000-0000-4000-8000-00000000000${i}`, { status: "completed", structure, cost: 10 - i });
    }
    const overview = await (await get("/painel?periodo=7", admin)).text();
    expect(overview).toContain("Outros 2 modelos");
    expect(overview).not.toContain(">luma<");
    expect(overview).toContain('href="/painel/custos?periodo=7"');

    const costs = await (await get("/painel/custos?periodo=7", admin)).text();
    expect(costs).toContain(">luma<");
    expect(costs).not.toContain("Outros 2 modelos");
    expect(costs).toMatch(/href="\/painel\/custos\?periodo=7" aria-current="page"/);
  });
});

describe("aba Atividade", () => {
  it("quem não é administrador não vê a aba", async () => {
    expect((await get("/painel/atividade", await memberCookie())).status).toBe(404);
  });

  it("lista as falhas do período com o motivo técnico, da mais nova para a mais velha", async () => {
    const admin = await cookie();
    const now = Date.now();
    const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, structure, error, audio_status, audio_error, created_at, updated_at) VALUES (?, ?, ?, 'm', 10, '480p', '9:16', 'wan', ?, ?, ?, ?, ?)",
    )
      .bind("d0000000-0000-4000-8000-000000000001", "failed", "Fala que falhou", "provider_error: <b>timeout</b>", null, null, at(1), at(1))
      .run();
    await env.DB.prepare(
      "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, structure, error, audio_status, audio_error, created_at, updated_at) VALUES (?, ?, ?, 'm', 10, '480p', '9:16', 'wan', ?, ?, ?, ?, ?)",
    )
      .bind("d0000000-0000-4000-8000-000000000002", "completed", "Áudio que falhou", null, "failed", "ffmpeg saiu com 1", at(2), at(2))
      .run();
    // A troca de avatar não tem fala: o título vira "Sem fala".
    await env.DB.prepare(
      "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, structure, error, created_at, updated_at) VALUES (?, 'failed', '', 'm', 10, '480p', '9:16', 'aleph', 'preparo', ?, ?)",
    )
      .bind("d0000000-0000-4000-8000-000000000004", at(3), at(3))
      .run();
    // Uma falha antiga, fora dos 7 dias.
    await env.DB.prepare(
      "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, structure, error, created_at, updated_at) VALUES (?, 'failed', 'Antiga', 'm', 10, '480p', '9:16', 'wan', 'velho', ?, ?)",
    )
      .bind("d0000000-0000-4000-8000-000000000003", at(24 * 10), at(24 * 10))
      .run();

    const failures = await new Db(env.DB).panelFailures(new Date(now - 7 * 86_400_000).toISOString());
    expect(failures.map((f) => [f.kind, f.title])).toEqual([
      ["video", "Fala que falhou"],
      ["audio", "Áudio que falhou"],
      ["video", ""],
    ]);

    const page = await (await get("/painel/atividade?periodo=7", admin)).text();
    // O motivo técnico aparece só aqui, escapado.
    expect(page).toContain("provider_error: &lt;b&gt;timeout&lt;/b&gt;");
    expect(page).toContain("ffmpeg saiu com 1");
    expect(page).not.toContain("Antiga");
    expect(page).toContain(">Sem fala<");
    expect(page).toContain(`href="/video/d0000000-0000-4000-8000-000000000001?de=${encodeURIComponent("/painel/atividade?periodo=7")}"`);
    expect(page).toMatch(/href="\/painel\/atividade\?periodo=7" aria-current="page"/);
  });

  it("a exportação que falhou só tem link para o dono do projeto, e os tokens mostram o último uso", async () => {
    const admin = await cookie();
    await memberCookie();
    const memberId = (await env.DB.prepare("SELECT id FROM users WHERE role = 'member'").first<{ id: number }>())!.id;
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO projects (id, user_id, name, data, created_at, updated_at) VALUES ('e0000000-0000-4000-8000-000000000001', ?, 'Projeto alheio', '{}', ?, ?)")
      .bind(memberId, now, now)
      .run();
    await env.DB.prepare(
      "INSERT INTO exports (id, project_id, status, step, total, plan, error, created_at, expires_at) VALUES ('e0000000-0000-4000-8000-0000000000e1', 'e0000000-0000-4000-8000-000000000001', 'failed', 1, 3, '{}', 'ffmpeg: sem memória', ?, ?)",
    )
      .bind(now, now)
      .run();
    await env.DB.prepare("INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, last_used_at) VALUES ('t1', ?, 'Agente de teste', 'h1', ?, NULL)")
      .bind(memberId, now)
      .run();

    const page = await (await get("/painel/atividade?periodo=7", admin)).text();
    expect(page).toContain(">Projeto alheio<");
    expect(page).toContain(">Exportação<");
    expect(page).toContain("ffmpeg: sem memória");
    expect(page).not.toContain('href="/canvas/e0000000-0000-4000-8000-000000000001"');
    expect(page).toContain("Agente de teste");
    expect(page).toContain("nunca usado");
  });
});

describe("máquinas agora, na aba Atividade", () => {
  const agora = Date.now();
  const maquinas: MaquinasApi = {
    estados: async () => [
      { classe: "Exporter", nome: "Exportação", icone: "download", ligada: true, emAndamento: 1, ultimoPedido: agora - 60_000 },
      { classe: "AudioFixer", nome: "Áudio", icone: "graphic_eq", ligada: true, emAndamento: 0, ultimoPedido: agora - 20 * 60_000 },
      { classe: "Renderer", nome: "Animações", icone: "animation", falhou: true },
    ],
  };
  const page = async (alarme?: object) => {
    if (alarme) await env.DB.prepare("INSERT INTO config (key, value) VALUES ('alarme.conteiner', ?)").bind(JSON.stringify(alarme)).run();
    const res = await handle(new Request(`${SITE}/painel/atividade`, { headers: { cookie: await cookie() } }), { ...env, SITE_URL: SITE }, { api: new FakeVideoApi(), machines: maquinas });
    return res.text();
  };

  it("conta as ligadas e diz o estado de cada uma, com alerta na ligada sem trabalho", async () => {
    const html = await page();
    expect(html).toMatch(/Máquinas ligadas<\/p>\s*<p class="stat-card__value">2<\/p>\s*<p class="stat-card__supporting">de 3 agora</);
    expect(html).toContain("Ligada, trabalhando");
    // 20 min sem trabalho passa da metade do prazo do alarme (30 min): fica em alerta.
    expect(html).toMatch(/<li class="dash__alert">.*?Ligada sem trabalho há 20 min/s);
    expect(html).toContain("Sem resposta agora");
    expect(html).toContain("Alarme: nenhuma máquina ligada à toa nas últimas 24 h.");
  });

  it("diz qual máquina o alarme desligou", async () => {
    const html = await page({ ligados: [{ classe: "Exporter", desde: "2026-11-04T12:00:00.000Z", em: "2026-11-04T12:40:00.000Z" }] });
    expect(html).toContain("Alarme: desligou Exportação em");
  });
});
