import React, { forwardRef, useEffect } from 'react';
import useImageTracking from '@/hooks/useImageTracking.js';

// Проброс рефа через пропсы
const TrackedImage = forwardRef((props, ref) => {
    // Получение функций хука отслеживания загрузки картинки
    const { startTracking, completeTracking } = useImageTracking();

    // Запуск отслеживания загрузки картинки
    useEffect(() => {
        startTracking();
    }, [startTracking]);

    return (
        <img
            {...props}
            ref={ref}
            onLoad={completeTracking}
            onError={completeTracking}
            decode="async"
        />
    );
});

export default TrackedImage;
