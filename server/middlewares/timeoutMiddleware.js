export function requestTimeout(duration) {
    return (req, res, next) => {
        res.setTimeout(duration, () => {
            req.connectionTimeout = true;

            const error = new Error('Время выполнения запроса истекло');
            error.statusCode = 408;
            next(error);
        });
        
        next();
    };
};
