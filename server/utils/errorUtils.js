import mongoose from 'mongoose';
import { typeCheck } from './typeValidation.js';
import { fieldErrorMessages } from '../../shared/validation.js';
import { FILE_FIELD_MAP } from '../../shared/constants.js';

export const isCriticalError = (error) => {
    return error instanceof mongoose.Error ||
        error.name === 'MongoServerError' ||
        error.code === 'ECONNREFUSED';
};

export const createAppError = (statusCode, message, details = null) => {
    const error = new Error(message);
    error.isAppError = true;
    error.statusCode = statusCode;
    if (details) error.details = details;
    return error;
};

export const prepareAppErrorData = (err) => ({
    message: err.message,
    ...(typeCheck.object(err.details) ? err.details : { details: err.details })
});

export const parseValidationErrors = (err, entityType) => {
    const fieldErrors = {};

    for (const field in err.errors) {
        const error = err.errors[field]; // В валидаторе Mongoose используется полный путь поля

        if (field === 'globalFiles') {
            const fileFields = FILE_FIELD_MAP[entityType];
            const message = err.errors[field].message || 'Неизвестная ошибка файлового поля';
            fileFields.forEach(field => fieldErrors[field] = message);
        } else {
            // Если поле вложено field будет иметь вид дот-нотации ('delivery.shippingAddress.city')
            const fieldName = field.includes('.') ? field.split('.').pop() : field;
            const messages = fieldErrorMessages[entityType]?.[fieldName];

            if (!messages) {
                return {
                    unknownFieldError: createAppError(400, `Неизвестная ошибка поля: ${fieldName}`),
                    fieldErrors: null
                };
            }

            if (error.kind === 'unique') {
                fieldErrors[fieldName] =
                    messages.unique ||
                    fieldErrorMessages.DEFAULT;
            } else if (error.kind === 'user defined') {
                const errorType = error.message; // Тип ошибки можно передавать через сообщение

                if (errorType && errorType in messages) {
                    fieldErrors[fieldName] = messages[errorType];
                } else {
                    fieldErrors[fieldName] =
                        messages.default ||
                        fieldErrorMessages.DEFAULT;
                }
            } else {
                fieldErrors[fieldName] =
                    messages.mismatch ||
                    messages.default ||
                    fieldErrorMessages.DEFAULT;
            }
        }
    }

    if (Object.keys(fieldErrors).length > 0) {
        return { unknownFieldError: null, fieldErrors };
    }

    return { unknownFieldError: null, fieldErrors: null };
};
