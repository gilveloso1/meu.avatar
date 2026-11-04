import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { call, cookie, FakeVideoApi, memberCookie, SITE } from "./helpers";

const get = (path: string, session?: string) => call(new Request(`${SITE}${path}`, { headers: session === undefined ? {} : { cookie: session } }), new FakeVideoApi());

/** Um vídeo direto no banco, criado `daysAgo` dias atrás. */
async function video(id: string, o: { status: string; structure: string; cost?: number; duration?: number; daysAgo?: number; audio?: string }) {
  const at = new Date(Date.now() - (o.daysAgo ?? 0) * 86_400_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO videos (id, status, prompt, model, duration, resolution, aspect_ratio, structure, cost, audio_status, created_at, updated_at) VALUES (?, ?, 'Oi', 'm', ?, '480p', '9:16', ?, ?, ?, ?, ?)",
  )
    .bind(id, o.status, o.duration ?? 10, o.structure, o.cost ?? null, o.audio ?? null, at, at)
    .run();
}

describe("painel do administrador", () => {
  it("quem não é administrador não vê o painel nem o item no menu", async () => {
    const member = await memberCookie();
    expect((await get("/painel", member)).status).toBe(404);
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
    await video("a0000000-0000-4000-8000-000000000002", { status: "completed", structure: "heygen", cost: 1.25, audio: "failed" });
    await video("a0000000-0000-4000-8000-000000000003", { status: "failed", structure: "wan" });
    await video("a0000000-0000-4000-8000-000000000004", { status: "completed", structure: "wan", cost: 9, daysAgo: 40 });

    const recent = await new Db(env.DB).panelStats(new Date(Date.now() - 30 * 86_400_000).toISOString());
    expect(recent.models).toEqual([
      { structure: "heygen", videos: 1, cost: 1.25 },
      { structure: "wan", videos: 2, cost: 0.5 },
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
});
