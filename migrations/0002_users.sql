-- Contas do estúdio, no molde do estuda.mais (migrations/0002_admin.sql).
-- A primeira conta cadastrada é a do administrador; depois dela o cadastro
-- fecha. A senha é guardada só como hash bcrypt; sem senha (NULL), a conta
-- ainda não aceitou o convite (convites do administrador: próxima etapa).
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Sempre em minúsculas.
    email         TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('admin', 'member')),
    password_hash TEXT,
    created_at    TEXT    NOT NULL,
    -- Tentativas de login erradas seguidas; com 5, a conta fica bloqueada até locked_until.
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until  TEXT
);

-- Um único administrador.
CREATE UNIQUE INDEX users_one_admin ON users (role) WHERE role = 'admin';

-- Sessões abertas. O navegador guarda o código; aqui fica só o hash SHA-256
-- dele, então quem lê o banco não consegue entrar com uma sessão.
CREATE TABLE sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    expires_at TEXT    NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);

-- Quem pediu cada vídeo.
ALTER TABLE videos ADD COLUMN user_id INTEGER REFERENCES users(id);
