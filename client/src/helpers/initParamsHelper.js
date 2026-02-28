export const getInitFilterParams = (searchParams, filterOptions) => {
    const initFilterParams = new URLSearchParams();

    const getValidValue = (type, param, fallback, valueOptions) => {
        const value = searchParams?.get(param);
        if (value == null) return fallback;
    
        switch (type) {
            case 'number':
                const parsed = parseInt(value, 10);
                return isNaN(parsed) ? fallback : parsed;
            case 'date':
                return isNaN(new Date(value).getTime()) ? fallback : value;
            case 'boolean':
                return ['', 'true', 'false'].includes(value) ? value : fallback;
            case 'string':
                return valueOptions?.map(opt => opt.value).includes(value) ? value : fallback;
            default:
                return value;
        }
    };

    filterOptions.forEach(({
        type,
        minParamName,
        minLimit,
        maxParamName,
        maxLimit,
        paramName,
        defaultValue,
        valueOptions
    }) => {
        if (minParamName !== undefined) {
            const value = getValidValue(type, minParamName, minLimit);
            initFilterParams.append(minParamName, value);
        }
        if (maxParamName !== undefined) {
            const value = getValidValue(type, maxParamName, maxLimit);
            initFilterParams.append(maxParamName, value);
        }
        if (paramName !== undefined) {
            const value = getValidValue(type, paramName, defaultValue, valueOptions);
            initFilterParams.append(paramName, value);
        }
    });

    return initFilterParams;
};

export const getInitSortParam = (searchParams, sortOptions) => {
    const rawSort = searchParams?.get('sort');

    const isValid = sortOptions.some(opt =>
        rawSort === opt.dbField || rawSort === `-${opt.dbField}`
    );

    if (isValid) return rawSort;

    const defaultOption = sortOptions[0];
    const defaultField = defaultOption.dbField;
    const defaultOrder = defaultOption.defaultOrder || 'asc';

    return defaultOrder === 'desc' ? `-${defaultField}` : defaultField;
};

export const getInitPageParam = (searchParams) => {
    const rawPage = searchParams?.get('page');
    return Math.max(1, parseInt(rawPage, 10) || 1);
};

export const getInitLimitParam = (searchParams, limitOptions) => {
    const rawLimit = searchParams?.get('limit');
    return Math.max(1, parseInt(rawLimit, 10) || limitOptions[0]);
};

export const getInitCategoryParams = (searchParams, categoryMap) => {
    const category = searchParams.get('category')?.split('~').pop() || '';
    return categoryMap[category] ? category : '';
};
