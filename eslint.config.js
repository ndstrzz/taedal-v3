// eslint.config.js (root)
import tsParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["dist/**", "build/**", "node_modules/**", "scripts/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
      // Browser globals so ESLint doesn’t flag them
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        File: "readonly",
        Blob: "readonly",
        FormData: "readonly",
        XMLHttpRequest: "readonly",
        crypto: "readonly",
        IntersectionObserver: "readonly",
        HTMLVideoElement: "readonly",
        HTMLMediaElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLImageElement: "readonly",
      },
    },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "detect" } },
    rules: {
      // Hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Vite HMR friendliness
      "react-refresh/only-export-components": "off",
      // “unused” → warn, but allow leading underscore to silence
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // allow intentionally empty catch
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
];
