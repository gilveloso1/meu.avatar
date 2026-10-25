/**
 * Gera as cores do estúdio (src/site/theme.ts) pelo algoritmo do Material
 * Design 3: o mesmo cálculo do Material Theme Builder, no esquema "tonal spot"
 * (o padrão do Material You), com as paletas do próprio esquema, para os
 * temas claro e escuro. Mesmo jeito do anb.bot (tools/tema.ts).
 *
 *   npm run tema            # usa a cor da marca (#6750a4, a cor de referência do M3)
 *   npm run tema -- #0b57d0 # outra cor de origem
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { argbFromHex, Hct, hexFromArgb, MaterialDynamicColors, SchemeTonalSpot } from "@material/material-color-utilities";

const SOURCE = process.argv[2] ?? "#6750a4";

const colors = new MaterialDynamicColors().allColors;

function tokens(isDark: boolean): string {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(SOURCE)), isDark, 0, "2021");
  return colors
    .filter((c) => !c.name.endsWith("_palette_key_color"))
    .map((c) => `  --md-sys-color-${c.name.replace(/_/g, "-")}: ${hexFromArgb(c.getArgb(scheme))};`)
    .join("\n");
}

const out = `/**
 * Cores do Material Design 3 geradas por \`npm run tema\` a partir de ${SOURCE}
 * (esquema tonal spot). Não edite à mão: rode o comando de novo.
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
