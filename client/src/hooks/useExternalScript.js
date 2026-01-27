import { useEffect, useState } from 'react';
import useSyncedStateWithRef from '@/hooks/useSyncedStateWithRef.js';

export default function useExternalScript({
    src,
    globalVar,
    selector,
    attrs = {},
    removeOnUnmount = false
}) {
    const [loadAttempt, setLoadAttempt] = useState(1);
    const [status, setStatus, statusRef] = useSyncedStateWithRef(() => {
        if (globalVar && window[globalVar]) return 'ready';
        return 'idle';
    }); // idle | loading | waiting | ready | error

    const deleteScript = (script) => script.parentNode?.removeChild(script);

    const reload = () => {
        setStatus('idle');
        setLoadAttempt(prev => prev + 1);
    };

    useEffect(() => {
        let script =
            selector
                ? document.querySelector(selector)
                : document.querySelector(`script[src="${src}"]`);

        const isActuallyReady =
            script?.dataset.loaded === 'true' &&
            (!globalVar || window[globalVar]);

        if (isActuallyReady) {
            setStatus('ready');
            return;
        }

        if (!script) {
            script = document.createElement('script');
            script.src = src;
            script.async = true;

            Object.entries(attrs).forEach(([key, value]) => {
                script.setAttribute(key, value);
            });

            document.body.appendChild(script);
        }

        setStatus(script.dataset.loaded === 'true' ? 'waiting' : 'loading');

        let checkInterval = null;

        const handleLoad = () => {
            script.dataset.loaded = 'true';

            // Нет глобальной переменной или она уже установлена => статус готовности скрипта
            if (!globalVar || window[globalVar]) {
                setStatus('ready');
                return;
            }
            
            // Установка статуса ожидания и проверка глобальной переменной через интервал
            setStatus('waiting');

            let checkAttempts = 0;

            checkInterval = setInterval(() => {
                checkAttempts++;

                if (window[globalVar]) {
                    clearInterval(checkInterval);
                    setStatus('ready');
                } else if (checkAttempts > 50) { // Стоп через 5 секунд (50 * 100мс)
                    clearInterval(checkInterval);
                    setStatus('error');
                    deleteScript(script);

                    console.error(
                        `Скрипт загружен, но глобальная переменная "${globalVar}" остутствует`
                    );
                }
            }, 100);
        };

        const handleError = () => {
            setStatus('error');
            deleteScript(script);
        };

        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);

        return () => {
            if (checkInterval) clearInterval(checkInterval);

            script.removeEventListener('load', handleLoad);
            script.removeEventListener('error', handleError);

            if (removeOnUnmount || statusRef.current !== 'ready') {
                deleteScript(script);
            }
        };
    }, [src, selector, globalVar, loadAttempt]); // Без attrs и removeOnUnmount

    return { status, reload };
};
