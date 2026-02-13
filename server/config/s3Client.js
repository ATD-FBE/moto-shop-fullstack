import { S3Client } from "@aws-sdk/client-s3";
import config from './config.js';
import { SERVER_CONSTANTS } from '../../shared/constants.js';

const { STORAGE_TYPE } = SERVER_CONSTANTS;

let s3Client = null; // Инициализация только для S3

if (config.storage.type === STORAGE_TYPE.S3) {
    s3Client = new S3Client({
        region: config.storage.region,
        endpoint: config.storage.endpoint,
        credentials: {
            accessKeyId: config.storage.accessKey,
            secretAccessKey: config.storage.secretKey,
        },
        forcePathStyle: true, // Для путей в Backblaze
    });
}

export default s3Client;
