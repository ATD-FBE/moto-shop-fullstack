import mongoose from 'mongoose';
import { fieldErrorMessages } from '../../shared/fieldRules.js';

const baseTypeChecks = {
    string: val => typeof val === 'string',

    number: val =>
        ['string', 'number'].includes(typeof val) &&
        val !== '' &&
        isFinite(Number(val)),

    boolean: val =>
        typeof val === 'boolean' ||
        (typeof val === 'string' && (val === 'true' || val === 'false')),

    emptyableBoolean: val =>
        val === '' ||
        typeof val === 'boolean' ||
        (typeof val === 'string' && (val === 'true' || val === 'false')),

    array: Array.isArray,

    arrayOf: (arr, type, check) => {
        if (!Array.isArray(arr)) return false;
        if (!arr.length) return true;

        const validator = check[type];
        if (!validator) return false;

        return arr.every(item => validator(item));
    },

    object: val =>
        val !== null &&
        !Array.isArray(val) &&
        typeof val === 'object',

    date: val =>
        (typeof val === 'string' || val instanceof Date) &&
        !isNaN(new Date(val).getTime()),

    objectId: val => mongoose.Types.ObjectId.isValid(val),

    nullableObjectId: val => val === null || mongoose.Types.ObjectId.isValid(val)
};

const makeOptionalCheck = (checkFn) => (val, ...args) => val === undefined || checkFn(val, ...args);

const makeTypeCheck = (checks) => {
    const optionalChecks = {};

    for (const [key, fn] of Object.entries(checks)) {
        optionalChecks[key] = makeOptionalCheck(fn);
    }

    return {
        ...checks,
        optional: optionalChecks
    };
};

export const typeCheck = makeTypeCheck(baseTypeChecks);

export const validateInputTypes = (inputTypeMap, entityType = 'no_entity') => {
    const invalidInputKeys = [];
    const fieldErrors = {};

    for (const [key, { value, type, elemType, optional, form = false }] of Object.entries(inputTypeMap)) {
        const validator = optional ? typeCheck.optional[type] : typeCheck[type];
        const isValid = type === 'arrayOf'
            ? validator?.(value, elemType, typeCheck) ?? false
            : validator?.(value) ?? false;
        if (isValid) continue;

        if (form) {
            fieldErrors[key] =
                fieldErrorMessages[entityType]?.[key]?.mismatch ||
                fieldErrorMessages[entityType]?.[key]?.default ||
                fieldErrorMessages.DEFAULT;
        } else {
            invalidInputKeys.push(key);
        }
    }

    return { invalidInputKeys, fieldErrors };
};
