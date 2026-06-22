import baseConfig from 'eslint-config-upleveled';

export default [
  ...baseConfig,
  {
    ignores: ['eslint.config.js', 'postcss.config.mjs'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    rules: {
      // Start strict config adoption gradually by reporting these as warnings first.
      '@next/next/no-html-link-for-pages': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-use-before-define': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'no-restricted-globals': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-x/no-array-index-key': 'warn',
      'react-x/no-leaked-conditional-rendering': 'warn',
      'react-x/no-nested-component-definitions': 'warn',
    },
  },
];
