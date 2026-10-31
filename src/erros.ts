/**
 * Todas as frases de erro que aparecem na tela. Nenhuma frase de erro fica
 * escrita fora daqui: os testes (test/erros.test.ts) conferem o molde e
 * procuram frase solta no resto do código.
 *
 * Dois moldes:
 * - erro(o que houve, o que fazer): falhas e bloqueios, sempre duas frases.
 *     erro("Não foi possível editar o vídeo.", "Toque em Gerar editado para tentar de novo.")
 *     erro("Prévia indisponível.", "Toque em Gerar editado para criar o vídeo mesmo assim.")
 *     erro("Este vídeo já está sendo editado.", "Aguarde terminar.")
 * - campo(o que fazer): dado do formulário faltando ou errado, uma frase só.
 *     campo("Escreva a fala do vídeo.")
 *
 * Regras de cada frase:
 * - Termina em ponto e tem até 10 palavras; sem "!" e sem "Erro:".
 * - "O que houve" diz o efeito para quem usa: "Não foi possível…", "… indisponível.",
 *   "Este/Esta … já…". Nunca a causa técnica (contêiner, servidor, HTTP, nome de
 *   modelo, mensagem crua): ela vai para o log com console.error.
 * - "O que fazer" é uma ação, com o nome do botão quando houver ("Toque em Refazer…");
 *   sem ação possível, "Tente mais tarde." ou "Aguarde terminar.".
 * - Não repete o nome da função nem culpa a pessoa. O mesmo erro tem a mesma frase
 *   em toda tela: reaproveite a chave em vez de escrever outra.
 *
 * Erro novo: crie a chave aqui e use ERROS.<chave> (em InputError, ForbiddenError,
 * no HTML ou no script da página, pelo config).
 */

/** As partes de cada frase, para os testes conferirem o molde. */
export const PARTES = new Map<string, readonly string[]>();

/** Falha ou bloqueio: o que houve e o que fazer, nessa ordem. */
export function erro(houve: string, fazer: string): string {
  const texto = `${houve} ${fazer}`;
  PARTES.set(texto, [houve, fazer]);
  return texto;
}

/** Dado do formulário: só o que fazer. */
export function campo(fazer: string): string {
  PARTES.set(fazer, [fazer]);
  return fazer;
}

