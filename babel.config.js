module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current'
        }
      }
    ],
    '@babel/preset-typescript'
  ],
  plugins: [
    [
      'module-resolver',
      {
        alias: {
          '@middlewares': './src/middlewares',
          '@models': './src/models',
          '@types': './src/types',
          '@providers': './src/providers',
          '@services': './src/services',
          '@useCases': './src/useCases',
          '@workers': './src/workers'
        }
      },
    ],
    ['@babel/plugin-proposal-decorators', { legacy: true }]
  ],
  ignore: ['**/*.spec.ts']
};
