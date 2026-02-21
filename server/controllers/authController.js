import jwt from 'jsonwebtoken';
import User from '../database/models/User.js';
import config from '../config/config.js';
import { checkTimeout } from '../middlewares/timeoutMiddleware.js';
import { getUserData, getSessionData } from '../services/authService.js';
import { generateToken } from '../utils/token.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { runInTransaction } from '../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../utils/errorUtils.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import { getTokenExpiryFromCookie } from '../utils/token.js';
import { normalizeInputDataToNull } from '../utils/normalizeUtils.js';
import { isDbDataModified } from '../utils/compareUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { validationRules, fieldErrorMessages } from '../../shared/fieldRules.js';
import { DELIVERY_METHOD, SERVER_CONSTANTS } from '../../shared/constants.js';

const { TOKEN_COOKIE_OPTIONS, ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } = SERVER_CONSTANTS;

/// Регистрация ///
export const handleAuthRegistrationRequest = async (req, res, next) => {
    // Предварительная проверка формата данных
    const { formFields, guestCart } = req.body ?? {};
    const { name, email, password, adminRegCode } = formFields ?? {};

    const inputTypeMap = {
        formFields: { value: formFields, type: 'object' },
        guestCart: { value: guestCart, type: 'arrayOf', elemType: 'object' },
        name: { value: name, type: 'string', form: true },
        email: { value: email, type: 'string', form: true },
        password: { value: password, type: 'string', form: true },
        adminRegCode: { value: adminRegCode, type: 'string', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'auth');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    for (const { id, quantity } of guestCart) {
        if (!typeCheck.objectId(id) || !Number.isInteger(quantity) || quantity < 0) {
            return safeSendResponse(res, 400, { message: 'Неверный формат данных в guestCart' });
        }
    }

    // Создание документа в базе MongoDB
    const isAdmin = adminRegCode && adminRegCode === config.adminRegCode;
    const role = isAdmin ? 'admin' : 'customer';

    try {
        const { newDbUser, sessionData } = await runInTransaction(async (session) => {
            const newDbUser = new User({
                name: name.trim(),
                email: email.trim(),
                password,
                role,
                ...(role === 'customer' && {
                    notifications: [],
                    discount: 0
                })
            });

            const sessionData = await getSessionData(newDbUser, guestCart);
            checkTimeout(req);
    
            await newDbUser.save({ session });
            checkTimeout(req);

            return { newDbUser, sessionData };
        });

        // Генерация токенов доступа и обновления
        const now = Date.now();
        const accessTokenExp = now + ACCESS_TOKEN_MAX_AGE;
        const refreshTokenExp = now + REFRESH_TOKEN_MAX_AGE;

        const accessToken = generateToken(newDbUser, 'access');
        res.cookie('accessToken', accessToken, { ...TOKEN_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE });

        const refreshToken = generateToken(newDbUser, 'refresh');
        res.cookie('refreshToken', refreshToken, { ...TOKEN_COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });
        
        // Отправка ответа клиенту
        safeSendResponse(res, 201, {
            message: 'Регистрация прошла успешно',
            accessTokenExp,
            refreshTokenExp,
            ...sessionData
        });
    } catch (err) {
        // Обработка ошибок валидации полей при сохранении в MongoDB
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'auth');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Авторизация ///
export const handleAuthLoginRequest = async (req, res, next) => {
    // Предварительная проверка формата данных
    const { formFields, guestCart } = req.body ?? {};
    const { name, password, rememberMe } = formFields ?? {};

    const inputTypeMap = {
        formFields: { value: formFields, type: 'object' },
        guestCart: { value: guestCart, type: 'arrayOf', elemType: 'object' },
        name: { value: name, type: 'string', form: true },
        password: { value: password, type: 'string', form: true },
        rememberMe: { value: rememberMe, type: 'boolean' }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'auth');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    for (const { id, quantity } of guestCart) {
        if (!typeCheck.objectId(id) || !Number.isInteger(quantity) || quantity < 0) {
            return safeSendResponse(res, 400, { message: 'Неверный формат данных в guestCart' });
        }
    }

    // Валидация полей
    const INVALID_AUTH_MSG = 'Некорректные данные при авторизации';
    const prepDbFields = {
        name: name.trim(),
        password
    };
    
    Object.entries(prepDbFields).forEach(([field, value]) => {
        const isValid = validationRules.auth[field].test(value);

        if (!isValid) {
            fieldErrors[field] =
                fieldErrorMessages.auth[field]?.login ||
                fieldErrorMessages.DEFAULT;
        }
    });

    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(res, 422, { message: INVALID_AUTH_MSG, fieldErrors });
    }

    // Проверка данных пользователя в базе MongoDB
    try {
        const { dbUser, sessionData } = await runInTransaction(async (session) => {
            // Поиск пользователя
            const dbUser = await User.findOne({ name: prepDbFields.name }).session(session);
            checkTimeout(req);

            if (!dbUser) {
                fieldErrors.name = fieldErrorMessages.auth.name.login;
                throw createAppError(401, INVALID_AUTH_MSG, { fieldErrors });
            }

            // Проверка пароля
            const isPasswordCorrect = await dbUser.comparePassword(password);
            checkTimeout(req);

            if (!isPasswordCorrect) {
                fieldErrors.password = fieldErrorMessages.auth.password.login;
                throw createAppError(401, INVALID_AUTH_MSG, { fieldErrors });
            }

            // Получение данных сессии
            const sessionData = await getSessionData(dbUser, guestCart);
            checkTimeout(req);

            if (sessionData.cartWasMerged) {
                await dbUser.save({ session });
                checkTimeout(req);
            }

            return { dbUser, sessionData };
        });

        // Генерация токенов доступа
        const now = Date.now();
        const accessTokenExp = now + ACCESS_TOKEN_MAX_AGE;
        const refreshTokenExp = rememberMe ? now + REFRESH_TOKEN_MAX_AGE : 0;

        const accessToken = generateToken(dbUser, 'access');
        res.cookie('accessToken', accessToken, { ...TOKEN_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE });

        if (rememberMe) {
            const refreshToken = generateToken(dbUser, 'refresh');
            res.cookie('refreshToken', refreshToken, {
                ...TOKEN_COOKIE_OPTIONS,
                maxAge: REFRESH_TOKEN_MAX_AGE
            });
        } else {
            res.clearCookie('refreshToken', TOKEN_COOKIE_OPTIONS);
        }

        safeSendResponse(res, 200, {
            message: 'Авторизация прошла успешно',
            accessTokenExp,
            refreshTokenExp,
            ...sessionData
        });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Изменение данных пользователя ///
export const handleAuthUserUpdateRequest = async (req, res, next) => {
    // Предварительная проверка формата данных
    const { newName, newEmail, currentPassword, newPassword } = req.body ?? {};

    if ([newName, newEmail, newPassword].every(field => field === undefined)) {
        return safeSendResponse(res, 204);
    }

    const inputTypeMap = {
        newName: { value: newName, type: 'string', optional: true, form: true },
        newEmail: { value: newEmail, type: 'string', optional: true, form: true },
        currentPassword: { value: currentPassword, type: 'string', optional: true, form: true },
        newPassword: { value: newPassword, type: 'string', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'auth');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(res, 422, { message: 'Неверный формат данных', fieldErrors });
    }
    
    const dbUser = req.dbUser;
    const dbUserBackup = {
        name: dbUser.name,
        email: dbUser.email
    };
    const prepDbFields = {
        newName: newName?.trim(),
        newEmail: newEmail?.trim(),
        currentPassword,
        newPassword
    };
    const updatedFormFields = [];

    // Апдейт документа в базе MongoDB
    try {
        const { userData } = await runInTransaction(async (session) => {
            // Валидация пароля
            if (newPassword !== undefined) {
                if (validationRules.auth.newPassword.test(newPassword)) {
                    if (
                        currentPassword === undefined ||
                        !validationRules.auth.currentPassword.test(currentPassword)
                    ) {
                        fieldErrors.currentPassword =
                            fieldErrorMessages.auth.currentPassword?.default ||
                            fieldErrorMessages.DEFAULT;
                    } else {
                        const isPasswordCorrect = await dbUser.comparePassword(currentPassword);
                        checkTimeout(req);
        
                        if (!isPasswordCorrect) {
                            fieldErrors.currentPassword =
                                fieldErrorMessages.auth.currentPassword?.default ||
                                fieldErrorMessages.DEFAULT;
                        } else if (newPassword === currentPassword) {
                            fieldErrors.newPassword =
                                fieldErrorMessages.auth.newPassword?.duplicate ||
                                fieldErrorMessages.DEFAULT;
                        } else {
                            dbUser.password = newPassword;
                            updatedFormFields.push('newPassword');
                        }
                    }
                } else {
                    fieldErrors.newPassword =
                        fieldErrorMessages.auth.newPassword?.default ||
                        fieldErrorMessages.DEFAULT;
                }
            }

            // Предварительное обновление остальных полей
            const dbFieldToFormFieldMap = {
                name: 'newName',
                email: 'newEmail'
            };

            for (const [dbField, formField] of Object.entries(dbFieldToFormFieldMap)) {
                const value = prepDbFields[formField];
                if (value === undefined) continue;

                if (dbUser[dbField] === value) {
                    fieldErrors[formField] =
                        fieldErrorMessages.auth[formField]?.duplicate ||
                        fieldErrorMessages.DEFAULT;
                    continue;
                }

                dbUser[dbField] = value;
                updatedFormFields.push(formField);
            }

            // Сохранение пользователя
            try {
                await dbUser.save({ session }); // Первая попытка сохранения
                checkTimeout(req);
            } catch (err) {
                // Обработка ошибок валидации полей при сохранении в MongoDB
                if (err.name === 'ValidationError') {
                    for (const dbField in err.errors) {
                        const formField = dbFieldToFormFieldMap[dbField];
                        
                        if (!formField) {
                            throw createAppError(400, `Некорректное значение поля: ${dbField}`);
                        }
                        
                        const errorMessageType = err.errors[dbField].kind === 'unique' ? 'unique' : 'default';
                        fieldErrors[formField] =
                            fieldErrorMessages.auth[formField]?.[errorMessageType] ||
                            fieldErrorMessages.DEFAULT;
        
                        if (dbUserBackup.hasOwnProperty(dbField)) {
                            dbUser[dbField] = dbUserBackup[dbField]; // Восстановление старого значения
                            updatedFormFields.splice(updatedFormFields.indexOf(formField), 1);
                        }
                    }

                    if (updatedFormFields.length > 0) {
                        await dbUser.save({ session }); // Вторая попытка сохранения, исключая поля с ошибками
                        checkTimeout(req);
                    }
                } else {
                    throw err;
                }
            }

            const userData = await getUserData(dbUser);
            checkTimeout(req);

            return { userData };
        });
        

        // Отправка ответа клиенту
        const { statusCode, message } = (() => {
            const hasErrors  = Object.keys(fieldErrors).length > 0;
            const hasUpdates = updatedFormFields.length > 0;
        
            switch (true) {
                case hasErrors && !hasUpdates:
                    return { statusCode: 422, message: 'Ошибки в данных. Изменения не применены' };
                case hasErrors && hasUpdates:
                    return { statusCode: 207, message: 'Данные пользователя частично обновлены' };
                case !hasErrors && hasUpdates:
                    return { statusCode: 200, message: 'Данные пользователя обновлены' };
                default: // !hasErrors && !hasUpdates
                    return { statusCode: 204 };
            }
        })();
        
        safeSendResponse(res, statusCode, {
            ...(statusCode !== 204 && {
                message,
                fieldErrors
            }),
            ...([200, 207].includes(statusCode) && {
                updatedFormFields,
                updatedUser: userData
            })
        });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Загрузка данных сессии пользователя ///
export const handleAuthSessionRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const { guestCart } = req.body ?? {};

    if (!typeCheck.arrayOf(guestCart, 'object', typeCheck)) {
        return safeSendResponse(res, 400, { message: 'Неверный формат данных: guestCart' });
    }

    for (const { id, quantity } of guestCart) {
        if (!typeCheck.objectId(id) || !Number.isInteger(quantity) || quantity < 0) {
            return safeSendResponse(res, 400, { message: 'Неверный формат данных в guestCart' });
        }
    }

    try {
        const { sessionData } = await runInTransaction(async (session) => {
            const sessionData = await getSessionData(dbUser, guestCart);
            checkTimeout(req);

            if (sessionData.cartWasMerged) {
                await dbUser.save({ session });
                checkTimeout(req);
            }

            return { sessionData };
        });

        const accessTokenExp = getTokenExpiryFromCookie(req, 'access');
        const refreshTokenExp = getTokenExpiryFromCookie(req, 'refresh');

        const message = 'Данные сессии пользователя успешно загружены' +
            (sessionData.cartWasMerged
                ? '. Корзины успешно объединены, приоритет количества товаров — у гостевой.'
                : '');

        safeSendResponse(res, 200, { message, accessTokenExp, refreshTokenExp, ...sessionData });
    } catch (err) {
        next(err);
    }
};

/// Проверка токена доступа ///
export const handleAuthCheckRequest = (req, res) => {
    safeSendResponse(res, 200, { message: 'Токен доступа валидный' });
};

/// Обновление токена доступа ///
export const handleAuthRefreshRequest = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        
        if (!refreshToken) {
            return safeSendResponse(res, 401, { message: 'Токен обновления отсутствует' });
        }

        const accessTokenExp = Date.now() + ACCESS_TOKEN_MAX_AGE;

        const user = jwt.verify(refreshToken, config.jwt.refreshSecretKey);
        const accessToken = generateToken(user, 'access');
        res.cookie('accessToken', accessToken, { ...TOKEN_COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE });
        
        safeSendResponse(res, 200, { message: 'Токен доступа обновлён', accessTokenExp });
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return safeSendResponse(res, 401, { message: 'Срок действия токена обновления истёк' });
        }
        if (err instanceof jwt.JsonWebTokenError) {
            return safeSendResponse(res, 401, { message: 'Неверный токен обновления' });
        }
        if (err instanceof jwt.NotBeforeError) {
            return safeSendResponse(res, 401, { message: 'Токен обновления ещё не активен' });
        }

        next(err);
    }
};

/// Загрузка настроек заказа ///
export const handleAuthCheckoutPrefsRequest = async (req, res) => {
    safeSendResponse(res, 200, {
        message: 'Настройки заказа успешно загружены',
        checkoutPrefs: req.dbUser.checkoutPrefs
    });
};

/// Изменение настроек заказа ///
export const handleAuthCheckoutPrefsUpdateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    // Предварительная проверка формата данных
    const {
        firstName, lastName, middleName, email, phone,
        deliveryMethod, allowCourierExtra,
        region, district, city, street, house, apartment, postalCode,
        defaultPaymentMethod
    } = req.body ?? {};

    const inputTypeMap = {
        firstName: { value: firstName, type: 'string', optional: true, form: true },
        lastName: { value: lastName, type: 'string', optional: true, form: true },
        middleName: { value: middleName, type: 'string', optional: true, form: true },
        email: { value: email, type: 'string', optional: true, form: true },
        phone: { value: phone, type: 'string', optional: true, form: true },
        deliveryMethod: { value: deliveryMethod, type: 'string', optional: true, form: true },
        allowCourierExtra: { value: allowCourierExtra, type: 'boolean', optional: true, form: true },
        region: { value: region, type: 'string', optional: true, form: true },
        district: { value: district, type: 'string', optional: true, form: true },
        city: { value: city, type: 'string', optional: true, form: true },
        street: { value: street, type: 'string', optional: true, form: true },
        house: { value: house, type: 'string', optional: true, form: true },
        apartment: { value: apartment, type: 'string', optional: true, form: true },
        postalCode: { value: postalCode, type: 'string', optional: true, form: true },
        defaultPaymentMethod: { value: defaultPaymentMethod, type: 'string', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'checkout');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Проверка на согласованность данных для метода курьерской доставки
    const isCourierMethod = deliveryMethod === DELIVERY_METHOD.COURIER;
    const isAllowCourierExtra = allowCourierExtra !== undefined;
    
    if ((isCourierMethod && !isAllowCourierExtra) || (!isCourierMethod && isAllowCourierExtra)) {
        return safeSendResponse(res, 400, { message: 'Несогласованные данные для метода доставки' });
    }

    // Создание и форматирование настроек заказа
    const oldCheckoutPrefs = dbUser.checkoutPrefs.toObject();
    const newCheckoutPrefs = normalizeInputDataToNull({
        customerInfo: { firstName, lastName, middleName, email, phone },
        delivery: {
            deliveryMethod,
            allowCourierExtra,
            shippingAddress: deliveryMethod === DELIVERY_METHOD.SELF_PICKUP
                ? {}
                : { region, district, city, street, house, apartment, postalCode }
        },
        financials: { defaultPaymentMethod }
    });

    // Проверка на изменение полей
    if (!isDbDataModified(oldCheckoutPrefs, newCheckoutPrefs)) {
        return safeSendResponse(res, 204);
    }
    
    try {
        // Установка и сохранение настроек в базе MongoDB с удалением null-полей и пустых объектов
        await runInTransaction(async (session) => {
            dbUser.checkoutPrefs = newCheckoutPrefs;
            await dbUser.save({ session });
            checkTimeout(req);
        });

        safeSendResponse(res, 200, { message: 'Настройки заказа обновлены' });
    } catch (err) {
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'checkout');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Выход из сессии ///
export const handleAuthLogoutRequest = async (req, res, next) => {
    try {
        res.clearCookie('accessToken', TOKEN_COOKIE_OPTIONS);
        res.clearCookie('refreshToken', TOKEN_COOKIE_OPTIONS);
        
        safeSendResponse(res, 200, { message: 'Выход выполнен' });
    } catch (err) {
        next(err);
    }
};
