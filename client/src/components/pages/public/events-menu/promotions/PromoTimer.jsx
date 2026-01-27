import React, { useState, useEffect } from 'react';

export default function PromoTimer({ startDate, endDate }) {
    const calculateTimerData = () => {
        const now = new Date();
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (now > end) {
            return { isExpired: true, isPromoStarted: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
        }

        const isPromoStarted = now >= start;
        const targetDate = isPromoStarted ? end : start;
        const timeDifference = targetDate - now;
        
        return {
            isExpired: false,
            isPromoStarted,
            days: Math.floor(timeDifference / (1000 * 60 * 60 * 24)),
            hours: Math.floor((timeDifference / (1000 * 60 * 60)) % 24),
            minutes: Math.floor((timeDifference / 1000 / 60) % 60),
            seconds: Math.floor((timeDifference / 1000) % 60)
        };
    };

    const [timerData, setTimerData] = useState(calculateTimerData);

    useEffect(() => {
        const timer = setInterval(() => {
            const newTimerData = calculateTimerData();
            setTimerData(newTimerData);
    
            if (newTimerData.isExpired) {
                clearInterval(timer);
            }
        }, 1000);
    
        return () => clearInterval(timer);
    }, [startDate, endDate]);

    if (timerData.isExpired) {
        return <p className="promo-timer">Акция завершена.</p>;
    }

    return (
        <p className="promo-timer">
            {timerData.isPromoStarted ? 'До конца акции осталось' : 'До начала акции осталось'}:
            <span className="time-left-display">
                {timerData.days} дн. {timerData.hours} ч. {timerData.minutes} мин. {timerData.seconds} сек.
            </span>
        </p>
    );
};
