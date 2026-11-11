/**
 * Servidor MCP (docs/api.md): deixa um agente usar a API dos projetos como ferramentas. É
 * uma camada fina: cada ferramenta vira um pedido às rotas que já existem, com o mesmo token,
 * e por isso as permissões e as regras são as mesmas. Sem sessão: cada POST é uma mensagem
 * JSON-RPC, e a resposta vem em JSON.
 *
 * Segue a revisão 2026-07-28: cada pedido traz a versão e as capacidades em _meta, sem
 * handshake. Quem chega com `initialize` ou sem esse _meta é cliente de antes dela, e
 * recebe o protocolo antigo no mesmo endereço, sem cabeçalhos novos.
 *
 * Custo fixo de contexto (11/11/2026): as instruções e a lista de ferramentas vão em toda
 * conversa, usadas ou não (eram uns 39 mil caracteres). Aqui fica só o que o agente precisa para
 * escolher a ferramenta e montar a chamada; as regras e os casos de cada assunto ficam em AJUDA,
 * que o agente lê pela ferramenta ajuda quando vai usar. Regra nova entra em AJUDA, não na descrição.
 */
import { FONTES } from "./render";

const ATUAL = "2026-07-28";
const VERSOES = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const META_VERSAO = "io.modelcontextprotocol/protocolVersion";
const META_CAPACIDADES = "io.modelcontextprotocol/clientCapabilities";
const SERVIDOR = { name: "meu-avatar", version: "1.15.0" };
/**
 * A lista de ferramentas não depende de quem pede. Curto: com 1 h, uma sessão aberta antes de
 * publicar seguiu com a descrição velha (sem rascunho e trocar) no teste de 02/11/2026.
 */
export const CACHE = { ttlMs: 5 * 60_000, cacheScope: "public" };
/** O arquivo vai em base64 na mensagem: acima disso, use a rota de arquivos direto. */
const MAX_BASE64 = 14 * 1024 * 1024;

const INSTRUCOES = `Edita vídeos nos projetos do Meu Avatar. O fluxo: ver_projeto (traz a revisao e as notas da pessoa: leia antes de editar), editar_projeto com um lote de comandos e, depois, os avisos novos em mudou. Em conflito, a resposta já traz o projeto como está agora: refaça o lote sobre a revisão nova. Antes de cortar, olhe: ver_quadros, ver_silencios e ver_transcricao. Para ver como uma cena sai, com todas as camadas, ver_cena, sem exportar; depois de exportar, o href de cada versão serve de src nas ferramentas de ver. Roteiro: um grupo por cena, de preferência até uns 30 s, em ordem até o Final com ordenar. Antes de criar uma animação, procure uma já feita com listar_animacoes e parta dela. Gerar vídeo, imagem e áudio gasta créditos, não tem modelo padrão (listar_modelos) e é em dois passos: a primeira chamada só simula e devolve o custo e a confirmacao; mostre à pessoa o modelo, o pedido e o custo e só gere com o sim dela. Apagar (apagar_projeto, limpar_arquivos) também só com o sim da pessoa. Exportar usa o contêiner, sem créditos de modelo. As regras de cada assunto ficam fora daqui, para poupar contexto, na ferramenta ajuda {assunto}. Leia sempre "animacoes" antes de escrever o HTML de uma animação (as regras dele só estão lá) e "comandos" antes do primeiro lote com um comando que você não domina (ou só o nome dele, como "trocar"). As outras, quando a descrição da ferramenta não bastar ou algo sair diferente do esperado: "cenas" (roteiro, variações, avisos e exportação), "legenda", "gerar" (modelos, vozes e os dois passos) e "arquivos" (acervo, pastas, envio e download). Ferramenta citada que não está na sua lista foi publicada depois que você conectou: veja listar_ferramentas e chame com usar_ferramenta, sem pedir para reconectar.`;

/** Onde o bloco novo entra: vale para adicionar e rascunho. */
const POS = "depois: bloco | sobre: bloco, em: segundos";

/**
 * Cada comando do editar_projeto: a assinatura (vai na descrição da ferramenta, em toda conversa) e
 * as regras e os casos (só na ajuda, quando o agente pede). Comando novo entra aqui, com as duas.
 */
