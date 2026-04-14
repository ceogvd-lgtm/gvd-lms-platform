module.exports = {
  root: true,
  extends: [require.resolve('@lms/config/eslint/nestjs')],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
