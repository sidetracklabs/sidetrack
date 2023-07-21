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
      include: ["./test/**/*.test.ts"],
    },
  };
});
