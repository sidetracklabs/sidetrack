import { defineConfig } from "tsup";

export default defineConfig((opts) => ({
  clean: !opts.watch,
  dts: true,
  entry: ["src/index.ts", "src/effect.ts", "src/cli.ts"],
  format: ["cjs", "esm"],
}));
