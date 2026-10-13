const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { ModuleFederationPlugin } = require('webpack').container

const { sharedModules } = require('../shared-config/federation')
const deps = require('./package.json').dependencies

// Stage 3's measurement switch, same shape as MFE_SHARED: baked into the
// bundle as a literal so scripts/measure-bff.mjs can rebuild the host once
// per mode and compare round trips. See host-shell/src/bff.ts.
const BFF_MODE = process.env.BFF_MODE === 'split' ? 'split' : 'aggregated'

module.exports = {
  entry: './src/index.ts',
  output: {
    publicPath: 'http://localhost:3000/',
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
        //
        // shared-ui is a workspace package of TypeScript source, reached through
        // a symlink in node_modules. Webpack resolves that to its real path
        // outside node_modules, so this rule compiles it despite the exclude.
        exclude: [/node_modules/, /\.test\.tsx?$/],
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  devServer: { port: 3000, historyApiFallback: true },
  plugins: [
    new ModuleFederationPlugin({
      name: 'host_shell',
      // name -> global@url. The host does not know what is inside remote_quote
      // at build time; it discovers that at runtime by fetching remoteEntry.js.
      remotes: {
        remote_quote: 'remote_quote@http://localhost:3001/remoteEntry.js',
        remote_account: 'remote_account@http://localhost:3002/remoteEntry.js',
      },
      // The host provides shared-ui as well as consuming it, so the first remote
      // to load finds a copy already in the shared scope. The map lives in
      // shared-config because all three applications must agree on it.
      shared: sharedModules(deps),
    }),
    new HtmlWebpackPlugin({ template: './public/index.html' }),
    new webpack.DefinePlugin({ BFF_MODE: JSON.stringify(BFF_MODE) }),
  ],
}
