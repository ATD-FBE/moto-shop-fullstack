import React, { forwardRef, useRef, useEffect } from 'react';
import { useStore, useDispatch } from 'react-redux';
import { incrementMediaRequests, decrementMediaRequests } from '@/redux/slices/loadingSlice';

// Правильный проброс рефа через пропсы
const TrackedImage = forwardRef((props, ref) => {
    const hasStartedRef = useRef(false);
    const hasCompletedRef = useRef(false);
    const mountTimestampRef = useRef(Date.now());
    const store = useStore();
    const dispatch = useDispatch();

    const handleComplete = () => {
        hasCompletedRef.current = true;

        // Если onLoad сработал раньше хука (кеширование), то декремент не делается
        if (!hasStartedRef.current) return;

        const resetTimestamp = store.getState().loading.resetTimestamp;
        const mountTimestamp = mountTimestampRef.current;

        if (mountTimestamp >= resetTimestamp) {
            dispatch(decrementMediaRequests());
        }
    };

    useEffect(() => {
        // Если onLoad сработал раньше хука (кеширование), то инкремент не делается
        if (hasCompletedRef.current) return;

        hasStartedRef.current = true;

        const resetTimestamp = store.getState().loading.resetTimestamp;
        const mountTimestamp = mountTimestampRef.current;

        if (mountTimestamp >= resetTimestamp) {
            dispatch(incrementMediaRequests());
        }
    }, [dispatch]);

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
