-- A edição rápida que vale (a do MP4 em edited_key): quando ficou pronta e com
-- que escolhas (JSON do plano, src/quickedit.ts). Gravados só quando a edição
-- termina bem: um pedido novo que falhe não muda o que a página mostra.
ALTER TABLE videos ADD COLUMN edited_at TEXT;
ALTER TABLE videos ADD COLUMN edited_plan TEXT;
