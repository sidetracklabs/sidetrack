import sortKeys from "eslint-plugin-sort-keys";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import _import from "eslint-plugin-import";
import typescriptSortKeys from "eslint-plugin-typescript-sort-keys";
import { fixupPluginRules } from "@eslint/compat";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "**/migrations",
      "**/models",
      "**/generated",
      "**/dist",
      "**/docs",
    ],
  },
  ...compat.extends("prettier"),
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.js", "**/*.jsx"],

    plugins: {
      "sort-keys": sortKeys,
    },

    rules: {
      "sort-keys": "off",
      "sort-keys/sort-keys-fix": "error",
    },
  },
  ...compat
    .extends(
      "plugin:@typescript-eslint/recommended",
      "plugin:@typescript-eslint/recommended-requiring-type-checking",
      "plugin:@typescript-eslint/strict",
    )
    .map((config) => ({
      ...config,
      files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    })),
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],

    plugins: {
      "simple-import-sort": simpleImportSort,
      import: fixupPluginRules(_import),
      "typescript-sort-keys": typescriptSortKeys,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 5,
      sourceType: "script",

      parserOptions: {
        project: ["./tsconfig.json"],
      },
    },

    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          minimumDescriptionLength: 3,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
        },
      ],

      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-throw-literal": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/sort-type-constituents": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/unbound-method": "off",
      eqeqeq: "error",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "no-extra-bind": "error",
      "no-fallthrough": "error",
      "no-invalid-regexp": "error",
      "no-invalid-this": "error",
      "no-return-assign": "error",
      "no-self-compare": "error",
      "no-useless-concat": "error",
      "no-useless-return": "error",
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
      "typescript-sort-keys/interface": "error",
    },
  },
];
