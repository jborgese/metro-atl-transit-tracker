module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2024: true
  },
  overrides: [
    {
      files: ["*.svelte"],
      parser: "svelte-eslint-parser",
      parserOptions: {
        parser: "@typescript-eslint/parser",
        extraFileExtensions: [".svelte"]
      },
      plugins: ["svelte"],
      extends: ["plugin:svelte/recommended", "prettier"],
      rules: {}
    },
    {
      files: ["*.js", "*.ts"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier"
      ],
      rules: {}
    }
  ]
};
