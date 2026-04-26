import { createRequire } from "node:module";

const sharedRequire = createRequire(
  new URL("../codex_utilities/Downloads/projects/package.json", import.meta.url),
);
const js = sharedRequire("@eslint/js");
const typescriptParser = sharedRequire("@typescript-eslint/parser");
const typescriptPlugin = sharedRequire("@typescript-eslint/eslint-plugin");
const globals = sharedRequire("globals");

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
};

export default [
  {
    ignores: [
      "android/**",
      "ios/**",
      "node_modules/**",
      "dist/**",
      "www/**",
      "public/assets/offline-packs/**",
      "public/assets/data/*.json",
      "public/assets/data/*.sql",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sharedGlobals,
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: sharedGlobals,
    },
    plugins: {
      "@typescript-eslint": typescriptPlugin,
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
