import React from 'react';
import { COMPANY_DETAILS, WORKING_HOURS } from '@shared/company.js';
 
export default function Contacts() {
    const phoneLink = COMPANY_DETAILS.phone.replace(/[^\d+]/g, '');

    return (
        <div className="contacts-page">
            <header className="contacts-header">
                <h2>Контактные данные</h2>
            </header>

            <div className="contacts-main">
                <div>
                    <p><span className="icon color-blue">📞</span><b>Телефон:</b></p>
                    <p>
                        <a href={`tel:${phoneLink}`} className="phone-link">
                            {COMPANY_DETAILS.phone}
                        </a>
                    </p>
                </div>

                <div className="mt-large">
                    <p><span className="icon color-blue">📧</span><b>Электронная почта:</b></p>
                    <p>
                        <a href={`mailto:${COMPANY_DETAILS.emails.info}`} className="email-link">
                            {COMPANY_DETAILS.emails.info}
                        </a>
                    </p>
                </div>

                <div className="mt-large">
                    <p><span className="icon color-blue">📍</span><b>Адрес магазина:</b></p>
                    <p className="shop-address">{COMPANY_DETAILS.displayAddress}</p>
                </div>

                <div className="mt-large">
                    <p><span className="icon color-blue">🕒</span><b>График работы:</b></p>

                    <div className="working-hours">
                        {WORKING_HOURS.map((item, idx) => (
                            <p key={idx}>
                                {item.days}:{' '}
                                <span className={item.closed ? 'closed' : 'time'}>{item.time}</span>
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
