import React from 'react';
import { escapeRegExp } from '@shared/commonHelpers.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { NO_VALUE_LABEL } = CLIENT_CONSTANTS;

export const capitalizeFirstLetter = (str) => str.charAt(0).toUpperCase() + str.slice(1);

export const toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

export const pluralize = (count, [one, few, many]) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
};

export const formatListWithConjunction = (list, conjunction = 'и') => {
    if (list.length === 0) return '';
    if (list.length === 1) return list[0];
    
    const last = list.pop();
    return `${list.join(', ')} ${conjunction} ${last}`;
};

export const joinItemsWithQuotes = (items) => items.map(i => `"${i}"`).join(', ');

export const joinItemsWithChevrons = (items) => items.map(i => `«${i}»`).join(', ');

export const highlightText = (text, query) => {
    if (!query?.trim()) return [text];
  
    const safeQuery = escapeRegExp(query.trim());
    const regex = new RegExp(`(${safeQuery})`, 'ig');
    const textParts = text.split(regex);
  
    return textParts.map((part, i) =>
        regex.test(part) ? <mark key={i} className="highlighted-text">{part}</mark> : part
    );
};

export const getFieldInfoClass = (elem, type, name) => {
    return `${elem}${type ? '-' + type : ''}-elem ${toKebabCase(name)}-field`;
};

export const getValidQuantity = (stringVal, min, max) => {
    const value = Number(stringVal);

    if (isNaN(value) || value < min) return min;
    if (value > max) return max;
    return Math.round(value);
};

export const formatCurrency = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return NO_VALUE_LABEL;
    
    return new Intl.NumberFormat('ru-RU', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

export const formatProductTitle = (name, brand) => {
    return `${name ?? ''}${brand ? ` ${joinItemsWithChevrons([brand])}`: ''}`;
};
