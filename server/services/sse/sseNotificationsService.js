const clients = new Map(); // userId -> response

export const addClient = (userId, req, res) => {
    clients.set(userId, res);

    req.on('close', () => {
        clients.delete(userId);
    });
};

export const sendToClients = (userObjectIds, data) => {
    userObjectIds.forEach(userObjectId => {
        const res = clients.get(userObjectId.toString());

        if (res) {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
    });
};
