-- Projetos do canvas de edição (/projetos e /canvas/<id>): o canvas inteiro em
-- JSON (blocos, finais e linhas, src/canvas/modelo.js), salvo enquanto a pessoa
-- edita. Os arquivos enviados do computador ficam no R2 (projetos/<projeto>/<arquivo>).
-- Os vídeos exportados não ficam aqui: são baixados.
CREATE TABLE projects (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    data       TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);
CREATE INDEX projects_by_user ON projects (user_id, updated_at);

CREATE TABLE project_files (
    id         TEXT    PRIMARY KEY,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key        TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    type       TEXT    NOT NULL,
    size       INTEGER NOT NULL,
    created_at TEXT    NOT NULL
);
CREATE INDEX project_files_by_project ON project_files (project_id);