const COMANDO: { tipo: string; assinatura: string; nota?: string; regras: string }[] = [
  {
    tipo: "adicionar",
    assinatura: `{video|arquivo|ativo|imagem|audio: id, nome, inicio, fim, semSom, dur, ${POS}}`,
    nota: "bloco de um arquivo; dur, a duração do arquivo (de ver_silencios), é obrigatório em vídeo e áudio de arquivo e de ativo enviado (o gerado não precisa)",
    regras:
      "imagem: o id de gerar_imagem. Toda imagem (gerada, de arquivo ou de ativo) fica na tela de inicio a fim, 3 s sem fim. audio: o id de um áudio gerado, de listar_arquivos. depois encadeia som com som e imagem ou vídeo com imagem ou vídeo: falas de áudio em sequência formam a base de um grupo só de som; depois de uma fala cortada em pedaços é depois do último pedaço. Sem depois nem sobre: bloco solto, uma cena nova. Vídeo de arquivo sem faixa de som (o WebM do render) entra sem a camada de áudio sozinho; semSom faz o mesmo com qualquer vídeo.",
  },
  {
    tipo: "adicionar (animação)",
    assinatura: `{html, duracao: 0,5 a 60, parametros, nome, esticar, ${POS}}`,
    nota: "animação em código, guardada no projeto",
    regras:
      "Títulos, selos, gráficos, legendas; as regras do HTML estão em ajuda {assunto: \"animacoes\"}. Sem nome, Animação 1, Animação 2... A tela mostra na prévia, e a exportação faz o vídeo dela; por cima de uma fala, estica ou encolhe com ela, a não ser com esticar: false.",
  },
  {
    tipo: "adicionar (cópia)",
    assinatura: `{animacao: {projeto, bloco}, parametros, duracao, nome, ${POS}}`,
    nota: "copia uma animação de listar_animacoes",
    regras: "Copia o código, os parametros, a duração, a escala e o nome; o que vier aqui muda, e os parametros se juntam aos dela. A cópia é independente.",
  },
  {
    tipo: "editarCodigo",
    assinatura: "{bloco, html | trocas: [{de, para}], parametros, esticar}",
    regras:
      "Troca o código de uma animação inteiro ou só trechos; cada de aparece uma vez só no código, como está; leia o código com ver_projeto incluir: codigo. esticar liga ou desliga para as próximas mudanças da fala, sem mudar a duração de agora. Se o código trouxer escala, os tempos dele são os de antes dela: as trocas a mantêm, e o html inteiro novo volta a escala a 1, escrito para a duração atual.",
  },
  {
    tipo: "rascunho",
    assinatura: `{fala, descricao, duracao: 0,5 a 30, nome, ${POS}}`,
    nota: "o lugar de um vídeo que ainda não existe; a exportação espera a troca",
    regras: "Um cartão com a fala. fala é o que será dito, para gerar o vídeo ou o áudio; descricao, o resto: a cena, o enquadramento, referências. As duas são opcionais, pode ficar em branco. Sem nome, Texto 1, Texto 2...",
  },
  {
    tipo: "trocar",
    assinatura: "{bloco, video|arquivo|ativo|imagem|audio: id, inicio, fim, dur, nome, aparar}",
    nota: "o arquivo no lugar do bloco, como o vídeo pronto no do rascunho",
    regras:
      "Áudio só por áudio. Sem inicio nem fim, o vídeo ou o áudio entra sem o silêncio das pontas, e aparar: false o põe inteiro. O que está em cima fica e a sequência acompanha; no lugar de um rascunho, a camada vai para o mesmo ponto na proporção do bloco, já aparado. Sem nome, o bloco fica com o nome do arquivo.",
  },
  { tipo: "nota", assinatura: "{texto, perto}", nota: "texto solto no canvas, fora da exportação", regras: "Como um post-it amarelo: briefing, roteiro, referências, o que falta fazer. perto: um bloco, nota ou Final (fica logo acima dele); sem perto, embaixo de tudo. Até 10 mil caracteres, com as quebras de linha." },
  { tipo: "editarNota", assinatura: "{nota, texto}", regras: "Troca o texto de uma nota; as notas e os ids vêm em ver_projeto. Para apagar, remover {ids}." },
  { tipo: "renomear", assinatura: "{bloco | grupo, nome}", regras: "Com grupo, o nome da cena, como Cena 1, no lugar de Bloco 1; vale o id de qualquer bloco dele." },
  { tipo: "cortar", assinatura: "{bloco, inicio, fim | duracao}", regras: "duracao no lugar de fim: o que fica a partir do início; num rascunho, cortar {bloco, duracao: 3} deixa 3 s." },
  { tipo: "dividir", assinatura: "{bloco, em}", regras: "Dois blocos, no instante em do arquivo; 0,5 s no mínimo de cada lado." },
  {
    tipo: "mover",
    assinatura: "{bloco, depois | antes}",
    nota: "também para outro grupo: assim se juntam dois",
    regras: "Põe o bloco em outra posição, sem buraco. Áudio só entre áudios. A fala cortada em pedaços anda inteira, e depois dela, em mover e adicionar, é depois do último pedaço.",
  },
  { tipo: "velocidade", assinatura: "{bloco, velocidade: 0,25 a 4}", regras: "Mantém o tom da voz; o resto da sequência acompanha." },
  {
    tipo: "removerPausas",
    assinatura: "{bloco?, pausa: curta|media|longa | acima: 0,1 a 5}",
    regras:
      "Vídeo ou áudio; sem bloco, a fala de cada grupo: os vídeos e áudios das bases. acima: toda pausa maior que esses segundos fica com eles, 60% depois da fala e o resto antes da seguinte (no começo do bloco, só a parte de antes; no fim, só a de depois); corte menor que 0,08 s não é feito, nem o que deixaria pedaço menor que 0,5 s. pausa: a regra da Edição rápida. O bloco vira vários, com o mesmo nome, e os novos ids vêm em criados.",
  },
  { tipo: "removerTrechos", assinatura: "{bloco, trechos: [[inicio, fim], ...]}", regras: "Segundos do arquivo, como os de ver_transcricao; o resto encosta. Sobra menor que 0,5 s é recusada: junte-a ao trecho do lado." },
  {
    tipo: "enquadrar",
    assinatura: "{bloco, zoom: 1 a 8, focoX, focoY: 0 a 1, rosto: true, chaves: [{t, zoom, focoX, focoY}], encaixe: preencher|caber|desfocar, recorte: {esquerda, topo, direita, base}, espelharH, espelharV, girar: 0|90|180|270, limpar}",
    regras: "Só muda o que vier. rosto: o ponto entre os olhos. t é o tempo do bloco (negativo continua um movimento do bloco anterior); entre as chaves, a curva é suave. Um movimento de câmera na mesma frase é um só: não mude o foco no meio dela.",
  },
  {
    tipo: "ligar",
    assinatura: "{de, para}",
    nota: "soma uma ligação: cada saída de um grupo vira uma variação",
    regras:
      "de e para: id de um bloco do grupo, ou o de um Final; o grupo tem o id do primeiro bloco dele. Encadeia os grupos na ordem do Final, não junta: para juntar dois grupos, mover. Soma, não troca a ligação que existe; para a sequência das cenas, ordenar. Recusa círculo, repetida e passar de 48 variações.",
  },
  {
    tipo: "ordenar",
    assinatura: "{grupos: [um bloco de cada grupo, na ordem], final}",
    nota: "as cenas em sequência até o Final",
    regras: "Liga as cenas nessa ordem e a última ao Final, no lugar das ligações entre elas e das delas ao Final, inclusive a automática do primeiro bloco; ligações de fora, como ganchos que chegam à primeira, ficam. Sem final, o único que houver. Para ramificar depois de uma cena (corpo, um de N ganchos, Final): tire antes as ligações antigas dos ramos, ordene com um dos ramos e, para cada outro, ligar {de: corpo, para: ramo} e ligar {de: ramo, para: final}.",
  },
  {
    tipo: "remover",
    assinatura: "{ids, fechar}",
    nota: "blocos, Finais, ligações ou notas; fechar: true encosta a sequência, sem ele o grupo se parte em dois",
    regras:
      "ids de blocos, Finais, ligações (as de ligacoes) ou notas. Tirar o primeiro bloco muda o id do grupo para o do bloco seguinte, e o nome e as ligações (com o mesmo id) vão junto, sem voltar em mudou; a resposta diz em gruposComIdNovo.",
  },
  { tipo: "som", assinatura: "{bloco, volume: 0 a 4, mudo}", regras: "Volume do bloco." },
  { tipo: "final", assinatura: "{id, resolucao, formato, velocidade}", nota: "sem id, cria outro Final", regras: "Muda um Final; a velocidade vale para todas as variações dele." },
  { tipo: "organizar", assinatura: "{}", regras: "O mesmo Organizar da tela." },
];

