import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["index.html", "_site/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "data/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
  {
    files: ["build.mjs", "tests/**/*.mjs", "tools/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Tests also run code inside the page (page.evaluate), so allow browser globals too.
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
    },
  },
];
