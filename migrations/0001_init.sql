-- Cada vídeo pedido ao OpenRouter. O job roda lá; aqui fica o pedido, o
-- status (o mesmo do OpenRouter, mais 'submitting' antes do envio) e, quando
-- termina, onde o MP4 ficou no R2 e quanto custou.
CREATE TABLE videos (
    id           TEXT PRIMARY KEY,
    job_id       TEXT UNIQUE,
    status       TEXT    NOT NULL,
    prompt       TEXT    NOT NULL,
    model        TEXT    NOT NULL,
    duration     INTEGER NOT NULL,
    resolution   TEXT    NOT NULL,
    aspect_ratio TEXT    NOT NULL,
    -- Chave no R2 da foto usada como primeiro quadro; null: só texto.
    image_key    TEXT,
    -- Chave no R2 do MP4 pronto.
    video_key    TEXT,
    cost         REAL,
    error        TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
);

CREATE INDEX videos_created ON videos (created_at);
CREATE INDEX videos_status ON videos (status);
