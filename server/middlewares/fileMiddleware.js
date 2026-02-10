import { join } from 'path';
import config from '../config/config.js';
import { BUILD_ROOT, STORAGE_ROOT, STORAGE_URL_PATH } from '../config/paths.js';

export const serveStaticFiles = (express) => {
    if (config.env !== 'production') return (req, res, next) => next();
    return express.static(BUILD_ROOT);
};

export const serveStorageFiles = async (req, res, next) => {
    const storageKey = req.params[0]; // Часть пути после /files/

    if (!storageKey) {
        return res.status(404).end();
    }

    if (config.storage.type === 'fs') {
        const filePath = join(STORAGE_ROOT, storageKey);
        return res.sendFile(filePath);
    }

    /*if (config.storage.type === 's3') {
        const stream = s3.getObject({
            Bucket: S3_BUCKET,
            Key: storageKey
        }).createReadStream();

        stream.on('error', next);
        return stream.pipe(res);
    }*/
};

export const serveReactApp = (req, res, next) => {
    if (config.env !== 'production') return next();
    return res.sendFile(join(BUILD_ROOT, 'index.html'));
};
