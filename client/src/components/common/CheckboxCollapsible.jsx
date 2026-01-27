import React, { useState, useEffect }  from 'react';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import Collapsible from '@/components/common/Collapsible.jsx';

export default function CheckboxCollapsible({
    checkboxLabel = '',
    defaultExpanded = false,
    contentClass = 'content',
    showContextIndicator = false,
    children
}) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [showLabelColon, setShowLabelColon] = useState(defaultExpanded);

    // Показ двоеточия в лэйбле чекбокса при раскрытии
    useEffect(() => {
        if (checkboxLabel && isExpanded) setShowLabelColon(true);
    }, [isExpanded]);

    return (
        <div className={`${contentClass}-checkbox-collapsible`}>
            <DesignedCheckbox
                label={checkboxLabel}
                labelSide="right"
                showColon={showLabelColon}
                checked={isExpanded}
                onChange={() => setIsExpanded(prev => !prev)}
            />
            <Collapsible
                isExpanded={isExpanded}
                className={`${contentClass}-collapsible`}
                showContextIndicator={showContextIndicator}
                onCollapseEnd={() => checkboxLabel && setShowLabelColon(false)}
            >
                {children}
            </Collapsible>
        </div>
    );
};
