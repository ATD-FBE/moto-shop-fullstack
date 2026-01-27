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
                log.error(`${req.logCtx} - Ошибка удаления файла "${path}": ${err.message}`);
            }
        })
    );
};

export const cleanupFolder = async (folderPath, req) => {
    if (!folderPath) return;
    
    try {
        await fsp.rm(folderPath, { recursive: true, force: true });
    } catch (err) {
        log.error(`${req.logCtx} - Не удалось удалить папку ${folderPath}: ${err.message}`);
    }
};
