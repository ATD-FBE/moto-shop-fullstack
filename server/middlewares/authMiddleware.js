import jwt from 'jsonwebtoken';
import User from '../database/models/User.js';
import config from '../config/config.js';
import { checkTimeout } from './timeoutMiddleware.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { REQUEST_STATUS } from '../../shared/constants.js';

export const disableCache = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
};

export const verifyAuth = async (req, res, next) => {
    try {
        const accessToken = req.cookies.accessToken;

        if (!accessToken) {
            return safeSendResponse(res, 401, { message: 'Токен доступа отсутствует' });
        }
        
        req.user = jwt.verify(accessToken, config.jwt.accessSecretKey);
        next();
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return safeSendResponse(res, 401, { message: 'Срок действия токена доступа истёк' });
        }
        if (err instanceof jwt.JsonWebTokenError) {
            return safeSendResponse(res, 401, { message: 'Неверный токен доступа' });
        }
        if (err instanceof jwt.NotBeforeError) {
            return safeSendResponse(res, 401, { message: 'Токен доступа ещё не активен' });
        }
        
        next(err);
    }
};

export const verifyUser = async (req, res, next) => {
    try {
        const dbUser = await User.findById(req.user?._id);
        checkTimeout(req);

        if (!dbUser) {
            return safeSendResponse(res, 410, {
                message: 'Пользователь не найден',
                reason: REQUEST_STATUS.USER_GONE
            });
        }

        req.dbUser = dbUser;
        next();
    } catch (err) {
        next(err);
    }
};

export const verifyRole = (...requiredRoles) => (req, res, next) => {
    if (!requiredRoles.includes(req.dbUser.role)) {
        return safeSendResponse(res, 403, {
            message: 'Запрещено: недостаточно прав',
            reason: REQUEST_STATUS.DENIED
        });
    }

    next();
};


/// Опциональные версии мидлвэаров проверки прав и доступа ///

export const optionalAuth = async (req, res, next) => {
    try {
        const accessToken = req.cookies.accessToken;

        if (accessToken) {
            req.user = jwt.verify(accessToken, config.jwt.accessSecretKey);
        }
        
        next();
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return safeSendResponse(res, 401, { message: 'Срок действия токена доступа истёк' });
        }
        if (err instanceof jwt.JsonWebTokenError) {
            return safeSendResponse(res, 401, { message: 'Неверный токен доступа' });
        }
        if (err instanceof jwt.NotBeforeError) {
            return safeSendResponse(res, 401, { message: 'Токен доступа ещё не активен' });
        }

        next(err);
    }
};

export const optionalUser = async (req, res, next) => {
    if (!req.user) {
        return next();
    }

    try {
        const dbUser = await User.findById(req.user._id);
        checkTimeout(req);

        if (!dbUser) {
            return safeSendResponse(res, 410, {
                message: 'Пользователь не найден',
                reason: REQUEST_STATUS.USER_GONE
            });
        }

        req.dbUser = dbUser;
        next();
    } catch (err) {
        next(err);
    }
};

export const optionalRole = (...requiredRoles) => (req, res, next) => {
    if (!req.dbUser) {
        return next();
    }

    if (!requiredRoles.includes(req.dbUser.role)) {
        return safeSendResponse(res, 403, {
            message: 'Запрещено: недостаточно прав',
            reason: REQUEST_STATUS.DENIED
        });
    }

    next();
};
