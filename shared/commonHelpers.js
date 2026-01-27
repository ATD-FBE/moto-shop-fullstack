import { CURRENCY_EPS } from './constants.js';

export const formatDateToLocalString = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatDateToMoscowLog = (date) => {
    const moscowDate = new Date(new Date(date).toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));

    const pad = (n) => String(n).padStart(2, '0');
    
    return `${moscowDate.getFullYear()}-${pad(moscowDate.getMonth() + 1)}-${pad(moscowDate.getDate())}` +
        ` ${pad(moscowDate.getHours())}:${pad(moscowDate.getMinutes())}:${pad(moscowDate.getSeconds())}` +
        ' MSK';
};

export const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ensureArray = (val) => {
    if (val === undefined) return [];
    return Array.isArray(val) ? val : [val];
};

export const trimSetByFilter = (originalSet, allowedSet) => {
    const trimmedSet = new Set(originalSet);
    let changed = false;

    for (const item of trimmedSet) {
        if (!allowedSet.has(item)) {
            trimmedSet.delete(item);
            changed = true;
        }
    }

    return [trimmedSet, changed];
};

// Формирование данных по скидке
export const getAppliedDiscountData = (productDiscount, customerDiscount) => {
    const effectiveDiscount = Math.max(productDiscount, customerDiscount);
    const discountSource = !effectiveDiscount
        ? 'none'
        : productDiscount > customerDiscount ? 'product' : 'customer';
        
    return {
        appliedDiscount: effectiveDiscount,
        appliedDiscountSource: discountSource
    };
};

export const isEqualCurrency = (a, b, eps = CURRENCY_EPS) => Math.abs(a - b) < eps;

export const applyDotNotationPatches = (obj, patches) => {
    patches.forEach(({ path, value }) => {
        const parts = [];

        path.split('.').forEach(part => {
            // RegExp: (ключ объекта или массив)([(индекс массива, если есть)])
            const match = part.match(/([^\[]+)(\[(\d+)\])?/);

            if (match) {
                const key = match[1]; // match[1] - ключ объекта или массив (не начинается с "[")
                parts.push(key);

                if (match[3] !== undefined) { // match[2] - ([...]), match[3] - индекс массива
                    parts.push(Number(match[3]));
                }
            }
        });

        let current = obj;

        for (let i = 0; i < parts.length; i++) {
            const isLast = i === parts.length - 1;
            const key = parts[i];

            if (isLast) {
                if (Array.isArray(current) && typeof key === 'number') { // Обработка массива
                    if (value === undefined) {
                        current.splice(key, 1); // Удаление элемента массива по значению undefined
                    } else {
                        current[key] = value; // Последнему элементу в пути присваивается значение
                    }
                } else { // Обработка объекта
                    current[key] = value; // Последнему элементу в пути присваивается значение
                }
            } else {
                const nextKey = parts[i + 1];

                if (typeof nextKey === 'number') {
                    if (!Array.isArray(current[key])) {
                        current[key] = []; // Создание пустого массива, если отсутствует
                    }
                } else {
                    if (typeof current[key] !== 'object' || current[key] === null) {
                        current[key] = {}; // Создание пустого объекта, если отсутствует
                    }
                }

                current = current[key]; // Следующий элемент вложения в объект или массив
            }
        }
    });
};

export const getLastFinancialsEventEntry = (history) => {
    for (let i = history.length - 1; i >= 0; i--) {
        if (!history[i].voided?.flag) {
            return history[i];
        }
    }
    
    return null; // Для удаления из истории на странице всех заказов
};

export const makeOrderItemQuantityFieldName = (productId) => `item-${productId}-quantity`;

export const getCustomerOrderDetailsPath = (orderNumber, orderId) =>
    `/customer/orders/${orderNumber ?? ''}~${orderId}`;
