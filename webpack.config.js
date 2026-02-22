import webpack from 'webpack';
import { join } from 'path';
import { PROJECT_ROOT, CLIENT_ROOT } from './server/config/paths.js';
import config from './server/config/config.js';

export default {
    mode: ['production', 'development'].includes(config.env) ? config.env : 'development',
    entry: './client/src/app.jsx',
    output: {
        path: join(CLIENT_ROOT, 'build'),
        publicPath: '/build/',
        filename: 'bundle.js'
    },
    devtool: config.env === 'testing' ? 'eval-cheap-module-source-map' : undefined,
    devServer: {
        host: config.host,
        port: config.clientPort,
        historyApiFallback: true,
        hot: true,
        open: true,
        static: [
            { directory: join(CLIENT_ROOT, 'public') },
            { directory: join(CLIENT_ROOT, 'build') }
        ],
        proxy: [
            {
                context: ['/api', '/files'],
                target: `http://${config.host}:${config.serverPort}`,
                changeOrigin: true,
                secure: false,
                ws: false
            }
        ],
        allowedHosts: 'all', // Для подключения с других хостов
        client: {
            webSocketURL: {
                hostname: config.host,
                port: config.clientPort,
                protocol: config.protocol === 'https' ? 'wss' : 'ws'
            }
        }
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /(node_modules)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react']
                    }
                }
            },
            {
                test: /\.js$/,
                include: [join(PROJECT_ROOT, 'shared')],
                use: 'babel-loader'
            },
            {
                test: /\.scss$/,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            url: false // Для подхватывания файлов по относительному пути
                        }
                    },
                    'sass-loader'
                ]
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.jsx'],
        alias: {
            '@': join(CLIENT_ROOT, 'src'),
            '@shared': join(PROJECT_ROOT, 'shared')
        }
    },
    plugins: [
        // Настройка DefinePlugin для передачи переменных в клиентский код
        new webpack.DefinePlugin({
            'process.env.APP_ENV': JSON.stringify(config.env),
            'process.env.PROTOCOL': JSON.stringify(config.protocol),
            'process.env.HOST': JSON.stringify(config.host),
            'process.env.CLIENT_PORT': JSON.stringify(config.clientPort),
            'process.env.SERVER_PORT': JSON.stringify(config.serverPort),
            'process.env.YOOKASSA_SHOP_ID': JSON.stringify(config.yooKassa.shopId),
        })
    ]
};
