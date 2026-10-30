import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        remoteBindings: false,
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BCRYPT_COST: "4",
            OPENROUTER_WEBHOOK_SECRET: "segredo-webhook",
            // O plugin também lê o .dev.vars do computador: os testes nunca rodam como "local"
            // nem com as chaves de verdade do OpenRouter e da HeyGen (as APIs dos testes são falsas, test/helpers.ts).
            AMBIENTE: "",
            OPENROUTER_API_KEY: "",
            HEYGEN_API_KEY: "",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/setup.ts"] },
  };
});
