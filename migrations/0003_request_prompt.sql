-- O formulário separa estilo, idioma, fala e instruções extras (src/prompt.ts).
-- A coluna prompt passa a guardar só a fala; request_prompt guarda o prompt
-- exatamente como foi para o modelo, para comparar resultados quando os
-- estilos ou a orientação de qualidade mudarem. Nos vídeos antigos, prompt é
-- o texto livre de antes e as colunas novas ficam null.
ALTER TABLE videos ADD COLUMN request_prompt TEXT;
ALTER TABLE videos ADD COLUMN style TEXT;
ALTER TABLE videos ADD COLUMN language TEXT;
ALTER TABLE videos ADD COLUMN extra TEXT;
