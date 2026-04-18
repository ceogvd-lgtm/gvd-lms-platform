/**
 * ESLint overrides for repo-root scripts/ folder.
 *
 * These are one-off Node CommonJS maintenance tools — not part of the
 * TypeScript builds. The TS parser the shared base config uses doesn't
 * recognise the `parserOptions.sourceType` on plain .js files, and we
 * don't want to push `@typescript-eslint` at them anyway.
 */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script',
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': 'off',
  },
};
