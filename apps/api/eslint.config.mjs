import base from '@pharmacy/eslint-config/base';

export default [
  ...base,
  {
    rules: {
      // NestJS relies heavily on decorators and DI; relax a few rules accordingly.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // DI-injected providers must be VALUE imports so `emitDecoratorMetadata` can emit
      // `design:paramtypes`. Without type-aware linting this rule can't tell DI params
      // from pure type usage and would break injection if auto-fixed — so disable it here.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
