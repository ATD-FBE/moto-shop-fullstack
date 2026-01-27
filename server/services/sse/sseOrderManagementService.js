const clients = new Map(); // userId -> response

export const addClient = (userId, req, res) => {
    clients.set(userId, res);

    req.on('close', () => {
        clients.delete(userId);
    });
};

export const sendToAllClients = (data) => {
    clients.forEach((res, userId) => { // Порядок параметров в forEach для Map => (value, key, map)
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
};
