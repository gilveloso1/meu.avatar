import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";
import { Db } from "../src/db";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Cada teste começa com o banco vazio.
beforeEach(() => new Db(env.DB).resetAll());
