/**
 * "Esqueci a senha" do administrador (ou de quem não consegue pedir ao administrador): gera o link
 * para criar uma senha nova, como o "Link de nova senha" da aba Contas. Vale por 1 hora e só uma
 * vez; o banco guarda o hash. Sem --remoto, grava no banco local.
 *
 *   npm run link-senha -- --email voce@exemplo.com [--remoto]
 */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { randomToken, sha256 } from "../src/auth";

const { values } = parseArgs({ options: { email: { type: "string" }, remoto: { type: "boolean", default: false } } });
const { email } = values;
if (!email || !/^[^\s@']+@[^\s@']+$/.test(email)) throw new Error("Use --email voce@exemplo.com.");

const token = randomToken();
const now = new Date();
const expires = new Date(now.getTime() + 60 * 60 * 1000);
// Como Accounts.invite: o link anterior (e os vencidos) deixam de valer.
const sql = `DELETE FROM invites WHERE user_id = (SELECT id FROM users WHERE email = '${email}') OR expires_at <= '${now.toISOString()}';
INSERT INTO invites (token_hash, user_id, created_at, expires_at) SELECT '${await sha256(token)}', id, '${now.toISOString()}', '${expires.toISOString()}' FROM users WHERE email = '${email}' RETURNING user_id`;
const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", values.remoto ? "--remote" : "--local", "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const results = (JSON.parse(out) as { results: unknown[] }[]).flatMap((r) => r.results);
if (!results.length) throw new Error(`Não há conta com o e-mail ${email}.`);
const site = values.remoto ? "https://meuavatar.ia.br" : "http://localhost:8787";
console.log(`Abra para criar a senha (vale por 1 hora, só uma vez):\n${site}/convite/${token}`);
