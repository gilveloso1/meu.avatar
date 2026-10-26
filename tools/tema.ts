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

function tokens(isDark: boolean): string {
  const base = new SchemeTonalSpot(Hct.fromInt(argbFromHex(SOURCE)), isDark, 0, "2021");
  const gray = TonalPalette.fromHueAndChroma(base.sourceColorHct.hue, 0);
  const scheme = new DynamicScheme({ ...base, neutralPalette: gray, neutralVariantPalette: gray });
  return colors
    .filter((c) => !c.name.endsWith("_palette_key_color"))
    .map((c) => `  --md-sys-color-${c.name.replace(/_/g, "-")}: ${hexFromArgb(c.getArgb(scheme))};`)
    .join("\n");
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
