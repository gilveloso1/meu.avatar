-- Pastas dos ativos de um avatar (pedido de 10/11/2026): pasta simples, sem pasta dentro de pasta,
-- e cada ativo numa pasta só (avatar_assets.folder_id; NULL é a lista "Ativos" do avatar). Sem
-- chave estrangeira em folder_id: ao apagar a pasta, a pessoa escolhe se os itens são apagados
-- junto ou se voltam para a lista, e é o código que faz um ou outro.
CREATE TABLE folders (
    id         TEXT PRIMARY KEY,
    avatar_id  TEXT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX folders_by_avatar ON folders (avatar_id);

ALTER TABLE avatar_assets ADD COLUMN folder_id TEXT;
