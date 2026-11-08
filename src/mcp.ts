/**
 * Servidor MCP (docs/api.md): deixa um agente usar a API dos projetos como ferramentas. É
 * uma camada fina: cada ferramenta vira um pedido às rotas que já existem, com o mesmo token,
 * e por isso as permissões e as regras são as mesmas. Sem sessão: cada POST é uma mensagem
 * JSON-RPC, e a resposta vem em JSON.
 *
 * Segue a revisão 2026-07-28: cada pedido traz a versão e as capacidades em _meta, sem
 * handshake. Quem chega com `initialize` ou sem esse _meta é cliente de antes dela, e
 * recebe o protocolo antigo no mesmo endereço, sem cabeçalhos novos.
 */
import { FONTES } from "./render";

const ATUAL = "2026-07-28";
const VERSOES = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const META_VERSAO = "io.modelcontextprotocol/protocolVersion";
const META_CAPACIDADES = "io.modelcontextprotocol/clientCapabilities";
const SERVIDOR = { name: "meu-avatar", version: "1.10.0" };
/**
 * A lista de ferramentas não depende de quem pede. Curto: com 1 h, uma sessão aberta antes de
 * publicar seguiu com a descrição velha (sem rascunho e trocar) no teste de 02/11/2026.
 */
export const CACHE = { ttlMs: 5 * 60_000, cacheScope: "public" };
/** O arquivo vai em base64 na mensagem: acima disso, use a rota de arquivos direto. */
const MAX_BASE64 = 14 * 1024 * 1024;

const INSTRUCOES = `Edita vídeos nos projetos do Meu Avatar. Antes de cortar, olhe: use ver_quadros, ver_silencios e ver_transcricao, e confira as bordas do vídeo de origem. O campo revisao vem de ver_projeto; se editar_projeto devolver conflito, a resposta já traz o projeto como está agora (grupos, Finais, avisos e a revisão nova): compare com o que você tinha e refaça o lote sobre ela. Roteiro com cenas: um grupo por cena, de preferência até uns 30 s (um rascunho ou adicionar sem depois nem sobre abre uma cena nova), e as cenas em ordem até o Final com ordenar {grupos: [...]} (o Final monta a sequência; não é preciso juntar). O lote pode criar as cenas, dar nome e ordenar de uma vez, com rotulo; para mudar a ordem depois, ordenar de novo. Dê nome às cenas com renomear {grupo, nome}. Assim cada edição só mexe no tempo da cena dela e a legenda cabe por grupo; uma cena mais longa pode passar dos 30 s, sem cortar uma fala ou uma cobertura no meio (a cobertura não passa de um grupo para o outro). Para tirar uma fala do meio de uma cena, use remover com fechar: true; sem ele, o grupo se parte em dois (aviso grupo_partido). Depois de editar, olhe os avisos novos em mudou: sem_video_de_base quer dizer que aquele trecho sai sobre fundo preto, salvo se uma cobertura opaca o preencher; rascunho é uma fala que ainda espera o vídeo. Um movimento de câmera na mesma frase é um só: não mude o foco no meio dela. Onde já houver texto na tela, a legenda não se repete. Depois de exportar, confira o resultado: o href de cada versão serve de src em ver_quadros e ver_silencios. Antes de criar uma animação, procure com listar_animacoes uma já feita no mesmo projeto ou nos projetos do mesmo avatar. Se uma se encaixa bem, parta dela sem perguntar, com adicionar {animacao}: troque os parametros, ajuste com editarCodigo, acrescente o que faltar. Se o pedido é muito diferente e nada do projeto ou do avatar se encaixa, pergunte à pessoa antes: criar uma nova ou partir de uma animação de outro projeto (de outro avatar, que pode ser outra marca sem relação com este). Leve na pergunta a sua análise de custo e benefício e uma recomendação: reaproveitar o código com mudanças profundas também vale. O trabalho de cada agente fica para o próximo. Para conferir uma animação em código, use inspecionar_animacao: o texto aponta título que quebrou, elemento cortado ou fora da tela, texto sobre texto, fonte, erro de script e parâmetro sem valor; peça quadros: true só se o texto não bastar. Gerar vídeo não é feito por aqui; exportar usa o contêiner, sem créditos de modelo. Imagem sim: gerar_imagem gasta créditos (uns US$ 0,04 em 1K) e devolve a imagem para você olhar antes de usar; se não ficou boa, refaça com outra descrição ou com ela mesma como referencia. Ela entra no projeto com adicionar {imagem}.`;

