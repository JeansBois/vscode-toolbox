const path = require('path');

module.exports = {
    target: 'web',
    entry: './src/webview/bundle.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'webview.js'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    devtool: 'source-map'
};
