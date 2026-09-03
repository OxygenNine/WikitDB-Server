import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/vendor/**', 'others/**'] },
  ...compat.config({ extends: ['next/core-web-vitals'] }),
];
