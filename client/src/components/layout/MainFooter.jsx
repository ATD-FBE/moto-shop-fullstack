import React, { forwardRef } from 'react';
import { COMPANY_DETAILS } from '@shared/constants.js';

const MainFooter = forwardRef(function (_, ref) {
    const currentYear = new Date().getFullYear();
    const phoneLink = COMPANY_DETAILS.phone.replace(/[^\d+]/g, '');

    return (
        <footer ref={ref} className="main-footer">
            <div className="footer-content">
                <span>
                    <span className="letter-enhance">©</span>{currentYear}{' '}
                    <span className="letter-enhance">M</span>ото-
                    <span className="letter-enhance">M</span>агазин
                </span>
                <div className="splitter"></div>
                <span>
                    Телефон: <a href={`tel:${phoneLink}`}>{COMPANY_DETAILS.phone}</a>
                </span>
                <div className="splitter"></div>
                <span>
                    Email:{' '}
                    <a href={`mailto:${COMPANY_DETAILS.emails.info}`}>
                        {COMPANY_DETAILS.emails.info}
                    </a>
                </span>
            </div>
        </footer>
    );
});

export default MainFooter;
