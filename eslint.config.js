import { Linter } from 'eslint';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const config = new Linter.Config({
  parser: tsParser,
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
  },
  plugins: {
    '@typescript-eslint': tsPlugin,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    'semi': ['error', 'never'],
    'quotes': ['warning', 'single'],
    'comma-dangle': ['warning', 'always-multiline'],
    'arrow-parens': ['warning', 'always'],
    'no-console': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
  },
});

export default config;