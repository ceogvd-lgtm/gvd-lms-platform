/**
 * ESLint config for the @lms/config workspace package.
 *
 * The files in `eslint/` and `tsconfig/` are CommonJS preset modules — not
 * application source code. We give them their own minimal config so:
 *   1. ESLint finds a config when lint-staged passes them explicitly
 *      (avoids the "ESLint couldn't find a configuration file" hard error).
 *   2. They get linted with sensible Node/CommonJS defaults but no extra
 *      rules — they're just config exports.
 */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script',
  },
  env: {
    node: true,
    commonjs: true,
  },
  extends: ['eslint:recommended'],
  rules: {},
};
