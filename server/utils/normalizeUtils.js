export const isObject = (val) =>
    typeof val === 'object' && val !== null && !Array.isArray(val) && !(val instanceof Date);

export const normalizeInputDataToNull = (data) => {
    if (data == null) return null;
    if (typeof data === 'string') return data.trim() || null;
    if (data instanceof Date) return new Date(data);
    if (Array.isArray(data)) return data.map(normalizeInputDataToNull);

    if (typeof data === 'object') {
        return Object.fromEntries(
            Object.entries(data)
                .filter(([key]) => Object.hasOwn(data, key))
                .map(([key, val]) => [key, normalizeInputDataToNull(val)])
        );
    }
    
    return data;
};

export const dotNotationToObject = (flatObj) => {
    const result = {};

    for (const [key, value] of Object.entries(flatObj)) {
        const parts = key.split('.');
        let target = result;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!target[part]) target[part] = {};
            target = target[part];
        }

        target[parts.at(-1)] = value;
    }

    return result;
};

export const deepMergeNewNullable = (target, source) => {
    if (target == null || typeof target !== 'object') {
        if (typeof source === 'object' && source !== null) return deepMergeNewNullable({}, source);
        return source;
    }
    if (source == null || typeof source !== 'object') return source;
    if (source instanceof Date) return new Date(source);
    if (Array.isArray(source)) return [...source];

    // target и source - объекты
    const keys = new Set([...Object.keys(target), ...Object.keys(source)]);
    const resultObj = {};

    for (const key of keys) {
        const tVal = target[key];
        const sVal = source[key];

        if (isObject(sVal)) {
            resultObj[key] = deepMergeNewNullable(tVal || {}, sVal);
        } else if (sVal !== undefined) {
            resultObj[key] = sVal;
        } else if (tVal !== undefined) {
            resultObj[key] = tVal;
        }
    }

    return resultObj;
};
