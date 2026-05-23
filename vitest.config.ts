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
    // P2-#5 (2026-05-23): Coverage 설정.
    //   목표: src/ 70% (점진 상승). 현재는 informational only — CI 에서
    //   continue-on-error: true 로 실행되어 fail 안 함.
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/__tests__/**",
        "src/index.ts", // entrypoint — 통합 테스트에서 다룸
        "dist/**",
      ],
    },
  },
});