/** O que vale para todos os comandos: curto, na descrição; com os casos, na ajuda. */
const GERAL = `Em adicionar, rascunho, nota e dividir, rotulo: "nome" permite citar esse bloco como "@nome" nos comandos seguintes do mesmo lote. O grupo tem o id do primeiro bloco dele. Com sobre, em conta do começo do bloco citado, e a camada segue o ponto da fala quando o bloco de baixo muda. inicio, fim e o em de dividir são segundos do arquivo; o em de sobre e o t das chaves, do bloco. O primeiro bloco de um projeto vazio já traz o Final "final", ligado a ele.`;
const GERAL_REGRAS = `O "@nome" do rotulo vale em bloco, depois, antes, sobre, de, para, grupo, nota, perto, grupos e ids. Com sobre, em pode passar do bloco citado até o fim do grupo (o do primeiro bloco é o do grupo). A camada fica presa ao ponto da fala em que começa: cortar, velocidade, removerPausas, removerTrechos e trocar no bloco de baixo a levam junto, sem refazer. A animação em código também leva o fim e estica ou encolhe com a fala; vídeo, imagem e som mantêm a duração. parametros: {chave: texto ou número}, até 30, os valores que mudam sem reescrever o código (nome, preço, cor da marca): no HTML, {{chave}} fora dos scripts vira o valor; nos scripts, params.chave. Em editarCodigo, junta aos que já existem, e null tira. Faça o template uma vez e repita o bloco só trocando parametros; a pessoa também troca os valores nos Ajustes do canvas.`;

const COMANDOS = `Lista de comandos, aplicados em ordem; um erro desfaz o lote inteiro e diz em comando a posição do que falhou, a partir de 0. Cada um tem "tipo" (a primeira palavra):
${COMANDO.map((c) => `${c.tipo.split(" ")[0]} ${c.assinatura}${c.nota ? ` (${c.nota})` : ""}`).join("\n")}
${GERAL} As regras e os casos de cada comando: ajuda {assunto: "comandos"} ou o nome de um comando.`;

const RENDER = `Regras do HTML: mande só o conteúdo (elementos, <style> e <script>); a página, o tamanho do Final e o fundo transparente já existem. Anime só pela linha do tempo tl (GSAP 3, já criada e pausada), com tempos em segundos: tl.to(...), tl.fromTo(..., 1.2), tl.set(..., 3); nada de setTimeout, requestAnimationFrame, Math.random ou relógio. Posicione dentro de #root (position: relative, do tamanho do Final; cor padrão branca, fonte padrão Inter). Sem internet: nada de link, CDN ou imagem externa. Fontes, pelo nome no CSS: ${FONTES.join(", ")}; emojis saem coloridos em qualquer uma. Desfoque grande, 3D e vídeo dentro do HTML ficam lentos. Até 60 s. Se falhar, render_falhou traz o log em detalhe.`;

/**
 * O que saiu das instruções e das descrições: o agente lê pela ferramenta ajuda, só o assunto que
 * vai usar. Cada comando também é um assunto, pelo tipo.
 */
