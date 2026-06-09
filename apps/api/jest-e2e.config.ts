import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  testTimeout: 30000,
  moduleNameMapper: {
    '^@edgevanta/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^uuid$': '<rootDir>/test/__mocks__/uuid.js',
  },
};

export default config;
