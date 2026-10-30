-- Configurações do estúdio que o administrador troca sem publicar de novo
-- (por enquanto pelo wrangler; depois, por uma tela de configuração).
-- 'plataforma.heygen': por onde o HeyGen Avatar IV gera ('openrouter' ou 'heygen',
-- a API direta da HeyGen, src/heygen.ts). Para trocar:
--   npx wrangler d1 execute DB --remote --command "UPDATE config SET value = 'heygen' WHERE key = 'plataforma.heygen'"
CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO config (key, value) VALUES ('plataforma.heygen', 'openrouter');

-- Vozes clonadas na API direta da HeyGen (clone instantâneo), de cada pessoa.
-- status: 'PENDING' → 'ACTIVE' ou 'FAILED', como a HeyGen responde.
CREATE TABLE voices (
    id               TEXT    PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    provider_voice_id TEXT   NOT NULL,
    status           TEXT    NOT NULL,
    error            TEXT,
    created_at       TEXT    NOT NULL
);
CREATE INDEX voices_by_user ON voices (user_id, created_at);
