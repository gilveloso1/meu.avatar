-- Permissões no molde do TabNews (src/permissoes.ts): o papel é um pacote de permissões no
-- código, e cada conta pode ter ajustes aqui, em JSON: a permissão a mais ("usar:modelo:teste")
-- ou a menos, com "-" na frente ("-usar:canvas"); "suspensa" tira a conta do site.
--
-- O CHECK de users.role fica: tirá-lo exige refazer a tabela, e no D1 o DROP TABLE de users
-- apagaria em cascata as sessões, os projetos, os avatares, as vozes e os tokens. Os ajustes
-- por conta cobrem o que um papel novo cobriria.
ALTER TABLE users ADD COLUMN permissoes TEXT NOT NULL DEFAULT '[]';
