// Cria a pasta de um vídeo novo: node tools/novo-projeto.mjs "Como funciona o elevador"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nome = process.argv.slice(2).join(' ').trim();
if (!nome) { console.error('Uso: node tools/novo-projeto.mjs "Título do vídeo"'); process.exit(1); }

const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'video';
const pasta = path.join(raiz, 'projects', slug);
if (fs.existsSync(pasta)) { console.error(`Já existe: projects/${slug}`); process.exit(1); }
fs.mkdirSync(pasta, { recursive: true });

const ideia = fs.readFileSync(path.join(raiz, 'templates', 'ideia.md'), 'utf8').replace('{Título interno do vídeo}', nome);
fs.writeFileSync(path.join(pasta, 'ideia.md'), ideia);
const sb = JSON.parse(fs.readFileSync(path.join(raiz, 'templates', 'storyboard.minimo.json'), 'utf8'));
sb.titulo = nome;
fs.writeFileSync(path.join(pasta, 'storyboard.json'), JSON.stringify(sb, null, 2) + '\n');
fs.writeFileSync(path.join(pasta, 'narracao.txt'), '');
console.log(`Projeto criado: projects/${slug}\n  ideia.md, narracao.txt (vazio) e storyboard.json (modelo mínimo)`);
