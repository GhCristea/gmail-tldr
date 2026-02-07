// @ts-check
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import nounsanitized from 'eslint-plugin-no-unsanitized'
import pluginPromise from 'eslint-plugin-promise'
import prettier from 'eslint-plugin-prettier/recommended'

/** @type {import("eslint").Linter.FlatConfig} */
const promiseRecommended =
  // @ts-expect-error plugin doesn't publish typed `configs`
  pluginPromise.configs['flat/recommended']

/** @type {import("eslint").Linter.FlatConfig} */
const noUnsanitizedRecommended =
  // @ts-expect-error plugin doesn't publish typed `configs`
  nounsanitized.configs.recommended

export default defineConfig([
  { ignores: ['**/*.config.*', '**/*.test.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  promiseRecommended,
  noUnsanitizedRecommended,
  prettier,
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { project: './tsconfig.eslint.json', tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.es2022, ...globals.webextensions }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-console': 'off'
    }
  },
  { files: ['src/background.ts'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['src/popup.ts'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-floating-promises': 'off' }
  },
  { ignores: ['dist/', 'node_modules/'] }
])
