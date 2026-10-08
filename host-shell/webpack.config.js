const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { ModuleFederationPlugin } = require('webpack').container

const deps = require('./package.json').dependencies

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
        exclude: [/node_modules/, /\.test\.tsx?$/],
      },
    ],
  },
  devServer: { port: 3000, historyApiFallback: true },
  plugins: [
    new ModuleFederationPlugin({
      name: 'host_shell',
      // name -> global@url. The host knows NOTHING about what is inside
      // remote_quote at build time; it discovers that at runtime by fetching
      // remoteEntry.js. That is the whole difference from an npm dependency.
      remotes: {
        remote_quote: 'remote_quote@http://localhost:3001/remoteEntry.js',
      },
      shared: {
        react: { singleton: true, requiredVersion: deps.react },
        'react-dom': { singleton: true, requiredVersion: deps['react-dom'] },
      },
    }),
    new HtmlWebpackPlugin({ template: './public/index.html' }),
  ],
}
