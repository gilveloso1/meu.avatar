-- Edição rápida (botão no vídeo pronto do HeyGen): o contêiner corta os
-- silêncios, muda o enquadramento a cada corte e acerta o volume
-- (container/editar.py). Ao pedir, edit_status vira 'pending'; o agendamento
-- manda um vídeo por vez ('processing') e grava a versão editada em
-- edited_key ('done') ou o motivo da falha em edit_error ('failed').
-- edit_plan guarda, em JSON, o que foi escolhido na prévia: pausas, câmera e
-- os trechos (src/quickedit.ts).
ALTER TABLE videos ADD COLUMN edit_status TEXT;
ALTER TABLE videos ADD COLUMN edited_key TEXT;
ALTER TABLE videos ADD COLUMN edit_error TEXT;
ALTER TABLE videos ADD COLUMN edit_started_at TEXT;
ALTER TABLE videos ADD COLUMN edit_plan TEXT;

CREATE INDEX videos_edit ON videos (edit_status);
