import React, { useState, useEffect } from 'react';

export default function OrderDraftExpirationTimer({ expirationTime, isCancelled, onExpire }) {
    const calculateTimerData = () => {
        if (!expirationTime) {
            return { isExpired: false, hours: '--', minutes: '--', seconds: '--' };
        }

        const now = new Date();
        const end = new Date(expirationTime);

        if (now > end) {
            return { isExpired: true, hours: '00', minutes: '00', seconds: '00' };
        }

        const timeDifference = end - now;
        
        return {
            isExpired: false,
            hours: String(Math.floor((timeDifference / (1000 * 60 * 60)) % 24)).padStart(2, '0'),
            minutes: String(Math.floor((timeDifference / 1000 / 60) % 60)).padStart(2, '0'),
            seconds: String(Math.floor((timeDifference / 1000) % 60)).padStart(2, '0')
        };
    };

    const [timerData, setTimerData] = useState(calculateTimerData);

    useEffect(() => {
        if (!expirationTime || isCancelled) return;

        // Первый тик таймера и проверка просрочки заказа
        const initTimerData = calculateTimerData();
        setTimerData(initTimerData);

        if (initTimerData.isExpired) {
            onExpire();
            return;
        }
    
        // Запуск таймера с проверкой просрочки заказа на каждой секунде
        const timer = setInterval(() => {
            const newTimerData = calculateTimerData();
            setTimerData(newTimerData);
    
            if (newTimerData.isExpired) {
                onExpire();
                clearInterval(timer);
            }
        }, 1000);
    
        // Очистка таймера при размонтировании компонента
        return () => clearInterval(timer);
    }, [expirationTime, isCancelled]);

    if (isCancelled) {
        return (
            <div className="order-draft-expiration-timer">
                <p className="timer-info">Заказ отменён.</p>
            </div>
        );
    }

    return (
        <div className="order-draft-expiration-timer">
            <p className="timer-info">Автоотмена через:</p>
            <p className="time-left-display">
                {timerData.hours}:{timerData.minutes}:{timerData.seconds}
            </p>
        </div>
    );
};
