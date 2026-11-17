import pluginVue from 'eslint-plugin-vue'

// Static code analysis for FT4 — flags unused vars, undefined refs and Vue-specific mistakes
// (e.g. duplicate attributes, unused components) across .js and .vue files.
export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'report/**', 'test-results/**', 'playwright-report/**'] },
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', fetch: 'readonly', console: 'readonly', URL: 'readonly', Blob: 'readonly', confirm: 'readonly' },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
    },
  },
]
