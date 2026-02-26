import React, { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { sendErrorLogsRequest } from '@/api/logRequests.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { DATA_LOAD_STATUS, REQUEST_STATUS } from '@shared/constants.js';
 
export default function ErrorLogs() {
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [errorLogs, setErrorLogs] = useState('');

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();

    const errorLogsLoadStatus =
        loading
            ? DATA_LOAD_STATUS.LOADING
            : loadError
                ? DATA_LOAD_STATUS.ERROR
                : !errorLogs
                    ? DATA_LOAD_STATUS.NOT_FOUND
                    : DATA_LOAD_STATUS.READY;

    const loadErrorLogs = async () => {
        setLoadError(false);
        setLoading(true);

        const { status, message, text } = await dispatch(sendErrorLogsRequest());
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'LOG: LOAD ERRORS', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setLoadError(true);
        } else {
            setErrorLogs(text);
        }
        
        setLoading(false);
    };

    const reloadErrorLogs = async () => {
        await loadErrorLogs();
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Стартовая загрузка логов
    useEffect(() => {
        loadErrorLogs();
    }, []);

    // Прокрутка логов вниз, к последнему
    useEffect(() => {
        if (!errorLogs) return;

        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    }, [errorLogs]);

    return (
        <div className="error-logs-page">
            <header className="error-logs-header">
                <h2>Логи ошибок</h2>
            </header>

            <ErrorLogsMain
                loadStatus={errorLogsLoadStatus}
                reloadErrorLogs={reloadErrorLogs}
                errorLogs={errorLogs}
            />
        </div>
    );
};

function ErrorLogsMain({
    loadStatus,
    reloadErrorLogs,
    errorLogs
}) {
    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div className="error-logs-main">
                <div className="error-logs-load-status">
                    <p>
                        <span className="icon load">⏳</span>
                        Загрузка логов ошибок...
                    </p>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div className="error-logs-main">
                <div className="error-logs-load-status">
                    <p>
                        <span className="icon error">❌</span>
                        Ошибка сервера. Логи ошибок недоступны.
                    </p>
                    <button className="reload-btn" onClick={reloadErrorLogs}>Повторить</button>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div className="error-logs-main">
                <div className="error-logs-load-status">
                    <p>
                        <span className="icon not-found">🔎</span>
                        На данный момент ошибок нет.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="error-logs-main">
            <pre className="error-logs-output">{errorLogs}</pre>
        </div>
    );
}
