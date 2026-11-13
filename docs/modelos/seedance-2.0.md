# Seedance 2.0 (`bytedance/seedance-2.0`): bloqueado para trocar avatar

**13/11/2026:** a troca de avatar (`seedance.ts`) está **desativada** (`off: true`): o código fica,
ninguém gera. O card e a página do Seedance são a versão livre (`seedance-livre.ts`, id
`seedance-livre`), com o seletor Versão "Seedance 2.0 | Mini"; os vídeos da troca aparecem na lista dela.

- **28/10/2026, Trocar avatar:** vídeo de 5,5 s (1280×720, uma pessoa real
  filmada) e uma foto de avatar realista, 480p. O OpenRouter respondeu HTTP 400
  na hora do envio, sem criar job (sem custo):
  `InputVideoSensitiveContentDetected.PrivacyInformation` ("the input video may
  contain real person"). Vídeo `b46cf527-948f-41b3-8a5e-ed7da5354211` no D1.
- **Por quê:** desde fev/2026 a ByteDance recusa no Seedance 2.0 e 2.5 fotos e
  vídeos de referência com rosto que pareça real, inclusive rosto sintético
  realista. Mandar de novo dá o mesmo erro. A exceção é o rosto autorizado na
  própria BytePlus (convite, verificação de identidade, um id de "ativo"), que
  o OpenRouter não repassa: das opções da BytePlus, só `watermark` e `req_key`.
- **Não contornar** o filtro (cortar, borrar, disfarçar o rosto): é regra do
  provedor.
- **Seedance livre (`seedance-livre.ts`, 13/11/2026):** a versão principal do Seedance, só para o
  administrador, no site e no agente (`gerar_video {modelo: "seedance-livre"}`), com as peças do Wan
  livre (`livre.ts`): a cena escrita inteira, primeiro e último quadro, até 4 imagens de referência,
  um vídeo de referência (2 a 15 s, o "video 1" da cena: editar, estender, seguir o movimento), som e
  semente. Para cena, produto, cenário e personagem estilizado: rosto realista o provedor recusa.
  Custo pelos tokens do quadro; com vídeo, o preço menor do token conta também o vídeo enviado
  (SKU `<res>_<formato>_video`). Ainda sem teste real.
- **Seedance 2.0 Mini (`seedance-mini`, 13/11/2026):** a mesma estrutura do livre no modelo
  `bytedance/seedance-2.0-mini`, versão "Mini" no seletor do Seedance: metade do preço do token (US$ 0,0000035;
  cerca de US$ 0,034/s em 480p e 0,076 em 720p, 9:16), só 480p e 720p. Ainda sem teste real.
- **A estrutura fica como está**, com o campo Uso: o Seedance pode servir a
  outros usos sem rosto realista na entrada (cenário, objeto, personagem
  estilizado). Um uso novo é uma opção nova em `USES`.
