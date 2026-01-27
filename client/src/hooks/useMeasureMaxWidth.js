import { useState, useLayoutEffect } from 'react';

export default function useMeasureMaxWidth(elements, options = {}) {
    const { enabled = true } = options;

    const [maxWidth, setMaxWidth] = useState(0);

    useLayoutEffect(() => {
        if (!enabled) {
            setMaxWidth(0);
            return;
        }
        if (!elements.length) return;

        let rafId = null;

        const getMax = () => Math.max(0, ...elements.map(el => el.offsetWidth));

        const update = () => {
            rafId = requestAnimationFrame(() => {
                setMaxWidth(getMax());
            });
        };

        update();

        const observer = new ResizeObserver(update);
        elements.forEach(el => observer.observe(el));

        return () => {
            observer.disconnect();
            cancelAnimationFrame(rafId);
        };
    }, [enabled, elements]);

    return maxWidth;
};
