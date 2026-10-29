-- Preparo antes do envio (troca de avatar pelo Aleph 2, src/structures/aleph.ts):
-- o vídeo fica em 'submitting' com prep_status 'pending'; o agendamento pega um
-- por vez ('processing'), prepara o vídeo no contêiner, troca o rosto nos
-- quadros-chave e envia ao OpenRouter ('done'), ou grava o motivo da falha em
-- prep_error ('failed', e o vídeo vira 'failed'). Os outros modelos ficam com null.
ALTER TABLE videos ADD COLUMN prep_status TEXT;
ALTER TABLE videos ADD COLUMN prep_error TEXT;
ALTER TABLE videos ADD COLUMN prep_started_at TEXT;

CREATE INDEX videos_prep ON videos (prep_status);