const COMANDOS = `Lista de comandos, aplicados em ordem; um erro desfaz o lote inteiro e diz em comando a posição do que falhou, a partir de 0. Cada um tem "tipo":
adicionar {video|arquivo|ativo|imagem, nome, inicio, fim, semSom, dur (obrigatório em vídeo e áudio de arquivo e de ativo enviado), depois: bloco | sobre: bloco, em: segundos} (imagem: o id de gerar_imagem; a imagem fica na tela de inicio a fim, 3 s sem fim)
adicionar {html, duracao: 0,5 a 60, parametros, nome, esticar, depois: bloco | sobre: bloco, em: segundos} (animação em código, guardada no projeto: títulos, selos, gráficos, legendas; as regras do HTML são as do renderizar_html; sem nome, Animação 1, Animação 2...; a tela mostra na prévia, e a exportação faz o vídeo dela; por cima de uma fala, estica ou encolhe com ela, a não ser com esticar: false)
adicionar {animacao: {projeto, bloco}, parametros, duracao, nome, depois: bloco | sobre: bloco, em: segundos} (copia uma animação já feita, de listar_animacoes: o código, os parametros, a duração, a escala e o nome; o que vier aqui muda, e os parametros se juntam aos dela; a cópia é independente)
editarCodigo {bloco, html | trocas: [{de, para}], parametros, esticar} (troca o código de uma animação inteiro ou só trechos; cada de aparece uma vez só no código, como está; leia o código com ver_projeto incluir: codigo; esticar liga ou desliga para as próximas mudanças da fala, sem mudar a duração de agora; se ele trouxer escala, os tempos do código são os de antes dela: as trocas a mantêm, e o html inteiro novo volta a escala a 1, escrito para a duração atual)
parametros: {chave: texto ou número}, até 30, os valores que mudam sem reescrever o código (nome, preço, cor da marca): no HTML, {{chave}} fora dos scripts vira o valor; nos scripts, params.chave. Em editarCodigo, junta aos que já existem, e null tira. Faça o template uma vez e repita o bloco só trocando parametros; a pessoa também troca os valores nos Ajustes do canvas.
rascunho {fala, descricao, duracao: 0,5 a 30, nome, depois: bloco | sobre: bloco, em: segundos} (o lugar de um vídeo que ainda não existe: um cartão com a fala; fala é o que será dito, para gerar o vídeo ou o áudio; descricao, o resto: a cena, o enquadramento, referências; as duas são opcionais, pode ficar em branco; sem nome, Texto 1, Texto 2...; a exportação espera a troca)
nota {texto, perto: bloco, nota ou Final} (texto solto no canvas, como um post-it amarelo: briefing, roteiro, referências, o que falta fazer; fica fora dos vídeos e da exportação; com perto, logo acima dele; sem perto, embaixo de tudo; até 10 mil caracteres, com as quebras de linha)
editarNota {nota, texto} (troca o texto de uma nota; as notas e os ids vêm em ver_projeto; para apagar, remover {ids})
renomear {bloco, nome} ou {grupo, nome} (com grupo, o nome da cena, como Cena 1, no lugar de Bloco 1; vale o id de qualquer bloco dele)
trocar {bloco, video|arquivo|ativo|imagem, inicio, fim, dur, nome, aparar} (põe o arquivo no lugar do bloco, como o vídeo pronto no do rascunho; sem inicio nem fim, o vídeo entra sem o silêncio das pontas, e aparar: false o põe inteiro; o que está em cima fica e a sequência acompanha; no lugar de um rascunho, a camada vai para o mesmo ponto na proporção do bloco, já aparado; sem nome, o bloco fica com o nome do arquivo)
cortar {bloco, inicio, fim | duracao} (duracao no lugar de fim: o que fica a partir do início; num rascunho, cortar {bloco, duracao: 3} deixa 3 s)
dividir {bloco, em}
mover {bloco, depois|antes} (põe o bloco em outra posição, também em outro grupo: assim se juntam dois grupos)
velocidade {bloco, velocidade: 0,25 a 4}
removerPausas {bloco?, pausa: curta|media|longa | acima: 0,1 a 5} (sem bloco, todos os vídeos da sequência; acima: toda pausa maior que esses segundos fica com eles, 60% depois da fala e o resto antes da seguinte (no começo do bloco, só a parte de antes; no fim, só a de depois); corte menor que 0,08 s não é feito, nem o que deixaria pedaço menor que 0,5 s; pausa: a regra da Edição rápida; o bloco vira vários, com o mesmo nome, e os novos ids vêm em criados)
removerTrechos {bloco, trechos: [[inicio, fim], ...]} (segundos do arquivo, como os de ver_transcricao; o resto encosta)
enquadrar {bloco, zoom: 1 a 8, focoX, focoY: 0 a 1, rosto: true, chaves: [{t, zoom, focoX, focoY}], encaixe: preencher|caber|desfocar, recorte: {esquerda, topo, direita, base}, espelharH, espelharV, girar: 0|90|180|270, limpar}
ligar {de, para} (de e para: id de um bloco do grupo, ou o de um Final; o grupo tem o id do primeiro bloco dele; encadeia os grupos na ordem do Final, não junta: para juntar dois grupos, mover; soma uma ligação, não troca a que existe: cada saída de um grupo vira uma variação; para a sequência das cenas, ordenar)
ordenar {grupos: [ids de um bloco de cada grupo, na ordem], final} (liga as cenas nessa ordem e a última ao Final, no lugar das ligações entre elas e das delas ao Final, inclusive a automática do primeiro bloco; ligações de fora, como ganchos que chegam à primeira, ficam; sem final, o único que houver)
remover {ids, fechar} (ids de blocos, Finais, ligações, como as de ligacoes, ou notas; fechar: true encosta a sequência onde o bloco saiu; sem ele, tirar um bloco do meio parte o grupo em dois; tirar o primeiro bloco muda o id do grupo para o do bloco seguinte, e o nome e as ligações (com o mesmo id) vão junto, sem voltar em mudou; a resposta diz em gruposComIdNovo)
som {bloco, volume: 0 a 4, mudo}
final {id, resolucao, formato, velocidade}
organizar {}
Em adicionar, rascunho, nota e dividir, rotulo: "nome" permite citar esse bloco como "@nome" nos comandos seguintes do mesmo lote (em bloco, depois, antes, sobre, de, para, grupo, nota, perto, grupos e ids).
Com sobre, em conta do começo do bloco citado (o do primeiro bloco é o do grupo) e pode passar dele até o fim do grupo. A camada fica presa ao ponto da fala em que começa: cortar, velocidade, removerPausas, removerTrechos e trocar no bloco de baixo a levam junto, sem refazer. A animação em código também leva o fim e estica ou encolhe com a fala; vídeo, imagem e som mantêm a duração.
Vídeo de arquivo sem faixa de som (o WebM do render) entra sem a camada de áudio sozinho; semSom faz o mesmo com qualquer vídeo.
O primeiro bloco de um projeto vazio já traz o Final "final", ligado a ele. Tempos de inicio, fim e o em de dividir são do arquivo; o em de sobre e o t das chaves são do bloco.`;

