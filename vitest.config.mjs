export default {
  plugins: [
    {
      enforce: 'pre',
      name: 'strip-mjs-shebang-for-tests',
      transform(code, id) {
        if (!id.endsWith('.mjs') || !code.startsWith('#!')) {
          return null;
        }

        return {
          code: code.replace(/^#![^\r\n]*(?:\r?\n)?/u, ''),
          map: null,
        };
      },
    },
  ],
  test: {
    environment: 'node',
  },
};
