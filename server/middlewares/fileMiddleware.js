import { join } from 'path';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import config from '../config/config.js';
import s3Client from '../config/s3Client.js';
import { PUBLIC_PATH, BUILD_PATH, STORAGE_ROOT } from '../config/paths.js';
import { SERVER_CONSTANTS } from '../../shared/constants.js';

const { STORAGE_TYPE } = SERVER_CONSTANTS;

export const serveBuildFiles = (express) => {
    if (config.env !== 'production') return (req, res, next) => next();
    return express.static(BUILD_PATH); 
};

export const servePublicFiles = (express) => {
    if (config.env !== 'production') return (req, res, next) => next();
    return express.static(PUBLIC_PATH);
};

export const serveStorageFiles = async (req, res, next) => {
    const storageKey = req.params[0]; // Часть пути после /files/

    if (!storageKey) {
        return res.status(404).end();
    }

    if (config.storage.type === STORAGE_TYPE.FS) {
        const filePath = join(STORAGE_ROOT, storageKey);
        return res.sendFile(filePath);
    }

    if (config.storage.type === STORAGE_TYPE.S3) {
        try {
            const getCommand = new GetObjectCommand({
                Bucket: config.storage.bucket,
                Key: storageKey,
            });
    
            switch (config.storage.bucketType) {
                case 'public': {
                    // Получение потока данных с хранилища s3
                    const response = await s3Client.send(getCommand);
                    const stream = response.Body;
                    
                    // Установка заголовков на сервере
                    res.set('Content-Type', response.ContentType);
                    res.set('Content-Length', response.ContentLength);

                    // Скачивание файла с хранилища s3 через сервер
                    stream.on('error', (err) => next(err));
                    return stream.pipe(res);
                }
    
                case 'private': {
                    // Генерирация ссылки, действующей 1 час
                    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

                    // Скачивание файла с s3 напрямую по подписанному URL
                    return res.redirect(signedUrl);
                }
    
                default:
                    throw new Error(`Некорректный bucket-тип хранилища s3: ${config.storage.bucketType}`);
            }
        } catch (err) {
            // Файла нет в S3 => SDK выкинет ошибку NoSuchKey
            if (err.name === 'NoSuchKey') {
                return res.status(404).end();
            }

            next(err);
        }
    }
};

export const serveReactApp = (req, res, next) => {
    if (config.env !== 'production') return next();
    return res.sendFile(join(PUBLIC_PATH, 'index.html'));
};
