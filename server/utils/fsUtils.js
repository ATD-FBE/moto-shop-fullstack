import { promises as fsp } from 'fs';
import log from './logger.js';

export const cleanupFiles = async (filePaths, req) => {
    if (!filePaths.length) return;
    
    await Promise.all(
        filePaths.map(async (path) => {
            try {
                await fsp.unlink(path);
            } catch (err) {
                if (err.code === 'ENOENT') return;
                log.error(`${req.logCtx} - Ошибка удаления файла "${path}":`, err);
            }
        })
    );
};

export const cleanupDir = async (dirPath, req) => {
    if (!dirPath) return;
    
    try {
        await fsp.rm(dirPath, { recursive: true, force: true });
    } catch (err) {
        log.error(`${req.logCtx} - Не удалось удалить папку ${dirPath}:`, err);
    }
};
