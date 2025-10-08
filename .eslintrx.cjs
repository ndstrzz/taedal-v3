module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["react-hooks"],
  rules: {
    "react-hooks/rules-of-hooks": "error",   // ← will show the exact file+line that violates hooks rules
    "react-hooks/exhaustive-deps": "warn"
  }
};
