import { isObject } from './normalizeUtils.js';

export function isArrayContentDifferent(arr1, arr2, options = { orderMatters: false }) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) return true;
    if (arr1.length !== arr2.length) return true;

    if (options.orderMatters) {
        return arr1.some((item, idx) => item !== arr2[idx]);
    }

    const set1 = new Set(arr1);
    return arr2.some(item => !set1.has(item));
};

export const isDateLike = (val) => {
    if (val == null) return false;
    if (val instanceof Date) return true;
    if (typeof val !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}/.test(val) && !isNaN(Date.parse(val)); // Проверка, что строка — ISO-дата
};

export const isDbDataModified = (oldData, newData, preserveNull = false) => {
    // Если null в новом значении удаляет поле (preserveNull = false), то его будущее значение undefined
    // preserveNull интерпретирует новое значение null как валидное (соответствует БД)
    if (oldData === undefined && newData === undefined) return false; // Ничего не было и не стало
    if (oldData === undefined && newData === null) return preserveNull; // null сохраняется или удаляет поле
    if (oldData === null && newData === null) return !preserveNull; // null удаляет поле — это изменение
    if (oldData === null && newData === undefined) return true; // null -> undefined = удаление

    // Одно из значений дата => сравнение дат
    const oldIsDate = isDateLike(oldData);
    const newIsDate = isDateLike(newData);

    if (oldIsDate || newIsDate) {
        if (!oldIsDate || !newIsDate) return true;

        const oldTime = new Date(oldData).getTime();
        const newTime = new Date(newData).getTime();
        if (isNaN(oldTime) || isNaN(newTime)) return true;

        return oldTime !== newTime;
    }

    // Одно из значений массив => глубокое сравнение массивов
    if (Array.isArray(oldData) || Array.isArray(newData)) {
        if (!Array.isArray(oldData) || !Array.isArray(newData)) return true;
        if (oldData.length !== newData.length) return true;
        return oldData.some((item, idx) => isDbDataModified(item, newData[idx]));
    }

    const oldIsObj = isObject(oldData);
    const newIsObj = isObject(newData);

    // Одно из значений примитив, второе - объект
    if (!oldIsObj && newIsObj) {
        // Старое значение undefined, а новое — объект => рекурсивная проверка свойств объекта
        // Mongoose удаляет пустые объекты => undefined === пустой объект => false (нет отличий)
        return oldData === undefined
            ? Object.values(newData).some(val => isDbDataModified(undefined, val))
            : true;
    }
    if (!newIsObj && oldIsObj) return true;

    // Оба значения объекты => рекурсивное сравнение по совмещённым ключам
    if (oldIsObj && newIsObj) {
        const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    
        for (const key of keys) {
            if (isDbDataModified(oldData[key], newData[key])) {
                return true;
            }
        }
        return false;
    }

    // Оба значения примитивы => сравнение напрямую
    return oldData !== newData;
};

export const collectDbChanges = (
    oldData,
    newData,
    path = '',
    fieldsPreserveNull = [],
    currencyFields = [],
    changes = []
) => {
    const oldIsObj = isObject(oldData);
    const newIsObj = isObject(newData);

    // Одно значение листовое, другое — объект => рекурсивный сбор изменений по свойствам объекта
    if (!oldIsObj && newIsObj) {
        for (const [key, val] of Object.entries(newData)) {
            collectDbChanges(
                undefined,
                val,
                path ? `${path}.${key}` : key,
                fieldsPreserveNull,
                currencyFields,
                changes
            );
        }
        return changes;
    }
    if (!newIsObj && oldIsObj) {
        for (const [key, val] of Object.entries(oldData)) {
            collectDbChanges(
                val,
                undefined,
                path ? `${path}.${key}` : key,
                fieldsPreserveNull,
                currencyFields,
                changes
            );
        }
        return changes;
    }

    // Оба значения объекты => рекурсивное сравнение их свойств
    if (oldIsObj && newIsObj) {
        const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

        for (const key of keys) {
            collectDbChanges(
                oldData[key],
                newData[key],
                path ? `${path}.${key}` : key,
                fieldsPreserveNull,
                currencyFields,
                changes
            );
        }
        return changes;
    }
    
    // Оба значения листовые (не объекты) и отличаются => заполнение массива изменений
    const preserveNull = fieldsPreserveNull.includes(path);
    const isCurrency = currencyFields.includes(path);

    if (isDbDataModified(oldData, newData, preserveNull)) {
        changes.push({
            field: path,
            oldValue: oldData,
            newValue: preserveNull ? newData : newData ?? undefined, // Сохранять или нет значение null
            ...(isCurrency && { currency: true })
        });
    }
    return changes;
};
