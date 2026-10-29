# Seedance 2.0 (`bytedance/seedance-2.0`): bloqueado para trocar avatar

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
- **A estrutura fica como está**, com o campo Uso: o Seedance pode servir a
  outros usos sem rosto realista na entrada (cenário, objeto, personagem
  estilizado). Um uso novo é uma opção nova em `USES`.
