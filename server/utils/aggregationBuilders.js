import mongoose from 'mongoose';
import { escapeRegExp } from '../../shared/commonHelpers.js';
import { SEARCH_TYPES, MAX_DATE_TS, DEFAULT_SEARCH_TYPE } from '../../shared/constants.js';
import log from './logger.js';

export const buildSearchMatch = (search, allowedSearchFields, searchType) => {
    const searchMatch = {};
    const rawSearch = typeof search === 'string' ? search.trim() : '';

    if (!rawSearch) return searchMatch;

    if (mongoose.Types.ObjectId.isValid(rawSearch)) {
        searchMatch._id = mongoose.Types.ObjectId.createFromHexString(rawSearch);
        return searchMatch;
    }

    switch (searchType) {
        case SEARCH_TYPES.REGEX: // Поиск с регулярным выражением (перебор всех документов)
            const safeSearch = escapeRegExp(rawSearch);
            searchMatch.$or = allowedSearchFields.map(field => ({
                [field]: { $regex: safeSearch, $options: 'i' }
            }));
            break;

        case SEARCH_TYPES.TEXT: // Индексированный текстовый поиск (по хотя бы одному слову целиком)
            searchMatch.$text = { $search: rawSearch };
            break;

        default:
            log.warn(`Неверный тип поиска: ${searchType}`);
    }

    return searchMatch;
};

export const buildFilterMatch = (query, filterOptions) => {
    const timeZoneOffset = parseInt(query.timeZoneOffset, 10) || 0; // Смещение времени в минутах
    const filterMatch = {};

    filterOptions.forEach(({
        dbField,
        type,
        minParamName,
        maxParamName,
        paramName,
        minLimit,
        maxLimit,
        minLimitUTC,
        maxLimitUTC,
        defaultValue,
        valueOptions
    }) => {
        switch (type) {
            case 'number': {
                const minValue = query[minParamName];
                const maxValue = query[maxParamName];
                const minValueNum = minValue !== '' ? Number(minValue) : -Infinity;
                const maxValueNum = maxValue !== '' ? Number(maxValue) : Infinity;
                const minLimitNum = minLimit !== '' ? Number(minLimit) : -Infinity;
                const maxLimitNum = maxLimit !== '' ? Number(maxLimit) : Infinity;

                if (!isNaN(minValueNum) && minValueNum > minLimitNum) {
                    filterMatch[dbField] = { $gte: minValueNum };
                }

                if (!isNaN(maxValueNum) && maxValueNum < maxLimitNum) {
                    filterMatch[dbField] = { ...filterMatch[dbField], $lte: maxValueNum };
                }

                if (
                    filterMatch[dbField]?.$gte !== undefined &&
                    filterMatch[dbField]?.$lte !== undefined &&
                    filterMatch[dbField].$gte > filterMatch[dbField].$lte
                ) {
                    delete filterMatch[dbField];
                }

                break;
            }

            case 'date': {
                const minDate = new Date(query[minParamName]);
                const maxDate = new Date(query[maxParamName]);
                const minLimitDateUTC = minLimitUTC !== '' ? new Date(minLimitUTC) : new Date(-MAX_DATE_TS);
                const maxLimitDateUTC = maxLimitUTC !== '' ? new Date(maxLimitUTC) : new Date(MAX_DATE_TS);

                if (!isNaN(minDate.getTime())) {
                    minDate.setUTCHours(0, 0, 0, 0); // Установка начала дня для даты
                    minDate.setMinutes(minDate.getMinutes() + timeZoneOffset); // Смещение времени даты

                    if (minDate > minLimitDateUTC) {
                        filterMatch[dbField] = { $gte: minDate };
                    }
                }

                if (!isNaN(maxDate.getTime())) {
                    maxDate.setUTCHours(23, 59, 59, 999); // Установка конца дня для даты
                    maxDate.setMinutes(maxDate.getMinutes() + timeZoneOffset); // Смещение времени даты

                    if (maxDate < maxLimitDateUTC) {
                        filterMatch[dbField] = { ...(filterMatch[dbField] ?? {}), $lte: maxDate };
                    }
                }

                if (
                    filterMatch[dbField]?.$gte !== undefined &&
                    filterMatch[dbField]?.$lte !== undefined &&
                    filterMatch[dbField].$gte > filterMatch[dbField].$lte
                ) {
                    delete filterMatch[dbField];
                }

                break;
            }

            case 'boolean': {
                const value = query[paramName];

                if (value === 'true') {
                    filterMatch[dbField] = true;
                } else if (value === 'false') {
                    filterMatch[dbField] = { $ne: true };
                } else if (value !== '') {
                    if (defaultValue === 'true') {
                        filterMatch[dbField] = true;
                    } else if (defaultValue === 'false') {
                        filterMatch[dbField] = { $ne: true };
                    }
                }

                break;
            }

            case 'string': {
                const value = query[paramName];
                const valueOption = valueOptions.find(opt => opt.value === value) || {};

                if (valueOption.matches) {
                    filterMatch[dbField] = { $in: valueOption.matches };
                } else if (valueOption.value) {
                    filterMatch[dbField] = valueOption.value;
                } else if (defaultValue) {
                    filterMatch[dbField] = defaultValue;
                }

                break;
            }

            default:
                log.warn(`Неизвестный тип поля для фильтрации: ${type}`);
        }
    });

    return filterMatch;
};

