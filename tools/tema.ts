/**
 * Gera as cores do estúdio (src/site/theme.ts) pelo algoritmo do Material
 * Design 3: o mesmo cálculo do Material Theme Builder, no esquema "tonal spot"
 * (o padrão do Material You), para os temas claro e escuro. Mesmo jeito do
 * anb.bot (tools/tema.ts), com uma diferença: as paletas neutras (fundos,
 * superfícies, textos e contornos) vão sem croma, em cinza puro, para o fundo
 * não puxar para a cor da marca; a cor fica nos botões, abas e ícones.
 *
 *   npm run tema            # usa a cor da marca (#6750a4, a cor de referência do M3)
 *   npm run tema -- #0b57d0 # outra cor de origem
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argbFromHex, DynamicScheme, Hct, hexFromArgb, MaterialDynamicColors, SchemeTonalSpot, TonalPalette } from "@material/material-color-utilities";

const SOURCE = process.argv[2] ?? "#6750a4";

const colors = new MaterialDynamicColors().allColors;

// Blocos do canvas de edição: cada tipo tem a sua paleta (vídeo na primária,
// imagem na secundária, áudio na terciária) e 6 tons dela para diferenciar
// blocos do mesmo tipo. O texto fica a 50 tons do fundo (contraste de 4,5:1).
const BLOCO_TONS = { light: [92, 86, 80, 74, 68, 62], dark: [20, 25, 30, 35, 40, 45] };

function tokens(isDark: boolean): string {
  const base = new SchemeTonalSpot(Hct.fromInt(argbFromHex(SOURCE)), isDark, 0, "2021");
  const gray = TonalPalette.fromHueAndChroma(base.sourceColorHct.hue, 0);
  const scheme = new DynamicScheme({ ...base, neutralPalette: gray, neutralVariantPalette: gray });
  const sys = colors
    .filter((c) => !c.name.endsWith("_palette_key_color"))
    .map((c) => `  --md-sys-color-${c.name.replace(/_/g, "-")}: ${hexFromArgb(c.getArgb(scheme))};`);
  const palettes = { video: scheme.primaryPalette, imagem: scheme.secondaryPalette, audio: scheme.tertiaryPalette };
  const blocos = Object.entries(palettes).flatMap(([tipo, p]) => [
    ...BLOCO_TONS[isDark ? "dark" : "light"].map((t, i) => `  --bloco-${tipo}-${i + 1}: ${hexFromArgb(p.tone(t))};`),
    `  --bloco-${tipo}-on: ${hexFromArgb(p.tone(isDark ? 95 : 10))};`,
  ]);
  return [...sys, ...blocos].join("\n");
}

const out = `/**
 * Cores do Material Design 3 geradas por \`npm run tema\` a partir de ${SOURCE}
 * (esquema tonal spot, com fundos e textos em cinza neutro). Não edite à mão:
 * rode o comando de novo.
 */
export const SOURCE_COLOR = "${SOURCE}";

export const LIGHT = \`
${tokens(false)}
\`;

export const DARK = \`
${tokens(true)}
\`;
`;

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "site", "theme.ts");
writeFileSync(file, out);
console.log(`✅ Cores geradas em src/site/theme.ts a partir de ${SOURCE}.`);
