import { defineConfig } from "vitest/config";
import path from "path";

const projectRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: {
      "@shared": path.resolve(projectRoot, "src", "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
  },
});
