import React, { forwardRef, useRef, useEffect } from 'react';
import { useStore, useDispatch } from 'react-redux';
import { incrementMediaRequests, decrementMediaRequests } from '@/redux/slices/loadingSlice';

// Проброс рефа через пропсы
const TrackedImage = forwardRef((props, ref) => {
    const hasStartedRef = useRef(false);
    const hasCompletedRef = useRef(false);
    const store = useStore();
    const dispatch = useDispatch();

    const handleComplete = () => {
        hasCompletedRef.current = true;
        if (!hasStartedRef.current) return; // onLoad/onError сработал раньше хука (кеширование)

        dispatch(decrementMediaRequests());
    };

    useEffect(() => {
        if (hasCompletedRef.current) return; // onLoad/onError сработал раньше хука (кеширование)

        hasStartedRef.current = true;
        dispatch(incrementMediaRequests());

        // Cleanup функция — сработает при размонтировании
        return () => {
            if (hasStartedRef.current && !hasCompletedRef.current) {
                dispatch(decrementMediaRequests());
            }
        };
    }, [dispatch, store]);

    return (
        <img
            {...props}
            ref={ref}
            onLoad={handleComplete}
            onError={handleComplete}
            decode="async"
        />
    );
});

export default TrackedImage;