const RENDER = `Regras do HTML: anime só pela linha do tempo tl (GSAP 3, já criada e pausada), com tempos em segundos: tl.to(...), tl.fromTo(..., 1.2), tl.set(..., 3); nada de setTimeout, requestAnimationFrame, Math.random ou relógio. Posicione dentro de #root (position: relative, do tamanho do Final; cor padrão branca, fonte padrão Inter). Sem internet: nada de link, CDN ou imagem externa. Fontes, pelo nome no CSS: ${FONTES.join(", ")}; emojis saem coloridos em qualquer uma. Desfoque grande, 3D e vídeo dentro do HTML ficam lentos. Se falhar, render_falhou traz o log em detalhe.`;

const texto = (descricao: string) => ({ type: "string", description: descricao });
const objeto = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const projeto = texto("Id do projeto.");
const src = texto('Endereço do arquivo: "/videos/<id>.mp4" de listar_videos, o src de um ativo de listar_avatares, um arquivo de ver_projeto (incluir: arquivos) ou o href de uma exportação pronta.');

const FERRAMENTAS = [
  {
    name: "listar_videos",
    description: "Vídeos prontos que podem entrar num projeto, com a fala, o modelo, o avatar, a duração e a data, do mais novo ao mais antigo, 20 por vez. Filtre pela fala e pela data; continuar traz os próximos. Para baixar: baixar é o endereço (com o mesmo token) e arquivo, o nome com a extensão.",
    inputSchema: objeto({
      busca: texto("Parte da fala ou do nome."),
      desde: texto('Data, como "2026-11-02" (UTC): só os feitos nesse dia ou depois.'),
      ate: texto('Data, como "2026-11-02" (UTC): só os feitos até o fim desse dia.'),
      limite: { type: "integer", description: "Quantos por vez, de 1 a 100; sem isso, 20." },
      continuar: texto("O continuar da resposta anterior, para a página seguinte."),
    }),
  },
  { name: "listar_avatares", description: "Avatares da conta com os ativos (fotos, vídeos e áudios); o id de um ativo entra num projeto com adicionar {ativo}. De cada ativo: arquivo (o nome com a extensão), mime, tamanho em bytes e baixar (o endereço, com o mesmo token).", inputSchema: objeto({ busca: texto("Parte do nome.") }) },
  {
    name: "listar_animacoes",
    description: "Animações em código já feitas nos projetos da conta, para reusar com adicionar {animacao: {projeto, bloco}}: do mesmo projeto, dos projetos que usam um avatar ou pela busca. Cada uma traz o projeto, o bloco, o nome, a duração, o texto na tela e os parametros, sem o código (leia com ver_projeto incluir: codigo).",
    inputSchema: objeto({
      projeto: texto("Só as deste projeto."),
      avatar: texto("Só as dos projetos que usam este avatar (vídeos e ativos dele), de listar_avatares."),
      busca: texto("Parte do nome, do texto na tela ou de um valor de parâmetro."),
      limite: { type: "integer", description: "Quantas, de 1 a 100; sem isso, 20, do projeto editado por último ao mais antigo." },
    }),
  },
  { name: "listar_projetos", description: "Projetos da conta, o editado por último primeiro.", inputSchema: objeto({ busca: texto("Parte do nome.") }) },
  { name: "criar_projeto", description: "Cria um projeto vazio.", inputSchema: objeto({ nome: texto("Nome do projeto.") }, ["nome"]) },
  {
    name: "ver_projeto",
    description: "Revisão, grupos com os blocos (tipo, camada, início e fim no grupo), ligações (id, de, para: grupo ou Final), Finais com as variações, avisos e as notas da pessoa (texto solto no canvas, como briefing e referências: leia antes de editar; remover {ids} tira uma). Os arquivos, o código das animações e o canvas inteiro são grandes: peça em incluir só quando precisar.",
    inputSchema: objeto({ projeto, incluir: { type: "array", items: { type: "string", enum: ["arquivos", "codigo", "canvas"] }, description: "arquivos: os arquivos do projeto (id e src para adicionar); codigo: o HTML de cada animação, para editar com editarCodigo, com escala quando ela esticou ou encolheu com a fala (os tempos do código são os de antes) e esticar: false quando não estica; canvas: o modelo inteiro, com posições e ajustes de cada bloco." } }, ["projeto"]),
  },
  {
    name: "editar_projeto",
    description: "Aplica um lote de comandos sobre uma revisão. A tela de quem estiver com o projeto aberto acompanha sozinha. A resposta traz só o que o lote mudou: revisão, ids criados e, em mudou, os grupos novos ou alterados com só os blocos novos ou alterados (os que só andaram vêm em andaram, uma faixa de..ate por deslocamento; sem blocos, o grupo só mudou de nome ou de duração), as ligações e os Finais novos ou alterados, os removidos, gruposComIdNovo [{de, para}] quando o grupo só trocou de id (o primeiro bloco saiu), os avisos novos ou que mudaram de valor (rascunho sem a fala; grupo_partido quando um bloco tirado do meio partiu o grupo; final_sem_variacao quando nenhum grupo chega a um Final) e os resolvidos; avisosPendentes conta os que restam. O projeto inteiro fica no ver_projeto.",
    inputSchema: objeto({ projeto, revisao: { type: "integer", description: "A revisão lida em ver_projeto." }, comandos: { type: "array", items: { type: "object" }, description: COMANDOS } }, ["projeto", "revisao", "comandos"]),
  },
  {
    name: "ver_quadros",
    description: "Mostra até 12 instantes de um arquivo, lado a lado, para ver o vídeo.",
    inputSchema: objeto({ projeto, src, instantes: { type: "array", items: { type: "number" }, description: "Segundos do arquivo." } }, ["projeto", "src", "instantes"]),
  },
  {
    name: "inspecionar_animacao",
    description:
      'Abre o código de uma animação (bloco do ver_projeto) no navegador do render, sem fazer vídeo, e mede cada instante; barato, em texto. Volta: problemas [{tipo, alvo, t, detalhe}] (quebrou, palavra_partida, fora_da_tela, cortado_pelo_pai, texto_cortado, texto_sobre_texto, fonte, erro_de_script, passa_do_bloco); instantes com os elementos visíveis no primeiro ("seletor x,y LxA op0.5 2linhas \"texto\"", em px do Final) e depois só o que mudou e o que saiu; linhaDoTempo com cada tween ("início-fim alvo propriedades"); duracao do bloco e da animação. Os tempos são os da página, já com a escala (a animação que esticou com a fala mostra os tempos esticados). Para conferir as linhas de um texto, marque-o com data-linhas="1" (ou o número que cabe).',
    inputSchema: objeto(
      {
        projeto,
        bloco: texto("Id do bloco de animação."),
        instantes: { type: "array", items: { type: "number" }, description: "Até 12 segundos do bloco; sem isso, o começo, os quartos e o fim." },
        quadros: { type: "boolean", description: "Traz também os instantes lado a lado em imagem (custa mais); só quando o texto não bastar." },
        final: texto("Id do Final cujo tamanho vale; sem isso, o primeiro."),
      },
      ["projeto", "bloco"],
    ),
  },
  {
    name: "ver_transcricao",
    description: "A fala de um arquivo com o tempo de cada palavra, para editar pelo texto: tirar vícios, repetições e frases com removerTrechos. Os tempos são aproximados: confira as bordas com ver_silencios.",
    inputSchema: objeto({ projeto, src }, ["projeto", "src"]),
  },
  { name: "ver_silencios", description: "Duração e silêncios de um arquivo, com a regra da Edição rápida; som: false quando o arquivo não tem áudio (nada a cortar).", inputSchema: objeto({ projeto, src }, ["projeto", "src"]) },
  {
    name: "enviar_arquivo",
    description:
      "Guarda um arquivo no projeto: JPG, PNG ou WebP (até 10 MB); MP4, MOV, WebM, MP3, M4A, WAV ou OGG (até 50 MB). Mande url (o servidor baixa; o melhor caminho para uma imagem da web ou um link público) ou base64 (até 10 MB). SVG e HTML não entram. WebM com transparência serve de camada sobre o vídeo. Depois, ponha no projeto com adicionar {arquivo: id do src}.",
    inputSchema: objeto(
      {
        projeto,
        url: texto("Endereço público (http ou https) do arquivo; o servidor baixa. Sem url, mande base64."),
        nome: texto("Nome do arquivo; com url, sem isso, o fim do endereço."),
        tipo: texto('Tipo, como "image/png" ou "video/webm"; com url, sem isso, o que o endereço disser.'),
        base64: texto("Conteúdo em base64, quando não houver url."),
      },
      ["projeto"],
    ),
  },
  {
    name: "gerar_imagem",
    description:
      "Gera uma imagem com o Nano Banana 2.1 (gasta créditos: uns US$ 0,04 em 1K, 0,06 em 2K) e devolve o id, o src e a própria imagem, para você conferir antes de usar. Ponha no projeto com adicionar {imagem: id} (ou trocar). Com referencia, a pessoa e o que a descrição não muda seguem aquela imagem: a foto de um ativo, um arquivo do projeto ou outra imagem gerada (para ajustar a anterior). Fica também na lista do modelo no site.",
    inputSchema: objeto(
      {
        projeto,
        descricao: texto("A cena: quem aparece, onde, a luz e o enquadramento. Até 2.000 caracteres."),
        referencia: texto('src de uma imagem: a foto de um ativo de listar_avatares, um arquivo do projeto ou o src de outra imagem gerada ("/videos/<id>.png").'),
        resolucao: texto('"1K" (padrão) ou "2K".'),
        formato: texto('Como "9:16" ou "16:9"; sem isso, o do Final.'),
        final: texto("Id do Final cujo formato vale; sem isso, o primeiro."),
      },
      ["projeto", "descricao"],
    ),
  },
  {
    name: "renderizar_html",
    description: `Faz um vídeo transparente (WebM) de uma composição em HTML e o guarda no projeto; depois, ponha-o sobre o vídeo com adicionar {arquivo, dur, sobre, em}. Só quando precisar do arquivo: para pôr uma animação no projeto, adicionar {html, duracao} guarda o código, e a exportação faz o vídeo. ${RENDER}`,
    inputSchema: objeto(
      {
        projeto,
        nome: texto('Nome do arquivo, como "legenda.webm".'),
        html: texto("Só o conteúdo: elementos, <style> e <script>. A página, o tamanho e o fundo transparente já existem."),
        duracao: { type: "number", description: "Segundos do vídeo, até 60." },
        final: texto("Id do Final cujo tamanho vale; sem isso, o primeiro."),
      },
      ["projeto", "html", "duracao"],
    ),
  },
  {
    name: "legendar",
    description: `Legenda palavra a palavra de um grupo, pronta: as palavras vêm da transcrição dos blocos que falam, já no tempo do grupo (corte e velocidade valem), e entram no projeto como uma animação em código por cima do grupo, que a prévia mostra e a exportação renderiza. Responde como o editar_projeto, com a revisão nova, o id em criados e as palavras e trechos em legenda. Faça depois dos cortes; se o grupo mudar, chame de novo com bloco: o id da legenda, e o código e o tempo dela são trocados. Use simular: true para ver palavras e trechos sem fazer o vídeo; corrija a grafia (a da tela é o português correto) e mande as palavras de volta em palavras. Padrão do caso aprovado: Inter Black de 44 px, maiúsculas, palavra dita em verde, no máximo duas linhas. Onde já houver texto na tela, passe o intervalo em semTexto.`,
    inputSchema: objeto(
      {
        projeto,
        grupo: texto("Id do grupo, de ver_projeto."),
        revisao: { type: "integer", description: "A revisão lida em ver_projeto; obrigatória sem simular." },
        bloco: texto("Id de uma legenda que já está no projeto, para trocar o código dela em vez de pôr outra."),
        nome: texto('Nome do bloco; sem isso, "Legenda".'),
        simular: { type: "boolean", description: "Só devolve palavras e trechos, sem mexer no projeto." },
        palavras: { type: "array", items: { type: "object" }, description: "[{palavra, inicio, fim}] em segundos do grupo, como simular devolve; sem isso, a transcrição." },
        semTexto: { type: "array", items: { type: "array", items: { type: "number" } }, description: "[[de, ate]] em segundos do grupo onde já há texto na tela." },
        fontes: { type: "array", items: { type: "string" }, description: "Ids dos blocos que falam; sem isso, os de vídeo da sequência com som." },
        estilo: { type: "object", description: `{fonte, tamanho (numa tela de 720 de largura), cor, destaque, maiusculas, altura (0 topo a 1 base)}. Fontes: ${FONTES.join(", ")}.` },
        final: texto("Id do Final cujo tamanho vale; sem isso, o primeiro."),
      },
      ["projeto", "grupo"],
    ),
  },
  {
    name: "limpar_arquivos",
    description: "Os arquivos do projeto que nenhum bloco usa (como os WebMs de animações refeitas), com o tamanho. Com apagar: true, apaga de vez. Confira a lista antes; durante uma exportação, recusa.",
    inputSchema: objeto({ projeto, apagar: { type: "boolean", description: "Apaga de vez os arquivos da lista; sem isso, só mostra." } }, ["projeto"]),
  },
  {
    name: "exportar",
    description: "Começa a exportação de um Final. Depois, chame acompanhar_exportacao até ficar pronta.",
    inputSchema: objeto({ projeto, final: texto("Id do Final."), versoes: { type: "array", items: { type: "integer" }, description: "Posições das variações; sem isso, todas." } }, ["projeto", "final"]),
  },
  { name: "acompanhar_exportacao", description: "Faz o próximo passo e devolve o andamento; pronta, traz os endereços para baixar com o mesmo token.", inputSchema: objeto({ projeto, exportacao: texto("Id da exportação.") }, ["projeto", "exportacao"]) },
];

