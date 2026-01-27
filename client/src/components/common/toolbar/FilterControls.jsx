import React, { useState } from 'react';
import cn from 'classnames';
import { getInitFilterParams } from '@/helpers/initParamsHelper.js';
import { formatDateToLocalString } from '@shared/commonHelpers.js';
import { MAX_DATE_TS } from '@shared/constants.js';

export default function FilterControls({ uiBlocked, options, filter, setFilter }) {
    const [filterParams, setFilterParams] = useState(new URLSearchParams(filter));
    const [isSettingsVisible, setIsSettingsVisible] = useState(false);

    const isFilterChanged = filterParams.toString() !== new URLSearchParams(filter).toString();
    const isFilterReseted = filterParams.toString() === getInitFilterParams(null, options).toString();

    const calcInputWidth = (type, minLimit, maxLimit) => {
        if (type !== 'number') return 'auto';
        
        const MAX_WIDTH = 120;
        const CHAR_WIDTH = 8;
        const PADDING = 30;

        if (minLimit === '' || maxLimit === '') return MAX_WIDTH + 'px';

        const minLimitLength = String(minLimit).length;
        const maxLimitLength = String(maxLimit).length;
        const numberInputWidth = Math.max(minLimitLength, maxLimitLength) * CHAR_WIDTH + PADDING;

        return Math.min(numberInputWidth, MAX_WIDTH) + 'px';
    };

    const handleInputChange = (e, { type, minValue, maxValue, paramName }) => {
        const currentValue = e.target.value;
        let newValue = currentValue;

        if (currentValue !== '') {
            if (type === 'number' && ['blur', 'keydown'].includes(e.type)) {
                const num = Number(currentValue);
                const minValueNum = minValue !== '' ? Number(minValue) : -Infinity;
                const maxValueNum = maxValue !== '' ? Number(maxValue) : Infinity;
    
                if (num < minValueNum) {
                    newValue = minValueNum;
                } else if (num > maxValueNum) {
                    newValue = maxValueNum;
                }
            } else if (type === 'date') {
                const date = new Date(currentValue);
                const minDate = minValue !== '' ? new Date(minValue) : new Date(-MAX_DATE_TS);
                const maxDate = maxValue !== '' ? new Date(maxValue) : new Date(MAX_DATE_TS);
    
                if (date < minDate) {
                    newValue = formatDateToLocalString(minDate);
                } else if (date > maxDate) {
                    newValue = formatDateToLocalString(maxDate);
                }
            }
        }

        setFilterParams(prevFilterParams => {
            if (prevFilterParams.get(paramName) === String(newValue)) {
                return prevFilterParams; // Исключает ререндер, если состояние не изменилось
            }

            const newFilterParams = new URLSearchParams(prevFilterParams);
            newFilterParams.set(paramName, newValue);
            return newFilterParams;
        });
    };

    const renderOption = (option, idx) => {
        const {
            label,
            type,
            minLimit,
            maxLimit,
            minParamName,
            maxParamName,
            paramName,
            valueOptions
        } = option;

        switch (type) {
            case 'number':
                return (
                    <div key={idx} className={`filter-option ${type}-type`}>
                        <label className="option-label">{label}:</label>

                        <div className="option-values option-range">
                            <div className="range-field range-from">
                                <label htmlFor={`range-from-${idx}`} className="range-prefix">От</label>

                                <input
                                    id={`range-from-${idx}`}
                                    type={type}
                                    style={{ width: calcInputWidth(type, minLimit, maxLimit) }}
                                    value={filterParams.get(minParamName) ?? minLimit}
                                    min={minLimit}
                                    max={maxLimit}
                                    onChange={e => handleInputChange(e, {
                                        type,
                                        paramName: minParamName
                                    })}
                                    onBlur={e => handleInputChange(e, {
                                        type,
                                        minValue: minLimit,
                                        maxValue: filterParams.get(maxParamName) ?? maxLimit,
                                        paramName: minParamName
                                    })}
                                    onKeyDown={e => e.key === 'Enter' && handleInputChange(e, {
                                        type,
                                        minValue: minLimit,
                                        maxValue: filterParams.get(maxParamName) ?? maxLimit,
                                        paramName: minParamName
                                    })}
                                />
                            </div>
                            
                            <span className="range-separator">–</span>

                            <div className="range-field range-to">
                                <label htmlFor={`range-to-${idx}`} className="range-prefix">до</label>

                                <input
                                    id={`range-to-${idx}`}
                                    type={type}
                                    style={{ width: calcInputWidth(type, minLimit, maxLimit) }}
                                    value={filterParams.get(maxParamName) ?? maxLimit}
                                    min={minLimit}
                                    max={maxLimit}
                                    onChange={e => handleInputChange(e, {
                                        type,
                                        paramName: maxParamName
                                    })}
                                    onBlur={e => handleInputChange(e, {
                                        type,
                                        minValue: filterParams.get(minParamName) ?? minLimit,
                                        maxValue: maxLimit,
                                        paramName: maxParamName
                                    })}
                                    onKeyDown={e => e.key === 'Enter' && handleInputChange(e, {
                                        type,
                                        minValue: filterParams.get(minParamName) ?? minLimit,
                                        maxValue: maxLimit,
                                        paramName: maxParamName
                                    })}
                                />
                            </div>
                        </div>
                    </div>
                );

            case 'date':
                return (
                    <div key={idx} className={`filter-option ${type}-type`}>
                        <label className="option-label">{label}:</label>

                        <div className="option-values option-range">
                            <div className="range-field range-from">
                                <label htmlFor={`range-from-${idx}`} className="range-prefix">С</label>
                                
                                <input
                                    id={`range-from-${idx}`}
                                    type={type}
                                    style={{ width: calcInputWidth(type, minLimit, maxLimit) }}
                                    value={filterParams.get(minParamName) ?? minLimit}
                                    onChange={e => handleInputChange(e, {
                                        type,
                                        minValue: minLimit,
                                        maxValue: filterParams.get(maxParamName) ?? maxLimit,
                                        paramName: minParamName
                                    })}
                                />
                            </div>

                            <span className="range-separator">–</span>

                            <div className="range-field range-to">
                                <label htmlFor={`range-to-${idx}`} className="range-prefix">по</label>
                                
                                <input
                                    id={`range-to-${idx}`}
                                    type={type}
                                    style={{ width: calcInputWidth(type, minLimit, maxLimit) }}
                                    value={filterParams.get(maxParamName) ?? maxLimit}
                                    onChange={e => handleInputChange(e, {
                                        type,
                                        minValue: filterParams.get(minParamName) ?? minLimit,
                                        maxValue: maxLimit,
                                        paramName: maxParamName
                                    })}
                                />
                            </div>
                        </div>
                    </div>
                );

            case 'boolean': {
                const booleanLabelMap = {
                    '': 'Не учитывать',
                    'true': 'Включить',
                    'false': 'Исключить'
                };

                return (
                    <div key={idx} className={`filter-option ${type}-type`}>
                        <label className="option-label">{label}:</label>

                        <div className="option-values">
                            {Object.keys(booleanLabelMap).map(value => (
                                <label key={`${paramName}-${value}`} className="label-radio-btn">
                                    <input
                                        type="radio"
                                        name={paramName}
                                        value={value}
                                        checked={filterParams.get(paramName) === value}
                                        onChange={e => handleInputChange(e, { type, paramName })}
                                    />
                                    <span className="designed-radio-btn"></span>
                                    <span>{booleanLabelMap[value]}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                );
            }

            case 'string':
            default:
                return (
                    <div key={idx} className={`filter-option ${type}-type`}>
                        <label className="option-label">{label}:</label>

                        <div className="option-values">
                            {valueOptions.map(({ value, label: valueLabel }) => (
                                <label key={`${paramName}-${value}`} className="label-radio-btn">
                                    <input
                                        type="radio"
                                        name={paramName}
                                        value={value}
                                        checked={filterParams.get(paramName) === value}
                                        onChange={e => handleInputChange(e, { type, paramName })}
                                    />
                                    <span className="designed-radio-btn"></span>
                                    <span>{valueLabel}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="filter-controls">
            <button
                className={cn('filter-settings-btn', isSettingsVisible ? 'enabled' : null)}
                onClick={() => setIsSettingsVisible(prev => !prev)}
            >
                Настройка фильтра
            </button>

            <div className={cn('filter-settings', isSettingsVisible ? 'enabled' : null)}>
                {options.map(renderOption)}

                <div className="filter-actions">
                    <button
                        className="filter-btn"
                        onClick={() => setFilter(filterParams)}
                        disabled={uiBlocked || !isFilterChanged}
                    >
                        Отфильтровать
                    </button>
                    
                    <button
                        className="reset-filter-btn"
                        onClick={() => setFilterParams(getInitFilterParams(null, options))}
                        disabled={isFilterReseted}
                    >
                        Сбросить фильтр
                    </button>
                </div>
            </div>
        </div>
    );
};
