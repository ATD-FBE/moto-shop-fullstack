import { existsSync, createReadStream } from 'fs';
import { LOG_ERROR_FILE_PATH } from '../config/paths.js';

export const handleErrorLogsRequest = (req, res, next) => {
    try {
        if (!existsSync(LOG_ERROR_FILE_PATH)) {
            return res.status(404).send('Файл логов ошибок пуст или не создан');
        }
    
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        
        const logStream = createReadStream(LOG_ERROR_FILE_PATH);
    
        logStream.on('error', (err) => {
            if (!res.headersSent) {
                return next(err);
            }

            logStream.destroy();
        });
    
        logStream.pipe(res);
    } catch (err) {
        next(err);
    }
};
