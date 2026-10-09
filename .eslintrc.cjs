module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  ignorePatterns: [
    'node_modules/',
    'client/',
    'logs/',
    'coverage/',
    'hosted/',
    'backups/',
    'dist-exe/',
    '.venv/',
    '*.IMPROVED.js',
  ],
  rules: {
    'no-console': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
  },
  overrides: [
    {
      files: ['scripts/verifyMusicUI.js'],
      globals: { document: 'readonly', window: 'readonly' },
    },
    {
      files: ['**/*.test.js', '**/__tests__/**/*.js'],
      env: {
        jest: true,
      },
    },
  ],
};
