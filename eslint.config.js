// Проверка кода: npm run lint. Только правила, которые ловят ошибки, — стиль записи не трогаем.
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      eqeqeq: ['error', 'smart'],
      'no-cond-assign': ['error', 'except-parens'],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  { files: ['server.mjs', 'tests/**', 'eslint.config.js'], languageOptions: { globals: { ...globals.node } } },
];