export const parseSortParam = (sortParam, sortOptions) => {
    const allowedSortFields = sortOptions.map(opt => opt.dbField);
    const defaultSortField = sortOptions[0].dbField;
    const defaultSortOrder = sortOptions[0].defaultOrder === 'asc' ? 1 : -1;

    const rawSort = typeof sortParam === 'string' ? sortParam : '';
    const isDescending = rawSort.startsWith('-');
    const rawSortOrder = isDescending ? -1 : 1;
    const rawSortField = isDescending ? rawSort.slice(1) : rawSort;
    const isRawSortFieldAllowed = allowedSortFields.includes(rawSortField);

    const sortField = isRawSortFieldAllowed ? rawSortField : defaultSortField;
    const sortOrder = isRawSortFieldAllowed ? rawSortOrder : defaultSortOrder;

    return { sortField, sortOrder };
};

export const buildSortPipeline = (sortField, sortOrder, sortOptions) => {
    const pipeline = [];

    // Определение того, нужно ли сортировать с учётом регистра
    const isCaseInsensitiveSortField = sortOptions.some(
        opt => opt.dbField === sortField && opt.caseInsensitive
    );

    if (isCaseInsensitiveSortField) {
        pipeline.push({ // Создание поля для приведения к нижнему регистру
            $addFields: { loweredSortField: { $toLower: `$${sortField}` } }
        });
        pipeline.push({ $sort: { loweredSortField: sortOrder } }); // Сортировка (1 — ASC, -1 — DESC)
    } else {
        pipeline.push({ $sort: { [sortField]: sortOrder } }); // Сортировка (1 — ASC, -1 — DESC)
    }

    return pipeline;
};

export const buildPaginatedPipeline = (query, sortOptions, pageLimitOptions) => {
    // Настройка сортировки
    const { sortField, sortOrder } = parseSortParam(query.sort, sortOptions);
    const pipeline = buildSortPipeline(sortField, sortOrder, sortOptions);

    // Настройка пагинации
    const defaultPageLimit = pageLimitOptions[0];
    const page = Math.max(parseInt(query.page, 10) || 1, 1);

    const limit = Math.max(parseInt(query.limit, 10) || defaultPageLimit, 1); // Кол-во загруж. рез-тов
    const skip = (page - 1) * limit; // Количество пропускаемых результатов

    // Формирование пайплайна пагинированных данных
    pipeline.push({ $skip: skip }); // Пагинация - пропуск результатов предыдущих страниц
    pipeline.push({ $limit: limit }); // Пагинация - количество результатов на странице

    return pipeline;
};

export const buildOrderedFiltersPipeline = ({
    computedFields = [],
    searchMatch = {},
    filterMatch = {},
    extraFilters = [],
    searchType = DEFAULT_SEARCH_TYPE
}) => {
    const searchMatchStage = Object.keys(searchMatch).length > 0 ? [{ $match: searchMatch }] : [];
    const filterMatchStage = Object.keys(filterMatch).length > 0 ? [{ $match: filterMatch }] : [];
    const pipeline = [];

    switch (searchType) {
        case SEARCH_TYPES.REGEX: // Поиск с регулярным выражением (перебор всех документов)
            pipeline.push(
                ...computedFields,
                ...extraFilters, // Фильтрация по дополнительным фильтрам (например, categoriesPipeline)
                ...filterMatchStage, // Фильтрация по заданным параметрам
                ...searchMatchStage // Поиск по регулярному выражению
            );
            break;

        case SEARCH_TYPES.TEXT: // Индексированный текстовый поиск (хотя бы одно слово целиком)
            pipeline.push(
                ...computedFields,
                ...searchMatchStage, // Поиск по текстовому значению
                ...extraFilters, // Фильтрация по дополнительным фильтрам (например, categoriesPipeline)
                ...filterMatchStage // Фильтрация по заданным параметрам
            );
            break;

        default:
            log.warn(`Неверный тип поиска: ${searchType}`);
    }

    return pipeline;
};
