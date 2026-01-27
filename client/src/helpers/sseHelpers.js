import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { PROD_ENV, PROTOCOL, HOST, SERVER_PORT } = CLIENT_CONSTANTS;

export const getSseUrl = (path) =>
    PROD_ENV
        ? `/sse/${path}`
        : `${PROTOCOL}://${HOST}:${SERVER_PORT}/sse/${path}`;
