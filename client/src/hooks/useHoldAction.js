import { useRef, useCallback, useEffect } from 'react';

export default function useHoldAction(
    callback,
    startDelay = 400,
    maxDelay = 70,
    minDelay = 10,
    acceleration = 0.96
) {
    const isHoldingRef = useRef(false);
    const currentDelayRef = useRef(maxDelay);
    const timeoutRef = useRef(null);

    const step = useCallback(() => {
        if (!isHoldingRef.current) return;

        callback();

        currentDelayRef.current = Math.max(minDelay, currentDelayRef.current * acceleration);
        timeoutRef.current = setTimeout(step, currentDelayRef.current);
    }, [callback, acceleration, minDelay]);

    const start = useCallback(() => {
        if (isHoldingRef.current) return;

        isHoldingRef.current = true;
        currentDelayRef.current = maxDelay;

        callback(); // Изменение сразу при нажатии

        timeoutRef.current = setTimeout(step, startDelay);
    }, [callback, step, maxDelay, startDelay]);

    const stop = useCallback(() => {
        isHoldingRef.current = false;
        clearTimeout(timeoutRef.current);
    }, []);

    // Очистка при размонтировании компонента
    useEffect(() => {
        return () => {
            stop();
        };
    }, [stop]);

    return { start, stop };
};
