import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node.js ESM environment
    environment: "node",
    // Top-level await in test files needs this
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--experimental-vm-modules"],
      },
    },
  },
});