const AJUDA: Record<string, string> = {
  // Só as regras: a assinatura de cada comando já está na descrição do editar_projeto (não repetir: o teste de 11/11/2026 leu as duas).
  comandos: `As regras e os casos de cada comando do editar_projeto (as assinaturas estão na descrição dele).\n${COMANDO.map((c) => `${c.tipo}: ${c.regras}`).join("\n")}\n${GERAL_REGRAS}`,
  cenas: `Roteiro com cenas: um grupo por cena, de preferência até uns 30 s (um rascunho ou adicionar sem depois nem sobre abre uma cena nova), e as cenas em ordem até o Final com ordenar {grupos: [...]} (o Final monta a sequência; não é preciso juntar). O lote pode criar as cenas, dar nome e ordenar de uma vez, com rotulo; para mudar a ordem depois, ordenar de novo. Dê nome às cenas com renomear {grupo, nome}. Assim cada edição só mexe no tempo da cena dela e a legenda cabe por grupo; uma cena mais longa pode passar dos 30 s, sem cortar uma fala ou uma cobertura no meio (a cobertura não passa de um grupo para o outro). Para tirar uma fala do meio de uma cena, use remover com fechar: true; sem ele, o grupo se parte em dois (aviso grupo_partido). Variações: cada saída de um grupo (ligar) vira uma variação do Final: 3 ganchos ligados a um corpo e o corpo a 2 CTAs dão 6 vídeos, até 48 por Final. Avisos em mudou e no ver_projeto: sem_video_de_base quer dizer que aquele trecho sai sobre fundo preto, salvo se uma cobertura opaca o preencher; rascunho é uma fala que ainda espera o vídeo (a exportação é recusada até a troca); final_sem_variacao, nenhum grupo chega a esse Final. A resposta do editar_projeto traz só o que o lote mudou: os grupos novos ou alterados com só os blocos novos ou alterados (os que só andaram vêm em andaram, uma faixa de..ate por deslocamento; sem blocos, o grupo só mudou de nome ou de duração), as ligações e os Finais novos ou alterados, os removidos, gruposComIdNovo [{de, para}] quando o grupo só trocou de id (o primeiro bloco saiu), os avisos novos ou que mudaram de valor e os resolvidos; avisosPendentes conta os que restam. O ver_cena monta a cena no servidor na primeira vez (segundos a uns minutos, conforme as animações): a resposta diz montando, com feitos de total; chame de novo com uns 20 s entre as chamadas. O que é montado serve para a exportação depois; mudou a cena, monta de novo. Exportar: cada animação e cada cena levam de segundos a uns 2 min; acompanhe com acompanhar_exportacao, com uns 20 s entre as chamadas, e não comece outra da mesma versão enquanto esta anda. Pronta, cada versão traz baixar, um link que funciona sem token por 1 hora (baixarAte; perguntar de novo renova), para baixar no terminal (curl -L -o "<arquivo>" "<baixar>") ou passar à pessoa; com mais de uma versão, baixarZip traz todas. som é só o som da versão em MP3: serve de audio no gerar_video, para o avatar falar a fala montada no canvas; baixarSom é o link sem token dele.`,
  animacoes: `Animação em código: adicionar {html, duracao} guarda o código no projeto, a prévia do canvas roda e a exportação faz o vídeo; renderizar_html só quando precisar do arquivo WebM (depois, adicionar {arquivo, dur, sobre, em}). ${RENDER} Reuso: antes de criar, procure com listar_animacoes uma já feita no mesmo projeto ou nos projetos do mesmo avatar. Se uma se encaixa bem, parta dela sem perguntar, com adicionar {animacao}: troque os parametros, ajuste com editarCodigo, acrescente o que faltar. Se o pedido é muito diferente e nada do projeto ou do avatar se encaixa, pergunte à pessoa antes: criar uma nova ou partir de uma animação de outro projeto (de outro avatar, que pode ser outra marca sem relação com este). Leve na pergunta a sua análise de custo e benefício e uma recomendação: reaproveitar o código com mudanças profundas também vale. O trabalho de cada agente fica para o próximo. ${GERAL_REGRAS.slice(GERAL_REGRAS.indexOf("parametros:"))} Inspeção: inspecionar_animacao abre o código no navegador do render, sem fazer vídeo, e mede cada instante; barato, em texto. Volta problemas [{tipo, alvo, t, detalhe}] (quebrou, palavra_partida, fora_da_tela, cortado_pelo_pai, texto_cortado, texto_sobre_texto, fonte, erro_de_script, passa_do_bloco, parametro_sem_valor); instantes com os elementos visíveis no primeiro ("seletor x,y LxA op0.5 2linhas \\"texto\\"", em px do Final) e depois só o que mudou e o que saiu; linhaDoTempo com cada tween ("início-fim alvo propriedades"); duracao do bloco e da animação. Os tempos são os da página, já com a escala (a animação que esticou com a fala mostra os tempos esticados). Para conferir as linhas de um texto, marque-o com data-linhas="1" (ou o número que cabe). Peça quadros: true só se o texto não bastar.`,
  legenda: `legendar faz a legenda palavra a palavra de um grupo, pronta: as palavras vêm da transcrição dos blocos que falam, já no tempo do grupo (corte e velocidade valem), e entram no projeto como uma animação em código por cima do grupo, que a prévia mostra e a exportação renderiza. Responde como o editar_projeto, com a revisão nova, o id em criados e as palavras e trechos em legenda. Faça depois dos cortes; se o grupo mudar, chame de novo com bloco: o id da legenda, e o código e o tempo dela são trocados, sem pôr outra. Use simular: true para ver palavras e trechos sem mexer no projeto; corrija a grafia (a da tela é o português correto) e mande as palavras de volta em palavras ([{palavra, inicio, fim}], em segundos do grupo). Padrão do caso aprovado: Inter Black de 44 px, maiúsculas, palavra dita em verde, no máximo duas linhas, a 80% da altura. estilo muda {fonte, tamanho (numa tela de 720 de largura), cor, destaque, maiusculas, altura (0 topo a 1 base)}; fontes: ${FONTES.join(", ")}. Onde já houver texto na tela, a legenda não se repete: passe o intervalo em semTexto ([[de, ate]], segundos do grupo). fontes: os ids dos blocos que falam; sem isso, os de vídeo da sequência com som. Até 60 s por grupo. O tamanho da letra segue o Final (final, ou o primeiro): mudou o formato, legende de novo.`,
  gerar: `Gerar vídeo, imagem e áudio gasta créditos e não tem modelo padrão: veja em listar_modelos quando usar cada um, os campos que aceita (e o que cada um é nele), os obrigatórios, as durações, resoluções e formatos e o preço, e escolha o modelo com a pessoa. Dois passos em todo gerar_*: sem confirmacao, a chamada só simula (confere o pedido e devolve o custo estimado e o código de confirmacao, sem gastar); mostre à pessoa o modelo, o pedido (texto, voz, duração, formato) e o custo e, só com o sim dela, chame de novo com os mesmos campos e a confirmacao. O código gera uma vez só e vale por 20 min: para gerar de novo, depois do prazo ou com o pedido mudado, simule e pergunte outra vez. Vozes: listar_vozes com o mesmo modelo (as prontas, português primeiro, e as clonadas da conta, com a voz de cada avatar que tem gravação, onde o modelo clona); uma clonada com clonarNoPrimeiroUso ainda será clonada, e o pedido leva consentimento: true, quando a pessoa confirmou que a voz é dela ou que tem autorização. Vídeo: leva minutos; acompanhe com acompanhar_video (de novo em uns 30 s enquanto estiver gerando) e, pronto, ponha no projeto com adicionar {video} ou trocar. foto é o src da imagem do primeiro quadro: a foto de um ativo de listar_avatares, um arquivo do projeto ou uma imagem gerada ("/videos/<id>.png"); referencias são src de imagens que guiam a cena, sem virar quadro, e não vão com foto nem ultimoQuadro; audio é o src de um áudio (mp3 ou wav) que é a fala: um de gerar_audio ou o som de uma exportação deste projeto. Imagem: volta para você olhar antes de usar e entra com adicionar {imagem: id} (ou trocar); se não ficou boa, refaça com outra descrição ou com ela mesma em referencias (na ordem, imagem 1, imagem 2...: diga na descrição o que vem de cada uma). Áudio: sai na hora; as emoções do texto estão no campo texto do modelo, em listar_modelos; entra no projeto com adicionar {audio: id} ou vira a fala do gerar_video {audio: src}. Tudo o que é gerado fica também na lista do modelo no site.`,
  arquivos: `listar_arquivos junta o acervo da conta numa lista só, do mais novo ao mais antigo: os vídeos, imagens e áudios que os modelos geraram (fonte gerado, com modelo, a fala ou a descrição e, quando houve, avatar), os ativos dos avatares (fonte avatar) e os arquivos enviados aos projetos (fonte projeto). Cada item traz id, nome, tipo, src (serve nas ferramentas de ver e nos campos de arquivo do gerar_*), usar (o que vai no adicionar ou no trocar para pôr no projeto), pasta {id, nome} quando está numa e, para baixar, arquivo (o nome com a extensão), mime e baixar (o endereço, com o mesmo token). O filtro modelo só traz o que ele gerou; avatar, os ativos dele e o que foi gerado com ele; projeto, os enviados a ele; pasta, os de uma pasta. Pastas: simples, sem pasta dentro de pasta, em três listas: "videos" (os gerados, como na aba Vídeos do site), "projetos" e "avatar" (os ativos de um avatar; pede o avatar). listar_pastas diz as pastas e quantos itens cada uma tem; criar_pasta cria; mover_para_pasta põe itens numa pasta da mesma lista ou, sem pasta, fora de pasta; criar_projeto {pasta} e enviar_ativo {pasta} já criam dentro dela. É a organização da pessoa: respeite as pastas que existem e pergunte antes de reorganizar. Enviar um arquivo: com url (um endereço público), o servidor baixa, em enviar_arquivo (para o projeto) e enviar_ativo (para um avatar). Arquivo que só está no computador: chame sem url e a resposta traz um link de envio e o comando curl: rode no terminal trocando o caminho do arquivo e o tipo; não precisa de token, vale por 30 min e para um arquivo só (se falhar, peça outro link). Sem terminal, passe o comando à pessoa. Tipos: jpeg, png, webp (até 10 MB), mp4, mov, webm, mp3, wav, m4a e ogg (até 50 MB); SVG e HTML não entram. WebM com transparência serve de camada sobre o vídeo. No avatar, uso: "foto" faz da imagem a foto principal e uso: "voz", do áudio a voz para clonagem. Apagar: limpar_arquivos mostra os arquivos do projeto que nenhum bloco usa e só apaga com apagar: true; apagar_projeto mostra o que sairia e devolve um código, e só apaga com ele em confirmacao, depois do sim da pessoa (o código só vale para o projeto como estava: se ele mudou, peça outro) (não tem volta; os vídeos gerados e os ativos dos avatares ficam). Durante uma exportação, os dois recusam.`,
};
for (const c of COMANDO) {
  const tipo = c.tipo.split(" ")[0]!;
  const linha = `${tipo} ${c.assinatura}: ${c.nota ? `${c.nota}. ` : ""}${c.regras}`;
  AJUDA[tipo] = AJUDA[tipo] ? `${AJUDA[tipo]}\n${linha}` : linha;
}
/** Os assuntos que não são um comando só, na ordem em que a ajuda os oferece. */
const ASSUNTOS = ["comandos", "cenas", "animacoes", "legenda", "gerar", "arquivos"];

