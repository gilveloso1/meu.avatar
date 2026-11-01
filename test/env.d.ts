import type { D1Migration } from "cloudflare:test";
import type { Env as AppEnv } from "../src/env";
import type { TesteConteiner } from "./worker";

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
      TESTE_CONTEINER: DurableObjectNamespace<TesteConteiner>;
    }
  }
}
