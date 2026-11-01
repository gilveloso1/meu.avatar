/**
 * Cria um token da API (docs/api.md) para uma conta e mostra o código uma vez só; o banco
 * guarda o hash. Sem --remoto, grava no banco local.
 *
 *   npm run token -- --email pessoa@exemplo.com --nome "Claude" [--remoto]
 */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { randomToken, sha256 } from "../src/auth";

const { values } = parseArgs({ options: { email: { type: "string" }, nome: { type: "string" }, remoto: { type: "boolean", default: false } } });
const { email, nome } = values;
if (!email || !nome || !/^[^\s@']+@[^\s@']+$/.test(email)) throw new Error('Use --email pessoa@exemplo.com --nome "Claude".');

const token = `ma_${randomToken()}`;
const sql = `INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) SELECT '${crypto.randomUUID()}', id, '${nome.replace(/'/g, "''")}', '${await sha256(token)}', '${new Date().toISOString()}' FROM users WHERE email = '${email}' RETURNING id`;
const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", values.remoto ? "--remote" : "--local", "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
if (!(JSON.parse(out) as { results: unknown[] }[])[0]?.results.length) throw new Error(`Não há conta com o e-mail ${email}.`);
console.log(token);
