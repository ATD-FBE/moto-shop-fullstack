import * as sseNotifications from '../services/sse/sseNotificationsService.js';
import * as sseOrderManagement from '../services/sse/sseOrderManagementService.js';

export const handleSseNotificationsRequest = async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Отправляет заголовки сразу после соединения

    const userId = req.dbUser._id.toString();
    sseNotifications.addClient(userId, req, res);

    // Если flushHeaders не сработает, то ping заставит браузер считать соединение SSE активным сразу
    res.write('event: ping\ndata: {}\n\n'); 
};

export const handleSseOrderManagementRequest = async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Отправляет заголовки сразу после соединения

    const userId = req.dbUser._id.toString();
    sseOrderManagement.addClient(userId, req, res);

    // Если flushHeaders не сработает, то ping заставит браузер считать соединение SSE активным сразу
    res.write('event: ping\ndata: {}\n\n'); 
};
