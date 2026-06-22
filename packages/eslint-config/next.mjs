import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import base from './base.mjs';

/**
 * ESLint flat config for the Next.js app — base + Next core-web-vitals rules.
 * Consumer: `import next from '@pharmacy/eslint-config/next';`
 */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];
