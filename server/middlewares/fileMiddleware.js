import { join } from 'path';
import config from '../config/config.js';
import { BUILD_ROOT, STORAGE_ROOT } from '../config/paths.js';

export const serveStaticFiles = (express) => {
    if (config.env !== 'production') return (req, res, next) => next();
    return express.static(BUILD_ROOT);
};

export const serveStorageFiles = (express) => express.static(STORAGE_ROOT);

export const serveReactApp = (req, res, next) => {
    if (config.env !== 'production') return next();
    return res.sendFile(join(BUILD_ROOT, 'index.html'));
};
