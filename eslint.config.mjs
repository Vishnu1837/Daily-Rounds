import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * `eslint-config-next` v16 exports flat-config arrays, not a factory.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', '.data/**', '.scratch/**', 'drizzle/**', 'next-env.d.ts'],
  },
  ...next,
  ...nextCoreWebVitals,
];

export default config;
