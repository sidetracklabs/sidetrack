import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitest.dev/config
export default defineConfig(() => {
  return {
    build: {
      target: "esnext",
    },
    plugins: [tsconfigPaths()],
    test: {
      coverage: {
        exclude: ['./src/cli.ts', '.kanelrc.js', '*.config*']
      },
      include: ["./test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"]
    },
  };
});
