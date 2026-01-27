import { formatDateToLocalString } from './commonHelpers.js';
import {
    ORDER_STATUS,
    ORDER_ACTIVE_STATUSES,
    FINANCIALS_ACTIVE_STATES,
    FINANCIALS_FINAL_STATES
} from './constants.js';

export const productsFilterOptions = [
    {
        dbField: 'price',
        label: 'Цена (руб.)',
        type: 'number',
        minLimit: '0',
        maxLimit: '',
        minParamName: 'minPrice',
        maxParamName: 'maxPrice'
    },
    {
        dbField: 'discount',
        label: 'Уценка (%)',
        type: 'number',
        minLimit: '0',
        maxLimit: '100',
        minParamName: 'minDiscount',
        maxParamName: 'maxDiscount'
    },
    {
        dbField: 'inStock',
        label: 'В наличии',
        type: 'boolean',
        paramName: 'inStock',
        defaultValue: true
    },
    {
        dbField: 'isBrandNew',
        label: 'Новинки',
        type: 'boolean',
        paramName: 'brandNew',
        defaultValue: ''
    },
    {
        dbField: 'isRestocked',
        label: 'Недавно пополненные',
        type: 'boolean',
        paramName: 'restocked',
        defaultValue: ''
    },
    {
        dbField: 'isActive',
        label: 'В продаже',
        type: 'boolean',
        paramName: 'active',
        defaultValue: true
    }
];

export const productEditorFilterOptions = [
    {
        dbField: 'price',
        label: 'Цена (руб.)',
        type: 'number',
        minLimit: '0',
        maxLimit: '',
        minParamName: 'minPrice',
        maxParamName: 'maxPrice'
    },
    {
        dbField: 'discount',
        label: 'Уценка (%)',
        type: 'number',
        minLimit: '0',
        maxLimit: '100',
        minParamName: 'minDiscount',
        maxParamName: 'maxDiscount'
    },
    {
        dbField: 'inStock',
        label: 'В наличии',
        type: 'boolean',
        paramName: 'inStock',
        defaultValue: ''
    },
    {
        dbField: 'isBrandNew',
        label: 'Новинки',
        type: 'boolean',
        paramName: 'brandNew',
        defaultValue: ''
    },
    {
        dbField: 'isRestocked',
        label: 'Недавно пополненные',
        type: 'boolean',
        paramName: 'restocked',
        defaultValue: ''
    },
    {
        dbField: 'isActive',
        label: 'В продаже',
        type: 'boolean',
        paramName: 'active',
        defaultValue: ''
    }
];

export const ordersFilterOptions = [
    {
        dbField: 'currentStatus',
        label: 'Статус заказа',
        type: 'string',
        paramName: 'orderStatus',
        defaultValue: '',
        valueOptions: [
            { value: '', label: 'Любой' },
            { value: 'active', label: 'Активный', matches: ORDER_ACTIVE_STATUSES },
            { value: ORDER_STATUS.COMPLETED, label: 'Выполненный' },
            { value: ORDER_STATUS.CANCELLED, label: 'Отменённый' }
        ]
    },
    {
        dbField: 'financials.state',
        label: 'Финансовый статус',
        type: 'string',
        paramName: 'financialsState',
        defaultValue: '',
        valueOptions: [
            { value: '', label: 'Любой' },
            { value: 'inProgress', label: 'Открытый', matches: FINANCIALS_ACTIVE_STATES },
            { value: 'final', label: 'Закрытый', matches: FINANCIALS_FINAL_STATES }
        ]
    }
];

export const customersFilterOptions = [
    {
        dbField: 'createdAt',
        label: 'Дата регистрации',
        type: 'date',
        minLimit: '',
        minLimitUTC: '',
        maxLimit: formatDateToLocalString(new Date()),
        maxLimitUTC: new Date().toISOString().split('T')[0],
        minParamName: 'regDateStart',
        maxParamName: 'regDateEnd'
    },
    {
        dbField: 'discount',
        label: 'Скидка (%)',
        type: 'number',
        minLimit: '0',
        maxLimit: '100',
        minParamName: 'minDiscount',
        maxParamName: 'maxDiscount'
    },
    {
        dbField: 'totalSpent',
        label: 'Сумма покупок (руб.)',
        type: 'number',
        minLimit: '0',
        maxLimit: '',
        minParamName: 'minTotalSpent',
        maxParamName: 'maxTotalSpent'
    },
    {
        dbField: 'isBanned',
        label: 'Заблокированные',
        type: 'boolean',
        paramName: 'ban',
        defaultValue: ''
    }
];
