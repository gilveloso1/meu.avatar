-- Pastas da conta (pedido de 11/11/2026): as mesmas pastas simples dos ativos do avatar
-- (migrations/0025_pastas.sql), agora na aba Vídeos e em Projetos. `kind` diz de que lista a
-- pasta é; cada vídeo e cada projeto fica numa pasta só (folder_id; NULL é a lista). Sem chave
-- estrangeira em folder_id: ao apagar a pasta, é o código que devolve os itens à lista.
CREATE TABLE account_folders (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL CHECK (kind IN ('videos', 'projetos')),
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);

CREATE INDEX account_folders_by_user ON account_folders (user_id, kind);

ALTER TABLE videos ADD COLUMN folder_id TEXT;
ALTER TABLE projects ADD COLUMN folder_id TEXT;
