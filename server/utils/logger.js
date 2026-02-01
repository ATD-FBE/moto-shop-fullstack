import winston from 'winston';

const prepareInfo = (info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    const stackData = stack ? `\n${stack}` : '';
    const metaData = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 4)}` : '';
    return { timestamp, level: level, message, stackData, metaData };
};

const timestampFormat = 'YYYY-MM-DD HH:mm:ss';

const loggerConfig = {
    level: 'info',

    format: winston.format.combine( // Общий формат (файлы и консоль)
        winston.format.timestamp({ format: timestampFormat }),
        winston.format.splat(), // Для более двух аргументов в логгере (meta - обязательно объекты!)
        winston.format.printf(info => {
            const { timestamp, level, message, stackData, metaData } = prepareInfo(info);
            return `[${timestamp}] [${level.toUpperCase()}]: ${message}${stackData}${metaData}\n`;
        })
    ),

    transports: [
        ...(process.env.NODE_ENV !== 'production'
            ? [new winston.transports.File({ filename: '_logs/combined.log' })]
            : []),
        new winston.transports.File({
            filename: '_logs/error.log',
            level: 'error'
        }),
        new winston.transports.Console({
            format: winston.format.combine( // Персональный формат для консоли
                winston.format.colorize(),
                winston.format.timestamp({ format: timestampFormat }),
                winston.format.splat(), // Для более двух аргументов в логгере (meta - обязательно объекты!)
                winston.format.printf(info => {
                    const { timestamp, level, message, stackData, metaData } = prepareInfo(info);
                    return `${level}: ${message} - { timestamp: ${timestamp} }${stackData}${metaData}`;
                })
            )
        })
    ]
};

const logger = winston.createLogger(loggerConfig);

export default logger;