const texto = (descricao: string) => ({ type: "string", description: descricao });
const inteiro = (descricao: string) => ({ type: "integer", description: descricao });
const numeros = (descricao: string) => ({ type: "array", items: { type: "number" }, description: descricao });
const textos = (descricao: string) => ({ type: "array", items: { type: "string" }, description: descricao });
const objeto = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const projeto = texto("Id do projeto.");
const src = texto("src de um arquivo (de listar_arquivos, listar_avatares ou ver_projeto) ou o href de uma exportação.");
const final = texto("Id do Final que dá o tamanho; sem isso, o primeiro.");

/** Os dois passos de toda ferramenta que gasta créditos: simular, perguntar à pessoa, gerar. */
const DOIS_PASSOS = "Gasta créditos. Dois passos: sem confirmacao, só simula e devolve o custo e o código; com o sim da pessoa, repita com os mesmos campos e a confirmacao.";
const MODELO = (tipo: string) => texto(`Id de listar_modelos {tipo: "${tipo}"}, escolhido com a pessoa.`);
const CONFIRMACAO = texto("O código da simulação, depois do sim da pessoa.");
const CONSENTIMENTO = { type: "boolean", description: "true quando a pessoa confirmou que a voz é dela ou autorizada (voz de avatar no primeiro uso)." };
const DE = texto('A lista: "videos" (os gerados), "projetos" ou "avatar" (os ativos de um avatar).');

