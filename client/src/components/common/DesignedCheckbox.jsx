import React, { useRef } from 'react';
import cn from 'classnames';

export default function DesignedCheckbox({
    id,
    name = 'checkbox',
    label = '',
    labelSide = 'left',
    showColon = true,
    checkIcon = '✓',
    checkIconColor = 'blue',
    checked = false,
    onChange = () => {},
    onBlur = () => {},
    disabled = false
}) {
    const inputRef = useRef(null);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !disabled) {
            inputRef.current?.click();
        }
    };

    return (
        <label className="designed-checkbox-container">
            {label && labelSide === 'left' &&
                <span className="checkbox-label left-side">
                    {label}{showColon && ':'}
                </span>}

            <input
                ref={inputRef}
                id={id}
                name={name}
                type="checkbox"
                checked={checked}
                onChange={onChange}
                disabled={disabled}
            />

            <span
                className="designed-checkbox"
                tabIndex="0"
                onKeyDown={handleKeyDown}
                onBlur={onBlur}
            >
                <span
                    className={cn('check-icon', `color-${checkIconColor}`, { 'visible': checked })}
                    aria-hidden="true"
                >
                    {checkIcon}
                </span>
            </span>

            {label && labelSide === 'right' &&
                <span className="checkbox-label right-side">
                    {label}{showColon && ':'}
                </span>}
        </label>
    );
};
