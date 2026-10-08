const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { ModuleFederationPlugin } = require('webpack').container

const deps = require('./package.json').dependencies

module.exports = {
  entry: './src/index.ts',
  output: {
    // Absolute publicPath matters: the host fetches this remote's chunks by URL,
    // so they cannot be resolved relative to the HOST's origin.
    publicPath: 'http://localhost:3001/',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        // Tests are run by Vitest, not bundled. Without this, ts-loader
        // type-checks them against the app tsconfig and the build fails on
        // matchers it has no types for.
        exclude: [/node_modules/, /\.test\.tsx?$/],
      },
    ],
  },
  devServer: {
    port: 3001,
    // The host is a different origin, so it cannot read remoteEntry.js without this.
    headers: { 'Access-Control-Allow-Origin': '*' },
    historyApiFallback: true,
  },
  plugins: [
    new ModuleFederationPlugin({
      // The global name the host looks for once remoteEntry.js has run.
      name: 'remote_quote',
      // The manifest-plus-loader file the host fetches first.
      filename: 'remoteEntry.js',
      // Public name -> internal path. The host imports 'remote_quote/VehicleDetails'.
      exposes: {
        './VehicleDetails': './src/VehicleDetails',
      },
      // singleton: one React instance across the whole page, whoever loads first.
      // Without this you can get two copies and hooks break in ways that look unrelated.
      shared: {
        react: { singleton: true, requiredVersion: deps.react },
        'react-dom': { singleton: true, requiredVersion: deps['react-dom'] },
      },
    }),
    new HtmlWebpackPlugin({ template: './public/index.html' }),
  ],
}
