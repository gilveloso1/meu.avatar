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
const ATUAL = "2026-07-28";
const VERSOES = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const META_VERSAO = "io.modelcontextprotocol/protocolVersion";
const META_CAPACIDADES = "io.modelcontextprotocol/clientCapabilities";
const SERVIDOR = { name: "meu-avatar", version: "1.1.0" };
/** A lista de ferramentas não depende de quem pede. */
const CACHE = { ttlMs: 3_600_000, cacheScope: "public" };
/** O arquivo vai em base64 na mensagem: acima disso, use a rota de arquivos direto. */
const MAX_BASE64 = 14 * 1024 * 1024;

const INSTRUCOES = `Edita vídeos nos projetos do Meu Avatar. Antes de cortar, olhe: use ver_quadros e ver_silencios, e confira as bordas do vídeo de origem. O campo revisao vem de ver_projeto; se editar_projeto devolver conflito, leia o projeto e refaça o lote. Depois de editar, olhe avisos: sem_video_de_base quer dizer que aquele trecho sai sobre fundo preto, salvo se uma cobertura opaca o preencher. Um movimento de câmera na mesma frase é um só: não mude o foco no meio dela. Onde já houver texto na tela, a legenda não se repete. Gerar vídeo não é feito por aqui; exportar usa o contêiner, sem créditos de modelo.`;

const COMANDOS = `Lista de comandos, aplicados em ordem; um erro desfaz o lote inteiro. Cada um tem "tipo":
adicionar {video|arquivo, nome, inicio, fim, semSom, dur (obrigatório em vídeo e áudio de arquivo), depois: bloco | sobre: bloco, em: segundos}
cortar {bloco, inicio, fim}
dividir {bloco, em}
mover {bloco, depois|antes}
velocidade {bloco, velocidade: 0,25 a 4}
removerPausas {bloco?, pausa: curta|media|longa}
enquadrar {bloco, zoom: 1 a 8, focoX, focoY: 0 a 1, rosto: true, chaves: [{t, zoom, focoX, focoY}], encaixe: preencher|caber|desfocar, recorte: {esquerda, topo, direita, base}, espelharH, espelharV, girar: 0|90|180|270, limpar}
ligar {de, para}
remover {ids, fechar}
som {bloco, volume: 0 a 4, mudo}
final {id, resolucao, formato, velocidade}
organizar {}
O primeiro bloco de um projeto vazio já traz o Final "final", ligado a ele. Tempos de inicio, fim e em são do arquivo; t das chaves é do bloco.`;

const texto = (descricao: string) => ({ type: "string", description: descricao });
const objeto = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const projeto = texto("Id do projeto.");
const src = texto('Endereço do arquivo, como "/videos/<id>.mp4", vindo de listar_videos ou ver_projeto.');

const FERRAMENTAS = [
  { name: "listar_videos", description: "Vídeos prontos que podem entrar num projeto, com a fala e a duração.", inputSchema: objeto({ busca: texto("Parte da fala.") }) },
  { name: "listar_projetos", description: "Projetos da conta, o editado por último primeiro.", inputSchema: objeto({ busca: texto("Parte do nome.") }) },
  { name: "criar_projeto", description: "Cria um projeto vazio.", inputSchema: objeto({ nome: texto("Nome do projeto.") }, ["nome"]) },
  { name: "ver_projeto", description: "Revisão, grupos, Finais com as variações, arquivos, avisos e o canvas do projeto.", inputSchema: objeto({ projeto }, ["projeto"]) },
  {
    name: "editar_projeto",
    description: "Aplica um lote de comandos sobre uma revisão. A tela de quem estiver com o projeto aberto acompanha sozinha. A resposta traz o projeto, com os avisos.",
    inputSchema: objeto({ projeto, revisao: { type: "integer", description: "A revisão lida em ver_projeto." }, comandos: { type: "array", items: { type: "object" }, description: COMANDOS } }, ["projeto", "revisao", "comandos"]),
  },
  {
    name: "ver_quadros",
    description: "Mostra até 12 instantes de um arquivo, lado a lado, para ver o vídeo.",
    inputSchema: objeto({ projeto, src, instantes: { type: "array", items: { type: "number" }, description: "Segundos do arquivo." } }, ["projeto", "src", "instantes"]),
  },
  { name: "ver_silencios", description: "Duração e silêncios de um arquivo, com a regra da Edição rápida.", inputSchema: objeto({ projeto, src }, ["projeto", "src"]) },
  {
    name: "enviar_arquivo",
    description: "Guarda um arquivo no projeto (imagem até 10 MB; vídeo e áudio até 50 MB, limitados aqui a 10 MB pelo base64). WebM com transparência serve de camada sobre o vídeo.",
    inputSchema: objeto({ projeto, nome: texto("Nome do arquivo."), tipo: texto('Tipo, como "video/webm" ou "audio/mp4".'), base64: texto("Conteúdo em base64.") }, ["projeto", "nome", "tipo", "base64"]),
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

/** O pedido interno de cada ferramenta. */
function pedido(nome: string, a: Args, chama: Interna): Promise<Response> | null {
  const p = `/api/v1/projetos/${seguro(a.projeto)}`;
  const site = `/projetos/${seguro(a.projeto)}`;
  switch (nome) {
    case "listar_videos":
      return chama("GET", `/api/v1/videos?q=${seguro(a.busca ?? "")}`);
    case "listar_projetos":
      return chama("GET", `/api/v1/projetos?q=${seguro(a.busca ?? "")}`);
    case "criar_projeto":
      return chama("POST", "/api/v1/projetos", json({ nome: a.nome }));
    case "ver_projeto":
      return chama("GET", p);
    case "editar_projeto":
      return chama("POST", `${p}/comandos`, json({ revisao: a.revisao, comandos: a.comandos }));
    case "ver_quadros":
      return chama("GET", `${p}/quadros?src=${seguro(a.src)}&instantes=${seguro(Array.isArray(a.instantes) ? a.instantes.join(",") : "")}`);
    case "ver_silencios":
      return chama("GET", `${p}/silencios?src=${seguro(a.src)}`);
    case "exportar":
      return chama("POST", `${site}/exportar`, json({ final: a.final, versoes: a.versoes }));
    case "acompanhar_exportacao":
      return chama("POST", `${site}/exportacoes/${seguro(a.exportacao)}`);
    case "enviar_arquivo": {
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
  return { content: [{ type: "text", text: text || res.statusText }], isError: !res.ok };
}

type Falha = { error: { code: number; message: string; data?: unknown }; status: number };
type Certo = { result: Record<string, unknown> };
type Resposta = Certo | Falha;

const falha = (status: number, code: number, message: string, data?: unknown): Falha => ({ status, error: { code, message, ...(data ? { data } : {}) } });

async function chamar(params: Args, chama: Interna): Promise<Resposta> {
  const res = pedido(String(params.name), (params.arguments ?? {}) as Args, chama);
  if (!res) return falha(400, -32602, `Unknown tool: ${String(params.name)}`);
  return { result: await resultado(await res) };
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
