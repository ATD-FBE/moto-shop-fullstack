import jwt from 'jsonwebtoken';
import config from '../config/config.js';

export const generateToken = (user, type) => {
    const tokenTypeData = {
        'access': {
            key: config.jwt.accessSecretKey,
            time: '1h'
            //time: '10s'
        },
        'refresh': {
            key: config.jwt.refreshSecretKey,
            time: '7d'
            //time: '30s'
        }
    };

    if (!Object.keys(tokenTypeData).includes(type)) {
        throw new Error('Неверный тип токена');
    }

    const secretKey = tokenTypeData[type].key;
    if (!secretKey) throw new Error(`Отсутствует секретный ключ для ${type} токена`);

    const payload = {
        _id: user._id,
        role: user.role
    };
    const options = { expiresIn: tokenTypeData[type].time };

    try {
        return jwt.sign(payload, secretKey, options);
    } catch (err) {
        throw new Error('Не удалось сгенерировать токен');
    }
};

export const getTokenExpiryFromCookie = (req, type) => {
    const token = req.cookies[`${type}Token`];
    if (!token) return 0;

    const decoded = jwt.decode(token);
    return decoded?.exp ? decoded.exp * 1000 : 0; // exp в секундах, умножаем на 1000 для мс
};