export const ERROS = {
  // Contas
  loginIncorreto: erro("E-mail ou senha incorretos.", "Confira e tente de novo."),
  contaBloqueada: (ate: string) => erro("Conta bloqueada por muitas tentativas.", `Tente de novo após ${ate}.`),
  cadastroFechado: erro("Cadastro fechado.", "Peça um convite ao administrador."),
  semAcessoVideo: erro("Você não tem acesso a este vídeo.", "Peça acesso ao administrador."),
  semAcessoModelo: erro("Você não tem acesso a este modelo.", "Peça acesso ao administrador."),
  nome: campo("Escreva o nome."),
  email: campo("Escreva um e-mail válido."),
  senha: (min: number, max: number) => campo(`Use uma senha de ${min} a ${max} caracteres.`),
  senhasDiferentes: campo("Repita a mesma senha."),

  // Criação do vídeo
  opcoesIndisponiveis: erro("Opções do modelo indisponíveis.", "Atualize a página em instantes."),
  criacaoPausada: erro("Criação de vídeos pausada.", "Tente mais tarde."),
  criacaoPausadaAviso: erro("Criação de vídeos pausada.", "Seus vídeos continuam aqui."),
  ajustesNaoAceitos: erro("Este modelo não aceita esses ajustes.", "Mude os ajustes e gere de novo."),
  videoFalhou: erro("Não foi possível gerar o vídeo.", "Toque em Refazer para tentar de novo."),
  fala: campo("Escreva a fala do vídeo."),
  falaLonga: (max: number) => campo(`Encurte a fala para até ${max} caracteres.`),
  movimentoLongo: (max: number) => campo(`Encurte o movimento para até ${max} caracteres.`),
  instrucoesLongas: (max: number) => campo(`Encurte as instruções para até ${max} caracteres.`),
  foto: campo("Escolha a foto do avatar."),
  fotoTipo: campo("Use uma foto JPG, PNG ou WebP."),
  fotoTamanho: campo("Use uma foto de até 10 MB."),
  uso: campo("Escolha um uso da lista."),
  videoOrigem: campo("Escolha o vídeo de origem."),
  videoTipo: campo("Use um vídeo MP4 ou MOV."),
  videoTamanho: (max: number) => campo(`Use um vídeo de até ${max} MB.`),
  videoDuracao: (min: number, max: number) => campo(`Use um vídeo de ${min} a ${max} segundos.`),
  videoLeitura: erro("Não foi possível ler o vídeo.", "Exporte de novo em MP4 e envie."),
  roupa: campo("Escolha de onde vem a roupa."),
  voz: campo("Escolha uma voz da lista."),
  expressividade: campo("Escolha a expressividade."),
  estilo: campo("Escolha um estilo da lista."),
  idioma: campo("Escolha um idioma da lista."),
  fonteVoz: campo("Escolha de onde vem a voz."),
  vozClonada: campo("Escolha uma voz clonada da lista."),
  nomeVoz: campo("Dê um nome para a voz."),
  amostraVoz: campo("Envie uma gravação da voz para clonar."),
  consentimentoVoz: campo("Confirme que pode usar esta voz."),
  audioFala: campo("Envie o áudio da fala."),
  audioTipo: campo("Use um áudio MP3 ou WAV."),
  audioTamanho: (max: number) => campo(`Use um áudio de até ${max} MB.`),
  vozFalhou: erro("Não foi possível clonar a voz.", "Envie outra gravação, mais limpa."),

  // Áudio
  audioFalhou: erro("Não foi possível tratar o áudio.", "O vídeo segue com o áudio original."),
  audioDemorou: erro("O tratamento do áudio demorou demais.", "O vídeo segue com o áudio original."),

  // Edição rápida
  edicaoFalhou: erro("Não foi possível editar o vídeo.", "Toque em Gerar editado para tentar de novo."),
  edicaoDemorou: erro("A edição demorou demais.", "Toque em Gerar editado para tentar de novo."),
  edicaoEmAndamento: erro("Este vídeo já está sendo editado.", "Aguarde terminar."),
  edicaoIndisponivel: erro("Edição indisponível agora.", "Tente mais tarde."),
  trocaIndisponivel: erro("Troca de avatar indisponível agora.", "Tente mais tarde."),
  semEdicaoRapida: erro("Este modelo não tem edição rápida.", "Escolha um vídeo de outro modelo."),
  videoNaoPronto: erro("Este vídeo ainda não está pronto.", "Aguarde terminar."),
  audioEmTratamento: erro("O áudio ainda está sendo tratado.", "Aguarde terminar."),
  ajustesIlegiveis: erro("Não foi possível ler os ajustes.", "Gere a prévia de novo."),
  previaIndisponivel: erro("Prévia indisponível.", "Toque em Gerar editado para criar o vídeo mesmo assim."),
  pausas: campo("Escolha o tamanho das pausas."),
  camera: campo("Escolha a câmera."),

  // Canvas de edição (no navegador, pelo config da página)
  canvasArquivo: erro("Não foi possível abrir o arquivo.", "Use MP4, MOV, JPG, PNG, MP3 ou M4A."),
  canvasVideo: erro("Não foi possível abrir este vídeo.", "Tente de novo em instantes."),
  canvasSalvar: erro("Não foi possível salvar o projeto.", "Confira a conexão e continue editando."),
  canvasEnviar: erro("Não foi possível enviar o arquivo.", "Tente de novo em instantes."),
  canvasArquivoGrande: (max: number) => erro("Este arquivo é grande demais.", `Use um arquivo de até ${max} MB.`),
  projetoNome: campo("Escreva o nome do projeto."),
  exportarSemVersao: erro("Este Final ainda não tem variações.", "Ligue um grupo ao Final."),
  exportarLimite: (max: number) => erro(`Este Final passa de ${max} variações.`, "Exporte uma por vez ou tire ligações."),
  exportarArquivo: erro("Um arquivo do projeto não está disponível.", "Troque o bloco e exporte de novo."),
  exportarFalhou: erro("Não foi possível exportar os vídeos.", "Toque em Exportar para tentar de novo."),
  exportarIndisponivel: erro("Exportação indisponível agora.", "Tente mais tarde."),
  exportarExpirou: erro("Este vídeo não está mais disponível.", "Toque em Exportar para gerar de novo."),

  // Avatares
  avatarNome: campo("Escreva o nome do avatar."),
  avatarSemFoto: erro("Este avatar não tem foto.", "Adicione a foto principal ao avatar."),
  ativoSalvar: erro("Não foi possível salvar no avatar.", "Tente de novo em instantes."),
};
