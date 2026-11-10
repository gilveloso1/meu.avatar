-- Pastas dos ativos de um avatar (pedido de 10/11/2026, no molde do Google Drive): pasta dentro
-- de pasta (parent_id; NULL é a raiz, a lista "Ativos" do avatar) e cada ativo numa pasta só
-- (avatar_assets.folder_id; NULL é a raiz). Sem chave estrangeira em parent_id e folder_id:
-- apagar uma pasta não apaga nada, o código sobe o que estava nela para a pasta de cima.
CREATE TABLE folders (
    id         TEXT PRIMARY KEY,
    avatar_id  TEXT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    parent_id  TEXT,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX folders_by_avatar ON folders (avatar_id, parent_id);

ALTER TABLE avatar_assets ADD COLUMN folder_id TEXT;
