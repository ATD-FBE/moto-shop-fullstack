import React, { forwardRef, useState, useRef, useCallback, useEffect } from 'react';
import useImageTracking from '@/hooks/useImageTracking.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { BLANK_IMAGE_SRC } = CLIENT_CONSTANTS;

const TrackedImage = forwardRef((props, ref) => {
    const { src, onLoad, onError, ...restProps } = props;

    const [hasStarted, setHasStarted] = useState(false);
    const imgRef = useRef(null);

    // Объединение внешнего и внутреннего рефов
    const setRefs = useCallback((node) => {
        imgRef.current = node;

        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node;
    }, [ref]);

    // Получение функций хука отслеживания загрузки картинки
    const { startTracking, completeTracking } = useImageTracking();

    // Запуск отслеживания загрузки картинки через Intersection Observer
    useEffect(() => {
        if (!window.IntersectionObserver) return; // Браузер старый и не поддерживает функционал
        if (hasStarted) return; // Загрузка картинки уже началась

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    startTracking(); // Запуск счетчика только когда картинка "на подходе"
                    setHasStarted(true); // Флаг начала загрузки (установка src картинки)
                    observer.disconnect();
                }
            });
        }, { rootMargin: '200px' }); // Начало отслеживания за 200px до появления

        if (imgRef.current) {
            observer.observe(imgRef.current);
        }

        return () => observer.disconnect();
    }, [startTracking, hasStarted]);

    const handleLoad = (e) => {
        if (!hasStarted) return; // Срабатывает на заглушке

        completeTracking(); // Завершение отслеживания загрузки картинки после загрузки
        onLoad?.(e); // Вызов передаваемой функции после загрузки
    };

    const handleError = (e) => {
        if (!hasStarted) return; // Может сработать на заглушке

        completeTracking(); // Завершение отслеживания загрузки картинки при ошибке
        onError?.(e); // Вызов передаваемой функции при ошибке
    };

    return (
        <img
            {...restProps}
            ref={setRefs}
            src={hasStarted ? src : BLANK_IMAGE_SRC}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy" // Ленивая загрузка
            decoding="async" // Защита от "моргания"
        />
    );
});

export default TrackedImage;
