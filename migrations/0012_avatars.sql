-- Avatares: os ativos de cada avatar (fotos, vídeos, áudios), de cada pessoa.
-- Não dependem de nenhum modelo: a pessoa envia do computador ou salva o que um
-- modelo criou (cópia própria no R2, em avatares-ativos/<avatar>/<ativo>, para
-- continuar aqui mesmo que o vídeo de origem seja apagado).
CREATE TABLE avatars (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    description TEXT   NOT NULL DEFAULT '',
    -- Os ativos em destaque: a foto principal e a gravação da voz para clonagem.
    photo_asset TEXT,
    voice_asset TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);
CREATE INDEX avatars_by_user ON avatars (user_id, updated_at);

CREATE TABLE avatar_assets (
    id           TEXT    PRIMARY KEY,
    avatar_id    TEXT    NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    kind         TEXT    NOT NULL,
    key          TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    type         TEXT    NOT NULL,
    size         INTEGER NOT NULL,
    source_video TEXT,
    created_at   TEXT    NOT NULL
);
CREATE INDEX avatar_assets_by_avatar ON avatar_assets (avatar_id, created_at);

-- O avatar usado para gerar o vídeo (NULL com arquivo solto). Fica o id, sem chave
-- estrangeira: apagar o avatar não apaga o vídeo.
ALTER TABLE videos ADD COLUMN avatar_id TEXT;
