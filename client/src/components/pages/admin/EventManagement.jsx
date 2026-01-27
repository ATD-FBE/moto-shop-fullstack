import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import NewsEditor from './event-management/NewsEditor.jsx';
import PromoEditor from './event-management/PromoEditor.jsx';
 
export default function EventManagement() {
    const location = useLocation();
    const navigate = useNavigate();
    const [locationState] = useState(location.state);

    useEffect(() => {
        // Очистка location.state после монтирования, чтобы стереть историю данных при переходе
        navigate(location.pathname, { replace: true });
    }, []);

    return (
        <div className="event-management-page">
            <header className="event-management-header">
                <h2>Управление событиями магазина</h2>
                <p>Создание и редактирование новостей и акций</p>
            </header>
            
            <div className="event-editors">
                <NewsEditor newsId={locationState?.newsId || null} />
                <PromoEditor promoId={locationState?.promoId || null} />
            </div>
        </div>
    );
};
