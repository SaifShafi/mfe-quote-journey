const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { ModuleFederationPlugin } = require('webpack').container

const { sharedModules } = require('../shared-config/federation')
const deps = require('./package.json').dependencies

module.exports = {
  entry: './src/index.ts',
  output: {
    // Absolute publicPath matters: the host fetches this remote's chunks by URL,
    // so they cannot be resolved relative to the HOST's origin.
    publicPath: 'http://localhost:3002/',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        // shared-ui is a workspace package of TypeScript source, reached through
        // a symlink in node_modules. Webpack resolves that to its real path
        // outside node_modules, so this rule compiles it. Excluding
        // /node_modules/ alone is not enough to keep it out, and is not meant to
        // be: the package ships source, not a build step of its own.
        exclude: [/node_modules/, /\.test\.tsx?$/],
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  devServer: {
    port: 3002,
    // The host is a different origin, so it cannot read remoteEntry.js without this.
    headers: { 'Access-Control-Allow-Origin': '*' },
    historyApiFallback: true,
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'remote_account',
      filename: 'remoteEntry.js',
      exposes: {
        './PolicySummary': './src/PolicySummary',
      },
      shared: sharedModules(deps),
    }),
    new HtmlWebpackPlugin({ template: './public/index.html' }),
  ],
}
