import { useRef, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { incrementMediaRequests, decrementMediaRequests } from '@/redux/slices/loadingSlice';

export default function useImageTracking() {
    const hasStartedRef = useRef(false);
    const hasCompletedRef = useRef(false);
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();

    const startTracking = useCallback(() => {
        if (isUnmountedRef.current) return;
        if (hasStartedRef.current && !hasCompletedRef.current) return; // Загрузка картинки в процессе

        // Картинка была загружена в прошлый раз => сброс для новой попытки
        if (hasStartedRef.current && hasCompletedRef.current) {
            hasStartedRef.current = false;
            hasCompletedRef.current = false;
        }

        if (hasCompletedRef.current) return; // onLoad/onError сработал раньше хука (картинка в кэше)

        hasStartedRef.current = true;
        dispatch(incrementMediaRequests());
    }, [dispatch]);

    const completeTracking = useCallback(() => {
        if (isUnmountedRef.current) return;
        if (hasCompletedRef.current) return; // Загрузка уже завершена (успешно или с ошибкой)
        hasCompletedRef.current = true;
        if (!hasStartedRef.current) return; // onLoad/onError сработал раньше хука (картинка в кэше)

        dispatch(decrementMediaRequests());
    }, [dispatch]);

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;

            // Декремент счётчика, если загрузка картинки в процессе
            if (hasStartedRef.current && !hasCompletedRef.current) {
                hasCompletedRef.current = true;
                dispatch(decrementMediaRequests());
            }
        };
    }, [dispatch]);

    return { startTracking, completeTracking };
};
