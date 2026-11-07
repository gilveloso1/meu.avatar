-- Convites, no molde do estuda.mais (migrations/0002_admin.sql): o link para criar ou trocar a
-- senha (conta nova convidada pelo administrador e "esqueci a senha"). De uso único, com
-- validade; aqui fica só o hash do código, como nas sessões.
CREATE TABLE invites (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    expires_at TEXT    NOT NULL
);

CREATE INDEX invites_user ON invites (user_id);
