-- Exportações dos projetos do canvas (src/exportar.ts): o que falta montar, passo
-- a passo (um trecho ou uma versão por vez). plan é o JSON com os trechos e as
-- versões. Os vídeos prontos ficam no R2 (exportacoes/<id>/) até expires_at; os
-- trechos (trechos/<hash>.mkv) são reaproveitados entre exportações.
CREATE TABLE exports (
    id         TEXT    PRIMARY KEY,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status     TEXT    NOT NULL DEFAULT 'running',
    step       INTEGER NOT NULL DEFAULT 0,
    total      INTEGER NOT NULL,
    tries      INTEGER NOT NULL DEFAULT 0,
    claimed_at TEXT,
    plan       TEXT    NOT NULL,
    error      TEXT,
    created_at TEXT    NOT NULL,
    expires_at TEXT    NOT NULL
);
CREATE INDEX exports_by_project ON exports (project_id, created_at);
CREATE INDEX exports_running ON exports (status);