type Args = Record<string, unknown>;
type Interna = (metodo: string, caminho: string, corpo?: BodyInit, cabecalhos?: Record<string, string>) => Promise<Response>;

const seguro = (v: unknown) => encodeURIComponent(String(v));
const json = (v: unknown) => JSON.stringify(v);

function base64(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** O teto do enviar_arquivo por url: o do maior arquivo que o projeto aceita (vídeo e áudio). */
const MAX_URL = 50 * 1024 * 1024;

/**
 * enviar_arquivo com url: o servidor baixa e manda para a mesma rota do envio. Assim o agente sem
 * terminal (que não consegue montar o base64) põe uma imagem da web no projeto; o tipo e o
 * tamanho passam pela mesma conferência do envio (só os tipos de MEDIA_TYPES, src/arquivos.ts).
 */
async function baixar(a: Args, chama: Interna, destino: string): Promise<Response> {
  let url: URL;
  try {
    url = new URL(String(a.url));
  } catch {
    return Response.json({ erro: "url_invalida" }, { status: 400 });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return Response.json({ erro: "url_invalida" }, { status: 400 });
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "image/*,video/*,audio/*;q=0.9,*/*;q=0.1" } });
  } catch (err) {
    console.error("enviar_arquivo: o endereço não respondeu", url.host, err);
    return Response.json({ erro: "url_indisponivel" }, { status: 502 });
  }
  if (!res.ok || !res.body) return Response.json({ erro: "url_indisponivel", status: res.status }, { status: 502 });
  if (Number(res.headers.get("content-length")) > MAX_URL) return Response.json({ erro: "arquivo_grande_demais" }, { status: 413 });
  // Lê aos pedaços e para no teto: o content-length pode faltar ou mentir.
  const partes: Uint8Array[] = [];
  let total = 0;
  const leitor = res.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_URL) {
      await leitor.cancel();
      return Response.json({ erro: "arquivo_grande_demais" }, { status: 413 });
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  const tipo = (typeof a.tipo === "string" && a.tipo) || (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  let nome = typeof a.nome === "string" ? a.nome : "";
  if (!nome) {
    try {
      nome = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    } catch {
      nome = "";
    }
  }
  return chama("POST", destino, bytes, { "content-type": tipo, "x-nome": seguro(nome || "arquivo") });
}

/** O pedido interno de cada ferramenta. */
function pedido(nome: string, a: Args, chama: Interna): Promise<Response> | null {
  const p = `/api/v1/projetos/${seguro(a.projeto)}`;
  const site = `/projetos/${seguro(a.projeto)}`;
  switch (nome) {
    case "listar_videos":
      return chama("GET", `/api/v1/videos?${new URLSearchParams(Object.entries({ q: a.busca, desde: a.desde, ate: a.ate, limite: a.limite, continuar: a.continuar }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "listar_avatares":
      return chama("GET", `/api/v1/avatares?q=${seguro(a.busca ?? "")}`);
    case "listar_animacoes":
      return chama("GET", `/api/v1/animacoes?${new URLSearchParams(Object.entries({ projeto: a.projeto, avatar: a.avatar, q: a.busca, limite: a.limite }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "listar_projetos":
      return chama("GET", `/api/v1/projetos?q=${seguro(a.busca ?? "")}`);
    case "criar_projeto":
      return chama("POST", "/api/v1/projetos", json({ nome: a.nome }));
    case "ver_projeto":
      return chama("GET", `${p}?incluir=${seguro(Array.isArray(a.incluir) ? a.incluir.join(",") : "")}`);
    case "editar_projeto":
      return chama("POST", `${p}/comandos`, json({ revisao: a.revisao, comandos: a.comandos }));
    case "ver_quadros":
      return chama("GET", `${p}/quadros?src=${seguro(a.src)}&instantes=${seguro(Array.isArray(a.instantes) ? a.instantes.join(",") : "")}`);
    case "inspecionar_animacao":
      return chama("GET", `${p}/animacao?${new URLSearchParams(Object.entries({ bloco: a.bloco, instantes: Array.isArray(a.instantes) ? a.instantes.join(",") : undefined, quadros: a.quadros === true ? "1" : undefined, final: a.final }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "ver_transcricao":
      return chama("GET", `${p}/transcricao?src=${seguro(a.src)}`);
    case "ver_silencios":
      return chama("GET", `${p}/silencios?src=${seguro(a.src)}`);
    case "gerar_imagem":
      return chama("POST", `${p}/imagem`, json({ descricao: a.descricao, referencia: a.referencia, resolucao: a.resolucao, formato: a.formato, final: a.final, previa: true }));
    case "renderizar_html":
      return chama("POST", `${p}/html`, json({ nome: a.nome, html: a.html, duracao: a.duracao, final: a.final }));
    case "legendar":
      return chama("POST", `${p}/legenda`, json({ grupo: a.grupo, revisao: a.revisao, bloco: a.bloco, nome: a.nome, simular: a.simular, palavras: a.palavras, semTexto: a.semTexto, fontes: a.fontes, estilo: a.estilo, final: a.final }));
    case "limpar_arquivos":
      return chama("POST", `${p}/limpar`, json({ apagar: a.apagar }));
    case "exportar":
      return chama("POST", `${site}/exportar`, json({ final: a.final, versoes: a.versoes }));
    case "acompanhar_exportacao":
      return chama("POST", `${site}/exportacoes/${seguro(a.exportacao)}`);
    case "enviar_arquivo": {
      if (typeof a.url === "string" && a.url) return baixar(a, chama, `${site}/arquivos`);
      const conteudo = typeof a.base64 === "string" ? a.base64 : "";
      if (!conteudo || conteudo.length > MAX_BASE64) return Promise.resolve(Response.json({ erro: "arquivo_grande_demais" }, { status: 413 }));
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(conteudo), (c) => c.charCodeAt(0));
      } catch {
        return Promise.resolve(Response.json({ erro: "base64_invalido" }, { status: 400 }));
      }
      return chama("POST", `${site}/arquivos`, bytes, { "content-type": String(a.tipo), "x-nome": seguro(a.nome) });
    }
    default:
      return null;
  }
}

/** A resposta da rota vira resultado da ferramenta; recusa é erro da ferramenta, não do protocolo. */
async function resultado(res: Response) {
  if (res.headers.get("content-type")?.startsWith("image/")) {
    return { content: [{ type: "image", data: base64(await res.arrayBuffer()), mimeType: res.headers.get("content-type")! }] };
  }
  const text = await res.text();
  // O mosaico da inspeção e a imagem gerada vêm em base64 no JSON: viram imagem, e o texto fica sem eles.
  if (res.ok && text.includes('"quadros":"')) {
    const { quadros, ...resto } = JSON.parse(text) as { quadros?: unknown };
    if (typeof quadros === "string") return { content: [{ type: "text", text: json(resto) }, { type: "image", data: quadros, mimeType: "image/jpeg" }] };
  }
  if (res.ok && text.includes('"previa":"')) {
    const { previa, previaTipo, ...resto } = JSON.parse(text) as { previa?: unknown; previaTipo?: unknown };
    if (typeof previa === "string") return { content: [{ type: "text", text: json(resto) }, { type: "image", data: previa, mimeType: typeof previaTipo === "string" ? previaTipo : "image/png" }] };
  }
  return { content: [{ type: "text", text: text || res.statusText }], isError: !res.ok };
}

type Falha = { error: { code: number; message: string; data?: unknown }; status: number };
type Certo = { result: Record<string, unknown> };
type Resposta = Certo | Falha;

const falha = (status: number, code: number, message: string, data?: unknown): Falha => ({ status, error: { code, message, ...(data ? { data } : {}) } });

async function chamar(params: Args, chama: Interna): Promise<Resposta> {
  const res = pedido(String(params.name), (params.arguments ?? {}) as Args, chama);
  if (!res) return falha(400, -32602, `Unknown tool: ${String(params.name)}`);
  try {
    return { result: await resultado(await res) };
  } catch (err) {
    // Uma exceção derrubaria o pedido inteiro (erro 1101), e o agente não saberia o que houve.
    console.error(`Ferramenta ${String(params.name)} falhou`, err);
    return { result: { content: [{ type: "text", text: json({ erro: "falha_interna" }) }], isError: true } };
  }
}

/** O protocolo de antes da revisão 2026-07-28. */
async function legado(metodo: string, params: Args, chama: Interna): Promise<Resposta> {
  switch (metodo) {
    case "initialize":
      return {
        result: {
          protocolVersion: VERSOES.includes(params.protocolVersion as string) ? params.protocolVersion : VERSOES[0],
          capabilities: { tools: {} },
          serverInfo: SERVIDOR,
          instructions: INSTRUCOES,
        },
      };
    case "ping":
      return { result: {} };
    case "tools/list":
      return { result: { tools: FERRAMENTAS } };
    case "tools/call":
      return chamar(params, chama);
    default:
      return { ...falha(200, -32601, `Method not found: ${metodo}`) };
  }
}

/** O nome no cabeçalho, que vem em base64 quando não é ASCII simples. */
function cabecalho(valor: string | null): string | null {
  const b64 = valor && /^=\?base64\?(.*)\?=$/.exec(valor);
  if (!b64) return valor;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64[1]!), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** Revisão 2026-07-28: cada pedido se apresenta sozinho, e o cabeçalho tem de bater com o corpo. */
async function atual(request: Request, metodo: string, params: Args, meta: Args, chama: Interna): Promise<Resposta> {
  const versao = meta[META_VERSAO];
  if (typeof versao !== "string" || typeof meta[META_CAPACIDADES] !== "object" || meta[META_CAPACIDADES] === null) return falha(400, -32602, "Invalid params: missing required _meta field");
  const h = request.headers;
  const difere = (nome: string, valor: string | null, esperado: unknown) =>
    valor === esperado ? null : falha(400, -32020, `Header mismatch: ${nome} header value '${valor ?? ""}' does not match body value '${String(esperado)}'`);
  const erro = difere("MCP-Protocol-Version", h.get("mcp-protocol-version"), versao) ?? difere("Mcp-Method", h.get("mcp-method"), metodo) ?? (metodo === "tools/call" ? difere("Mcp-Name", cabecalho(h.get("mcp-name")), params.name) : null);
  if (erro) return erro;
  if (versao !== ATUAL) return falha(400, -32022, "Unsupported protocol version", { supported: [ATUAL, ...VERSOES], requested: versao });
  const fim = (result: Record<string, unknown>): Certo => ({ result: { resultType: "complete", ...result, _meta: { "io.modelcontextprotocol/serverInfo": SERVIDOR } } });
  switch (metodo) {
    case "server/discover":
      return fim({ supportedVersions: [ATUAL, ...VERSOES], capabilities: { tools: {} }, instructions: INSTRUCOES, ...CACHE });
    case "tools/list":
      return fim({ tools: FERRAMENTAS, ...CACHE });
    case "tools/call": {
      const r = await chamar(params, chama);
      return "result" in r ? fim(r.result) : r;
    }
    default:
      return falha(404, -32601, "Method not found");
  }
}

export async function handleMcp(request: Request, chama: Interna): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  // Página de outro site: o token não sai do cliente, mas a especificação pede a conferência.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("forbidden", { status: 403 });
  let msg: { id?: string | number | null; method?: unknown; params?: unknown };
  try {
    msg = (await request.json()) as typeof msg;
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }, { status: 400 });
  }
  if (typeof msg?.method !== "string") return Response.json({ jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Mensagem inválida." } }, { status: 400 });
  // Sem id é aviso: não tem resposta.
  if (msg.id === undefined) return new Response(null, { status: 202 });
  const params = (msg.params ?? {}) as Args;
  const meta = (params._meta ?? {}) as Args;
  const antigo = msg.method === "initialize" || (meta[META_VERSAO] === undefined && (request.headers.get("mcp-protocol-version") ?? VERSOES[0]) !== ATUAL);
  const r = await (antigo ? legado(msg.method, params, chama) : atual(request, msg.method, params, meta, chama));
  if ("result" in r) return Response.json({ jsonrpc: "2.0", id: msg.id, result: r.result });
  return Response.json({ jsonrpc: "2.0", id: msg.id, error: r.error }, { status: r.status });
}