const FERRAMENTAS = [
  {
    name: "ajuda",
    description: `As regras e os casos de um assunto, que não vão nas descrições para poupar contexto. Leia antes de usar o assunto pela primeira vez na conversa. Assuntos: ${ASSUNTOS.join(", ")}, ou o nome de um comando do editar_projeto.`,
    inputSchema: objeto({ assunto: texto(`Um de: ${ASSUNTOS.join(", ")}; ou um comando, como "trocar".`) }, ["assunto"]),
  },
  {
    name: "listar_arquivos",
    description: "Os arquivos da conta numa lista só, do mais novo ao mais antigo, 20 por vez: gerados pelos modelos, ativos dos avatares e enviados aos projetos. Cada item traz tipo, fonte, de quem é, a pasta, src, usar (o que vai no adicionar) e baixar.",
    inputSchema: objeto({
      tipo: texto('"video", "imagem" ou "audio".'),
      fonte: texto('"gerado", "avatar" ou "projeto".'),
      modelo: texto("Id do modelo: só o que ele gerou."),
      avatar: texto("Id do avatar: os ativos dele e o gerado com ele."),
      projeto: texto("Id do projeto: os enviados a ele."),
      pasta: texto("Id de uma pasta (listar_pastas): só os dela."),
      busca: texto("Parte do nome, da fala ou da descrição."),
      desde: texto('Data, como "2026-11-02" (UTC).'),
      ate: texto("Data: até o fim desse dia."),
      limite: inteiro("De 1 a 100; sem isso, 20."),
      continuar: texto("O continuar da resposta anterior."),
    }),
  },
  { name: "listar_avatares", description: "Avatares da conta com os ativos (fotos, vídeos e áudios) e as pastas; o id de um ativo entra num projeto com adicionar {ativo}.", inputSchema: objeto({ busca: texto("Parte do nome.") }) },
  {
    name: "criar_avatar",
    description: "Cria um avatar (um personagem ou uma pessoa); os arquivos entram depois com enviar_ativo. Antes, veja em listar_avatares se ele já existe.",
    inputSchema: objeto({ nome: texto("Até 120 caracteres."), descricao: texto("Quem é, até 500 caracteres.") }, ["nome"]),
  },
  {
    name: "editar_avatar",
    description: 'Muda o nome, a descrição ou qual ativo enviado é a foto principal ou a voz para clonagem; "" tira. O que não vier fica como está.',
    inputSchema: objeto({ avatar: texto("Id do avatar."), nome: texto("Nome novo."), descricao: texto("Descrição nova."), foto: texto("Id de uma imagem enviada ao avatar."), voz: texto("Id de um áudio enviado ao avatar.") }, ["avatar"]),
  },
  {
    name: "enviar_ativo",
    description: "Põe um arquivo (imagem, vídeo ou áudio) nos ativos de um avatar. Com url (pública), o site baixa. Sem url, vem um link de envio e o comando curl para mandar o arquivo do computador, sem token (30 min, um arquivo).",
    inputSchema: objeto(
      {
        avatar: texto("Id do avatar."),
        url: texto("Endereço público (https) do arquivo."),
        nome: texto("Nome do ativo na tela."),
        uso: texto('"foto" (vira a foto principal) ou "voz" (vira a voz para clonagem).'),
        tipo: texto('Tipo do arquivo, como "audio/mpeg".'),
        pasta: texto("Id de uma pasta do avatar (listar_pastas)."),
      },
      ["avatar"],
    ),
  },
  {
    name: "listar_vozes",
    description: "Vozes de um modelo que fala: as prontas e as clonadas da conta. O id vai em voz, no gerar_video ou no gerar_audio com o mesmo modelo.",
    inputSchema: objeto({ modelo: texto("Id do modelo, de listar_modelos."), busca: texto("Parte do nome."), idioma: texto('Parte do idioma, como "Português".'), genero: texto('"feminina" ou "masculina".'), limite: inteiro("Quantas prontas, de 1 a 100; sem isso, 30.") }, ["modelo"]),
  },
  {
    name: "listar_animacoes",
    description: "Animações em código já feitas nos projetos da conta, para reusar com adicionar {animacao: {projeto, bloco}}. Sem o código (leia com ver_projeto incluir: codigo).",
    inputSchema: objeto({ projeto: texto("Só as deste projeto."), avatar: texto("Só as dos projetos que usam este avatar."), busca: texto("Parte do nome, do texto na tela ou de um parâmetro."), limite: inteiro("De 1 a 100; sem isso, 20.") }),
  },
  { name: "listar_projetos", description: "Projetos da conta, o editado por último primeiro, com a pasta de cada um.", inputSchema: objeto({ busca: texto("Parte do nome."), pasta: texto("Id de uma pasta de projetos: só os dela.") }) },
  { name: "criar_projeto", description: "Cria um projeto vazio.", inputSchema: objeto({ nome: texto("Nome do projeto."), pasta: texto("Id de uma pasta de projetos (listar_pastas).") }, ["nome"]) },
  {
    name: "apagar_projeto",
    description: "Apaga um projeto, com os arquivos enviados a ele e as exportações (os vídeos gerados e os ativos ficam). Não tem volta. Dois passos: sem confirmacao, só mostra o que sairia e devolve o código; mostre à pessoa e só com o sim dela chame de novo com a confirmacao.",
    inputSchema: objeto({ projeto, confirmacao: texto("O código do primeiro passo, depois do sim da pessoa.") }, ["projeto"]),
  },
  {
    name: "listar_pastas",
    description: "As pastas da conta, com quantos itens cada uma tem: dos vídeos gerados, dos projetos e dos ativos de cada avatar.",
    inputSchema: objeto({ de: DE, avatar: texto("Id do avatar: só as pastas dele.") }),
  },
  {
    name: "criar_pasta",
    description: "Cria uma pasta numa lista (sem pasta dentro de pasta).",
    inputSchema: objeto({ de: DE, nome: texto("Nome da pasta."), avatar: texto('Id do avatar, com de: "avatar".') }, ["de", "nome"]),
  },
  {
    name: "mover_para_pasta",
    description: "Põe itens numa pasta da lista deles ou, sem pasta, fora de pasta. Não apaga nem copia nada.",
    inputSchema: objeto({ de: DE, itens: textos("Ids dos vídeos gerados, dos projetos ou dos ativos, até 100."), pasta: texto("Id da pasta; sem isso, fora de pasta."), avatar: texto('Id do avatar, com de: "avatar".') }, ["de", "itens"]),
  },
  {
    name: "ver_projeto",
    description: "Revisão, grupos com os blocos (tipo, camada, início e fim no grupo; corte [início, fim] do arquivo, velocidade, volume e mudo só quando fogem do padrão), ligações, Finais com as variações, avisos e as notas da pessoa. Os arquivos, o código das animações e o canvas inteiro são grandes: peça em incluir só quando precisar.",
    inputSchema: objeto({ projeto, incluir: { type: "array", items: { type: "string", enum: ["arquivos", "codigo", "canvas"] }, description: "arquivos: os do projeto; codigo: o HTML de cada animação; canvas: o modelo inteiro." } }, ["projeto"]),
  },
  {
    name: "editar_projeto",
    description: "Aplica um lote de comandos sobre uma revisão; a tela de quem está com o projeto aberto acompanha. A resposta traz a revisão nova, os ids criados e, em mudou, só o que o lote mexeu, com os avisos novos.",
    inputSchema: objeto({ projeto, revisao: inteiro("A revisão lida em ver_projeto."), comandos: { type: "array", items: { type: "object" }, description: COMANDOS } }, ["projeto", "revisao", "comandos"]),
  },
  { name: "ver_quadros", description: "Mostra até 12 instantes de um arquivo, lado a lado, para ver o vídeo.", inputSchema: objeto({ projeto, src, instantes: numeros("Segundos do arquivo.") }, ["projeto", "src", "instantes"]) },
  {
    name: "ver_cena",
    description: "Mostra até 12 instantes de uma cena (grupo) montada como na exportação, com todas as camadas, sem exportar. Na primeira vez responde montando: chame de novo em uns 20 s.",
    inputSchema: objeto({ projeto, grupo: texto("Id do grupo (ou de um bloco dele)."), instantes: numeros("Segundos do grupo."), final }, ["projeto", "grupo", "instantes"]),
  },
  {
    name: "inspecionar_animacao",
    description: "Abre o código de uma animação no navegador do render, sem fazer vídeo, e responde em texto: problemas (texto que quebrou, cortado, fora da tela, fonte, erro de script), o que está visível em cada instante e a linha do tempo.",
    inputSchema: objeto({ projeto, bloco: texto("Id do bloco de animação."), instantes: numeros("Até 12 segundos do bloco; sem isso, o começo, os quartos e o fim."), quadros: { type: "boolean", description: "Traz também a imagem (custa mais); só se o texto não bastar." }, final }, ["projeto", "bloco"]),
  },
  { name: "ver_transcricao", description: "A fala de um arquivo com o tempo de cada palavra, para editar pelo texto (removerTrechos). Os tempos são aproximados: confira as bordas com ver_silencios.", inputSchema: objeto({ projeto, src }, ["projeto", "src"]) },
  { name: "ver_silencios", description: "Duração e silêncios de um arquivo; som: false quando ele não tem áudio.", inputSchema: objeto({ projeto, src }, ["projeto", "src"]) },
  {
    name: "enviar_arquivo",
    description: "Guarda um arquivo (imagem, vídeo ou áudio) no projeto; depois, adicionar {arquivo: id}. Com url, o servidor baixa. Sem url nem base64, vem um link de envio e o comando curl para mandar o arquivo do computador, sem token (30 min, um arquivo).",
    inputSchema: objeto({ projeto, url: texto("Endereço público do arquivo."), nome: texto("Nome do arquivo."), tipo: texto('Tipo, como "image/png".'), base64: texto("O conteúdo em base64 (até 10 MB), se não houver url nem terminal.") }, ["projeto"]),
  },
  { name: "listar_modelos", description: "Os modelos que geram vídeo, imagem e áudio: quando usar cada um, os campos que aceita, as opções e o preço. Leia antes de gerar e escolha com a pessoa: não há modelo padrão.", inputSchema: objeto({ tipo: texto('"video", "imagem" ou "audio"; sem isso, todos.') }) },
  {
    name: "gerar_video",
    description: `Gera um vídeo com o modelo escolhido; leva minutos (acompanhar_video). ${DOIS_PASSOS} Os campos que o modelo aceita estão em listar_modelos.`,
    inputSchema: objeto(
      {
        modelo: MODELO("video"),
        projeto,
        cena: texto("A cena, o movimento ou os gestos."),
        fala: texto("O que a pessoa fala."),
        voz: texto("Id de listar_vozes com o mesmo modelo."),
        idioma: texto('"pt-BR", "en-US" ou "es".'),
        estilo: texto("Estilo do prompt pronto, nos modelos que têm."),
        foto: texto("src da imagem do primeiro quadro."),
        ultimoQuadro: texto("src da imagem do último quadro."),
        referencias: textos("src de imagens que guiam a cena; não vão com foto nem ultimoQuadro."),
        audio: texto("src de um áudio que é a fala."),
        som: { type: "boolean", description: "false para sair sem som." },
        semente: inteiro("Para repetir um resultado parecido."),
        expressividade: texto('"low", "medium" ou "high".'),
        consentimento: CONSENTIMENTO,
        duracao: inteiro("Segundos, um dos aceitos pelo modelo."),
        resolucao: texto("Uma das resoluções do modelo."),
        formato: texto("Um dos formatos do modelo; sem isso, o do Final."),
        final: texto("Id do Final cujo formato vale; sem isso, o primeiro."),
        confirmacao: CONFIRMACAO,
      },
      ["modelo", "projeto"],
    ),
  },
  {
    name: "gerar_imagem",
    description: `Gera uma imagem e a devolve para você conferir; entra no projeto com adicionar {imagem: id}. ${DOIS_PASSOS}`,
    inputSchema: objeto(
      {
        modelo: MODELO("imagem"),
        projeto,
        descricao: texto("A cena: quem aparece, onde, a luz e o enquadramento."),
        referencias: textos("src de imagens, na ordem (imagem 1, imagem 2...); diga na descrição o que vem de cada uma."),
        resolucao: texto("Uma das resoluções do modelo."),
        formato: texto("Um dos formatos do modelo; sem isso, o do Final."),
        final: texto("Id do Final cujo formato vale; sem isso, o primeiro."),
        confirmacao: CONFIRMACAO,
      },
      ["modelo", "projeto", "descricao"],
    ),
  },
  {
    name: "gerar_audio",
    description: `Gera uma fala (MP3), na hora; entra no projeto com adicionar {audio: id} ou vira a fala do gerar_video {audio: src}. ${DOIS_PASSOS}`,
    inputSchema: objeto({ modelo: MODELO("audio"), texto: texto("O que a voz lê; as emoções aceitas estão no campo texto do modelo, em listar_modelos."), voz: texto("Id de listar_vozes com o mesmo modelo."), consentimento: CONSENTIMENTO, confirmacao: CONFIRMACAO }, ["modelo", "texto", "voz"]),
  },
  { name: "acompanhar_video", description: "O andamento de um vídeo do gerar_video: gerando (chame de novo em uns 30 s), pronto (com o src e o usar do adicionar) ou falhou.", inputSchema: objeto({ video: texto("Id do vídeo.") }, ["video"]) },
  {
    name: "renderizar_html",
    description: 'Faz um vídeo transparente (WebM) de um HTML e o guarda no projeto. Só quando precisar do arquivo: para pôr uma animação no projeto, use adicionar {html, duracao}. As regras do HTML: ajuda {assunto: "animacoes"}.',
    inputSchema: objeto({ projeto, nome: texto('Nome do arquivo, como "legenda.webm".'), html: texto("Só o conteúdo: elementos, <style> e <script>."), duracao: { type: "number", description: "Segundos, até 60." }, final }, ["projeto", "html", "duracao"]),
  },
  {
    name: "legendar",
    description: 'Legenda palavra a palavra de um grupo, pela transcrição, como uma animação por cima dele. Faça depois dos cortes; se o grupo mudar, chame de novo com bloco. O estilo e a correção da grafia: ajuda {assunto: "legenda"}.',
    inputSchema: objeto(
      {
        projeto,
        grupo: texto("Id do grupo."),
        revisao: inteiro("A revisão lida em ver_projeto; obrigatória sem simular."),
        bloco: texto("Id de uma legenda que já existe, para trocá-la."),
        nome: texto('Nome do bloco; sem isso, "Legenda".'),
        simular: { type: "boolean", description: "Só devolve palavras e trechos, sem mexer no projeto." },
        palavras: { type: "array", items: { type: "object" }, description: "[{palavra, inicio, fim}], como simular devolve." },
        semTexto: { type: "array", items: { type: "array", items: { type: "number" } }, description: "[[de, ate]] em segundos do grupo onde já há texto na tela." },
        fontes: textos("Ids dos blocos que falam."),
        estilo: { type: "object", description: "{fonte, tamanho, cor, destaque, maiusculas, altura}." },
        final,
      },
      ["projeto", "grupo"],
    ),
  },
  { name: "limpar_arquivos", description: "Os arquivos do projeto que nenhum bloco usa, com o tamanho. Só apaga com apagar: true, depois de conferir a lista.", inputSchema: objeto({ projeto, apagar: { type: "boolean", description: "Apaga de vez os da lista." } }, ["projeto"]) },
  { name: "exportar", description: "Começa a exportação de um Final; ela anda sozinha no servidor. Acompanhe com acompanhar_exportacao, com uns 20 s entre as chamadas.", inputSchema: objeto({ projeto, final: texto("Id do Final."), versoes: { type: "array", items: { type: "integer" }, description: "Posições das variações; sem isso, todas." } }, ["projeto", "final"]) },
  { name: "acompanhar_exportacao", description: "O andamento da exportação. Pronta, cada versão traz baixar (link sem token, 1 hora), href (serve de src nas ferramentas de ver) e som (o MP3 dela, que serve de audio no gerar_video).", inputSchema: objeto({ projeto, exportacao: texto("Id da exportação.") }, ["projeto", "exportacao"]) },
  {
    name: "listar_ferramentas",
    description: "As ferramentas do servidor agora, inclusive as publicadas depois que você conectou. Com nome, a descrição inteira e os parâmetros. Chame a que não estiver na sua lista com usar_ferramenta.",
    inputSchema: objeto({ nome: texto("Nome de uma ferramenta."), busca: texto("Parte do nome ou da descrição.") }),
  },
  {
    name: "usar_ferramenta",
    description: "Chama qualquer ferramenta do servidor pelo nome: serve para as que não estão na sua lista. A resposta, as regras e o custo são os da própria ferramenta.",
    inputSchema: objeto({ nome: texto("Nome da ferramenta."), argumentos: { type: "object", description: "Os argumentos dela." } }, ["nome"]),
  },
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
    case "listar_arquivos":
      return chama("GET", `/api/v1/arquivos?${new URLSearchParams(Object.entries({ tipo: a.tipo, fonte: a.fonte, modelo: a.modelo, avatar: a.avatar, projeto: a.projeto, pasta: a.pasta, q: a.busca, desde: a.desde, ate: a.ate, limite: a.limite, continuar: a.continuar }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "listar_avatares":
      return chama("GET", `/api/v1/avatares?q=${seguro(a.busca ?? "")}`);
    case "criar_avatar":
      return chama("POST", "/api/v1/avatares", json({ nome: a.nome, descricao: a.descricao }));
    case "editar_avatar":
      return chama("POST", `/api/v1/avatares/${seguro(a.avatar)}`, json({ nome: a.nome, descricao: a.descricao, foto: a.foto, voz: a.voz }));
    case "enviar_ativo": {
      const destino = `/api/v1/avatares/${seguro(a.avatar)}`;
      if (typeof a.url === "string" && a.url) return baixar(a, chama, `${destino}/arquivos?uso=${seguro(a.uso ?? "")}&pasta=${seguro(a.pasta ?? "")}`);
      return chama("POST", `${destino}/envio`, json({ nome: a.nome, uso: a.uso, tipo: a.tipo, pasta: a.pasta }));
    }
    case "listar_animacoes":
      return chama("GET", `/api/v1/animacoes?${new URLSearchParams(Object.entries({ projeto: a.projeto, avatar: a.avatar, q: a.busca, limite: a.limite }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "listar_projetos":
      return chama("GET", `/api/v1/projetos?q=${seguro(a.busca ?? "")}&pasta=${seguro(a.pasta ?? "")}`);
    case "criar_projeto":
      return chama("POST", "/api/v1/projetos", json({ nome: a.nome, pasta: a.pasta }));
    case "apagar_projeto":
      return chama("POST", `${p}/apagar`, json({ confirmacao: a.confirmacao }));
    case "listar_pastas":
      return chama("GET", `/api/v1/pastas?de=${seguro(a.de ?? "")}&avatar=${seguro(a.avatar ?? "")}`);
    case "criar_pasta":
      return chama("POST", "/api/v1/pastas", json({ de: a.de, nome: a.nome, avatar: a.avatar }));
    case "mover_para_pasta":
      return chama("POST", "/api/v1/pastas/mover", json({ de: a.de, itens: a.itens, pasta: a.pasta, avatar: a.avatar }));
    case "ver_projeto":
      return chama("GET", `${p}?incluir=${seguro(Array.isArray(a.incluir) ? a.incluir.join(",") : "")}`);
    case "editar_projeto":
      return chama("POST", `${p}/comandos`, json({ revisao: a.revisao, comandos: a.comandos }));
    case "ver_quadros":
      return chama("GET", `${p}/quadros?src=${seguro(a.src)}&instantes=${seguro(Array.isArray(a.instantes) ? a.instantes.join(",") : "")}`);
    case "ver_cena":
      return chama("GET", `${p}/cena?${new URLSearchParams(Object.entries({ grupo: a.grupo, instantes: Array.isArray(a.instantes) ? a.instantes.join(",") : undefined, final: a.final }).filter(([, v]) => typeof v === "string" && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "inspecionar_animacao":
      return chama("GET", `${p}/animacao?${new URLSearchParams(Object.entries({ bloco: a.bloco, instantes: Array.isArray(a.instantes) ? a.instantes.join(",") : undefined, quadros: a.quadros === true ? "1" : undefined, final: a.final }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "ver_transcricao":
      return chama("GET", `${p}/transcricao?src=${seguro(a.src)}`);
    case "ver_silencios":
      return chama("GET", `${p}/silencios?src=${seguro(a.src)}`);
    case "gerar_imagem":
      return chama("POST", `${p}/imagem`, json({ ...semProjeto(a), previa: true }));
    case "listar_vozes":
      return chama("GET", `/api/v1/vozes?${new URLSearchParams(Object.entries({ modelo: a.modelo, q: a.busca, idioma: a.idioma, genero: a.genero, limite: a.limite }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`);
    case "gerar_video":
      return chama("POST", `${p}/video`, json(semProjeto(a)));
    case "gerar_audio":
      return chama("POST", "/api/v1/audios", json(a));
    case "listar_modelos":
      return chama("GET", `/api/v1/modelos${typeof a.tipo === "string" && a.tipo ? `?tipo=${seguro(a.tipo)}` : ""}`);
    case "acompanhar_video":
      return chama("GET", `/api/v1/videos/${seguro(a.video)}`);
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
      // Sem url nem base64: o link de envio, para o arquivo que só está no computador (um curl, sem token).
      if (!conteudo) return chama("POST", `${p}/envio`, json({ nome: a.nome, tipo: a.tipo }));
      if (conteudo.length > MAX_BASE64) return Promise.resolve(Response.json({ erro: "arquivo_grande_demais" }, { status: 413 }));
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(conteudo), (c) => c.charCodeAt(0));
      } catch {
        return Promise.resolve(Response.json({ erro: "base64_invalido" }, { status: 400 }));
      }
      return chama("POST", `${site}/arquivos`, bytes, { "content-type": typeof a.tipo === "string" ? a.tipo : "", "x-nome": seguro(typeof a.nome === "string" && a.nome ? a.nome : "arquivo") });
    }
    default:
      return null;
  }
}

/** Os campos do gerar_* sem o projeto, que vai no caminho; o resto passa como veio. */
function semProjeto(a: Args): Args {
  const { projeto: _projeto, ...resto } = a;
  return resto;
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

/** A primeira frase de uma descrição: a lista de listar_ferramentas fica curta. */
const primeiraFrase = (d: string) => (/^[\s\S]*?[.:](?=\s|$)/.exec(d)?.[0] ?? d).slice(0, 240);

/**
 * listar_ferramentas: a lista de agora. O Claude Code guarda a lista da hora em que conectou e não
 * relê no meio da conversa (visto em 08/11/2026, mesmo com a validade de 5 min, CACHE); com esta e
 * usar_ferramenta, a ferramenta publicada depois chega a quem já está conectado.
 */
function listarFerramentas(a: Args): Record<string, unknown> {
  const todas = FERRAMENTAS.filter((f) => f.name !== "listar_ferramentas" && f.name !== "usar_ferramenta");
  if (typeof a.nome === "string" && a.nome) {
    const f = todas.find((x) => x.name === a.nome);
    if (!f) return { content: [{ type: "text", text: json({ erro: "ferramenta_inexistente", ferramentas: todas.map((x) => x.name) }) }], isError: true };
    return { content: [{ type: "text", text: json({ nome: f.name, descricao: f.description, parametros: f.inputSchema }) }] };
  }
  const busca = typeof a.busca === "string" ? a.busca.toLowerCase() : "";
  const lista = todas.filter((f) => !busca || `${f.name} ${f.description}`.toLowerCase().includes(busca)).map((f) => ({ nome: f.name, descricao: primeiraFrase(f.description) }));
  return { content: [{ type: "text", text: json({ versao: SERVIDOR.version, ferramentas: lista }) }] };
}

/** ajuda: as regras de um assunto (ou de um comando), que não vão nas descrições para não pesar em toda conversa. */
function ajuda(a: Args): Record<string, unknown> {
  const assunto = typeof a.assunto === "string" ? a.assunto.trim() : "";
  const achado = Object.keys(AJUDA).find((k) => k.toLowerCase() === assunto.toLowerCase());
  if (!achado) return { content: [{ type: "text", text: json({ erro: "assunto_inexistente", assuntos: ASSUNTOS, comandos: Object.keys(AJUDA).filter((k) => !ASSUNTOS.includes(k)) }) }], isError: true };
  return { content: [{ type: "text", text: AJUDA[achado]! }] };
}

async function chamar(params: Args, chama: Interna): Promise<Resposta> {
  const args = (params.arguments ?? {}) as Args;
  if (params.name === "ajuda") return { result: ajuda(args) };
  if (params.name === "listar_ferramentas") return { result: listarFerramentas(args) };
  if (params.name === "usar_ferramenta") {
    const nome = typeof args.nome === "string" ? args.nome : "";
    // Uma ferramenta de verdade, não ela mesma: sem volta infinita.
    if (nome === "usar_ferramenta" || !FERRAMENTAS.some((f) => f.name === nome)) {
      return { result: { content: [{ type: "text", text: json({ erro: "ferramenta_inexistente", ferramentas: FERRAMENTAS.map((f) => f.name).filter((n) => n !== "usar_ferramenta") }) }], isError: true } };
    }
    const argumentos = args.argumentos && typeof args.argumentos === "object" && !Array.isArray(args.argumentos) ? args.argumentos : {};
    return chamar({ name: nome, arguments: argumentos }, chama);
  }
  const res = pedido(String(params.name), args, chama);
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
