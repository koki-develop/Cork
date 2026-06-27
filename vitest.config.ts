import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// `vite.config.ts` exports `defineConfig(async () => ({...}))` — a function
// factory returning a Promise. `mergeConfig` only takes resolved configs, so
// the outer factory awaits `viteConfig(env)` before merging.
export default defineConfig(async (env) =>
  mergeConfig(
    await viteConfig(env),
    defineConfig({
      test: {
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.spec.{ts,tsx}"],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          instances: [{ browser: "chromium" }],
        },
      },
    }),
  ),
);
