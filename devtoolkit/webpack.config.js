const path = require('path');

// Create a base configuration object
const baseConfig = {
  mode: 'none', // will be set by VS Code
  target: 'node',
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  },
  devtool: 'source-map'
};

// Extension host bundle
const extensionConfig = {
  ...baseConfig,
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    'vscode': 'commonjs vscode' // VS Code extension API
  },
};

// WebView bundle
const webviewConfig = {
  ...baseConfig,
  target: 'web',
  entry: './src/webview/bundle.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js'
  }
};

module.exports = [extensionConfig, webviewConfig];
