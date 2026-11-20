import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Tests only ever touch TEST_DATABASE_URL, never the development database.
const { TEST_DATABASE_URL } = { ...loadEnv("test", process.cwd(), "TEST_"), ...process.env };

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false, // database tests share one database
    env: {
      DATABASE_URL: TEST_DATABASE_URL || "postgresql://unused:unused@localhost:5432/unused",
      ...(TEST_DATABASE_URL ? { TEST_DATABASE_URL } : {}),
      BCRYPT_ROUNDS: "4",
    },
  },
});
