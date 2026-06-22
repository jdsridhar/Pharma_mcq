/**
 * Jest config for the web app's unit tests. Scope is intentionally narrow: the framework-free
 * logic that is risky and worth guarding — the API client's silent-refresh/retry and error
 * mapping, and the Zustand auth store. Tests live in `test/` and run under ts-jest in a node
 * environment (no jsdom needed for these). Component/E2E (RTL + Playwright) are future additions.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@pharmacy/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@pharmacy/config$': '<rootDir>/../../packages/config/src/index.ts',
  },
};
