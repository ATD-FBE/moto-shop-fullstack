import winston from 'winston';

const loggerConfig = {
    level: 'info',

    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(
            i => `${i.timestamp} ${i.level}: ${i.message}${i.stack ? (' ' + i.stack) : ''}`
        )
    ),

    transports: [
        new winston.transports.File({
            filename: '_logs/combined.log'
        }),
        new winston.transports.File({
            filename: '_logs/error.log',
            level: 'error'
        }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
};

const logger = winston.createLogger(loggerConfig);

export default logger;
