# Fish Audio Drama 3 (`fish-audio/drama-3`)

Modelo de fala feito para interpretação: o texto vira áudio (MP3), que entra no HeyGen Avatar como
"Meu áudio" para virar o vídeo falado. Estrutura `voz.ts` (`FISH`), só para o administrador desde
08/11/2026, no mesmo molde do [ElevenLabs v4](elevenlabs-v4.md).

Como chamar: `POST /api/v1/audio/speech` do OpenRouter com `model`, `input`, `voice` (o `reference_id`
de uma voz da biblioteca do Fish) e `response_format: "mp3"`. O modelo não lista vozes no OpenRouter
(`supported_voices` vazio).

- **Preço:** US$ 0,000002 por caractere (US$ 2 por milhão) nos testes de 08/11 à madrugada de 10/11/2026, uns
  US$ 0,002 por minuto de fala em português. Mais tarde em 10/11/2026 a lista do OpenRouter passou a dizer
  US$ 0,00001 (US$ 10 por milhão, uns US$ 0,01 por minuto): 8 vezes menos que o ElevenLabs, não
  mais 40. O site lê a lista a cada pedido, então a estimativa e o custo gravado acompanham.
- **Vozes:** a biblioteca do Fish é aberta (qualquer pessoa publica uma voz), e as mais usadas em
  português imitam gente famosa (políticos, apresentadores, personagens) ou trazem a descrição errada
  (uma "voz masculina" que era de mulher). Por isso o site só usa as **vozes oficiais**, as da conta
  "Fish Official" (criadas pela própria empresa, por descrição), lidas da API pública do Fish
  (`GET https://api.fish.audio/model?author_id=…&language=…`, sem chave; `src/fish.ts`) e guardadas
  por um dia, como o catálogo da HeyGen. Em 08/11/2026: 15 do Brasil, 8 de Portugal, 170 em inglês e
  49 em espanhol. O português se divide pelo sotaque (a marcação `pt-br`/`pt-pt` e, sem ela, a
  descrição). A prévia é a amostra que o Fish já guarda de cada voz (sem gastar), salva no R2 no
  primeiro toque (`vozes/previas/fish/`).
- **Emoções:** entende direções entre colchetes, em linguagem livre; o site manda as mesmas
  marcações em inglês do ElevenLabs (`[whispers]`, `[laughs]`, `[whispers, laughs]`).
- **Voz clonada:** no ar desde 08/11/2026, no molde da "Voz clonada" da HeyGen (Voz pronta | Voz
  clonada; "Clonar uma voz nova" com a gravação, o nome e o consentimento; a voz de cada avatar com
  gravação). Pelo OpenRouter não há voz criada no Fish nem id: a clonagem é sem estado, e a gravação
  (até 15 MB) vai em cada pedido em `input_references`, sem `voice`. A voz nova fica no R2
  (`vozes/clonadas/`) e na tabela `voices` com `provider = 'fish'` (migration 0022), e cada vídeo
  guarda a gravação usada (`settings.reference_key`). O texto da gravação é opcional: com e sem ele, o
  Urso clonado saiu igual (~91 Hz), e o site não manda. A gravação deve ir como o modelo gerou, só com
  o volume ajustado: subir o tom por processamento deixou a voz clonada com estouros.

## Testes

**08/11/2026, comparação com o ElevenLabs v4** (o mesmo texto de anúncio, ~230 caracteres, pelo
terminal; detalhes em [elevenlabs-v4.md](elevenlabs-v4.md)): boa qualidade, levemente abaixo do
ElevenLabs, por um preço muito menor. As marcações de emoção não foram lidas em voz alta.

**08/11/2026, escolha das vozes:** primeiro, 19 candidatas genéricas da biblioteca aberta (16
aprovadas); ouvindo de novo, o dono achou várias parecidas, e o site passou às vozes oficiais. As 23
oficiais em português foram geradas com o mesmo texto (`temp/vozes/fish-oficial/`, fora do git) e
aprovadas, as de Portugal inclusive; inglês e espanhol entraram junto. Custo: menos de US$ 0,02.
