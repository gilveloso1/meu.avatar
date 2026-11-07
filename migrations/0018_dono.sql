-- Cada conta vê só o que é dela (src/db.ts, ContaDb). O banco também garante o dono:
-- vídeo sem dono não entra, e o ativo de um avatar só liga a um vídeo da mesma conta.
-- O D1 é SQLite: sem RLS e sem ALTER para NOT NULL, então as regras são gatilhos.

-- Vídeos de antes das contas: são do administrador (no ar, em 07/11/2026, não havia nenhum).
UPDATE videos SET user_id = (SELECT id FROM users WHERE role = 'admin') WHERE user_id IS NULL;

CREATE TRIGGER videos_com_dono_ao_criar BEFORE INSERT ON videos
WHEN NEW.user_id IS NULL
BEGIN SELECT RAISE(ABORT, 'video sem dono'); END;

CREATE TRIGGER videos_com_dono_ao_mudar BEFORE UPDATE OF user_id ON videos
WHEN NEW.user_id IS NULL
BEGIN SELECT RAISE(ABORT, 'video sem dono'); END;

-- "Salvar no avatar" liga o vídeo sem copiar (source_video): só um vídeo do dono do avatar.
CREATE TRIGGER ativo_com_video_do_dono_ao_criar BEFORE INSERT ON avatar_assets
WHEN NEW.source_video IS NOT NULL
  AND (SELECT user_id FROM videos WHERE id = NEW.source_video) IS NOT (SELECT user_id FROM avatars WHERE id = NEW.avatar_id)
BEGIN SELECT RAISE(ABORT, 'video de outra conta'); END;

CREATE TRIGGER ativo_com_video_do_dono_ao_mudar BEFORE UPDATE OF source_video, avatar_id ON avatar_assets
WHEN NEW.source_video IS NOT NULL
  AND (SELECT user_id FROM videos WHERE id = NEW.source_video) IS NOT (SELECT user_id FROM avatars WHERE id = NEW.avatar_id)
BEGIN SELECT RAISE(ABORT, 'video de outra conta'); END;

-- As listas de cada conta (ContaDb): os vídeos dela, por modelo, dos mais novos.
CREATE INDEX videos_by_user ON videos (user_id, structure, created_at);
