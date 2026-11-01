-- API dos projetos (docs/api.md). Cada token dá acesso em nome de uma conta; o banco
-- guarda só o hash, como nas sessões.
CREATE TABLE api_tokens (
    id           TEXT    PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    token_hash   TEXT    NOT NULL UNIQUE,
    created_at   TEXT    NOT NULL,
    last_used_at TEXT
);

-- Sobe a cada mudança: quem salva diz de qual revisão partiu, e a pessoa no canvas e um
-- agente não apagam o trabalho um do outro.
ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
