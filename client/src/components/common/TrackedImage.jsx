import React, { forwardRef, useState, useRef, useCallback, useEffect } from 'react';
import { FadeLoader } from 'react-spinners';
import cn from 'classnames';
import useImageTracking from '@/hooks/useImageTracking.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { BLANK_IMAGE_SRC } = CLIENT_CONSTANTS;

const TrackedImage = forwardRef((props, ref) => {
    const { className, src, onLoad, onError, ...restProps } = props;

    const [hasStarted, setHasStarted] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
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

        if (imgRef.current) observer.observe(imgRef.current);
        return () => observer.disconnect();
    }, [startTracking, hasStarted]);

    const handleLoad = (e) => {
        if (!hasStarted) return; // Срабатывает на заглушке

        setIsLoaded(true);
        completeTracking(); // Завершение отслеживания загрузки картинки после загрузки
        onLoad?.(e); // Вызов передаваемой функции после загрузки
    };

    const handleError = (e) => {
        if (!hasStarted) return; // Может сработать на заглушке

        setIsLoaded(true);
        completeTracking(); // Завершение отслеживания загрузки картинки при ошибке
        onError?.(e); // Вызов передаваемой функции при ошибке
    };

    return (
        <div className={cn('tracked-image-container', className)}>
            <FadeLoader
                className={cn('tracked-image-loader-spinner', { 'visible': hasStarted && !isLoaded })}
                color="rgba(138, 210, 250, 1)"
                height={15}
                width={4}
                radius={2}
                margin={2}
                speedMultiplier={1.2}
                loading={true}
                cssOverride={{
                    display: 'block',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-4px, -8px)',
                    margin: 0
                }}
            />

            <img
                {...restProps}
                ref={setRefs}
                className={cn('tracked-image', { 'visible': isLoaded })}
                src={hasStarted ? src : BLANK_IMAGE_SRC}
                onLoad={handleLoad}
                onError={handleError}
                loading="lazy" // Ленивая загрузка
                decoding="async" // Защита от "моргания"
            />
        </div>
    );
});

export default TrackedImage;
