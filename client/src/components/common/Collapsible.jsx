import React, { useState, useRef, useLayoutEffect } from 'react';
import cn from 'classnames';

export default function Collapsible({
    isExpanded,
    className = '',
    showContextIndicator = true,
    onExpandEnd = null,
    onCollapseEnd = null,
    children
}) {
    const [fullyExpanded, setFullyExpanded] = useState(false);
    const wrapperRef = useRef(null);
    const isExpandedRef = useRef(isExpanded);

    // Подключение слушателей
    useLayoutEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const onTransitionEnd = (e) => {
            if (e.target !== wrapper || e.propertyName !== 'height') return;

            // Установка auto для высоты при раскрытии и выполнение коллбэков
            if (isExpandedRef.current) {
                wrapper.style.height = 'auto';
                setFullyExpanded(true);
                onExpandEnd?.();
            } else {
                onCollapseEnd?.();
            }
        };

        wrapper.addEventListener('transitionend', onTransitionEnd);
        return () => wrapper.removeEventListener('transitionend', onTransitionEnd);
    }, []);

    // Установка высоты
    useLayoutEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        if (isExpanded) {
            isExpandedRef.current = true;
            wrapper.style.height = wrapper.scrollHeight + 'px';
        } else {
            isExpandedRef.current = false;

            if (wrapper.style.height === 'auto') {
                wrapper.style.height = wrapper.scrollHeight + 'px';
                void wrapper.offsetHeight; // Форсировать пересчёт браузером состояния DOM
            }
            wrapper.style.height = '0px';

            setFullyExpanded(false);
        }
    }, [isExpanded]);

    // Корректировка высоты при изменении высоты дочерних элементов во время разворачивания
    useLayoutEffect(() => {
        if (!isExpanded) return;

        const wrapper = wrapperRef.current;
        if (!wrapper) return;
    
        const observer = new ResizeObserver(() => {
            if (wrapper.style.height !== 'auto') {
                wrapper.style.height = wrapper.scrollHeight + 'px';
            }
        });
    
        observer.observe(wrapper);
        return () => observer.disconnect();
    }, [isExpanded]);   

    return (
        <div
            ref={wrapperRef}
            className={cn(className, 'collapsible', { 'fully-expanded': fullyExpanded })}
        >
            {showContextIndicator && (
                <div className="context-indicator">
                    <div className="arrows-down-group">
                        <span className="arrow-down">▼</span>
                        <span className="arrow-down">▼</span>
                        <span className="arrow-down">▼</span>
                    </div>
                </div>
            )}

            {children}
        </div>
    );
};
