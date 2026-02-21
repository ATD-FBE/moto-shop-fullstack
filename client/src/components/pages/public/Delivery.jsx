import React from 'react';
import { formatCurrency } from '@/helpers/textHelpers.js';
import { MIN_ORDER_AMOUNT } from '@shared/constants.js';
import { COMPANY_DETAILS, WORKING_HOURS } from '@shared/company.js';
 
export default function Delivery() {
    const openWorkingHoursText = WORKING_HOURS
        .filter(item => !item.closed)
        .map(item => `${item.days.toLowerCase()}: ${item.time}`)
        .join(', ');
    const phoneLink = COMPANY_DETAILS.phone.replace(/[^\d+]/g, '');

    return (
        <div className="delivery-page">
            <header className="delivery-header">
                <h2>Доставка и оплата в «Мото-Магазине»</h2>
            </header>

            <div className="delivery-main">
                <div className="section-info">
                    <h3>Оплата</h3>

                    <p className="mt-short">
                        Минимальная сумма заказа — {formatCurrency(MIN_ORDER_AMOUNT)} ₽
                        (значение может меняться, но здравый смысл — константа).
                    </p>

                    <p className="mt-short">Способы оплаты:</p>

                    <ul className="mt-short">
                        <li><b>Наличные</b> при получении заказа (самовывоз или доставка).</li>
                        <li><b>Банковский перевод</b> (для тех, кто любит цифры и контроль).</li>
                        <li>
                            <b>Карта онлайн</b> — функционал в разработке, когда-нибудь заработает,
                            так что держите карты наготове! <span className="color-green">💳</span>
                        </li>
                    </ul>

                    <p className="left-border mt-short">
                        Присылайте подтверждение оплаты на почту:
                        {' '}
                        <a href={`mailto:${COMPANY_DETAILS.emails.payments}`} className="email-link">
                            {COMPANY_DETAILS.emails.payments}
                        </a>
                        {' '}
                        — иначе мы можем задержать отправку.
                        <br />
                        Вы также можете оплатить заказ частями различными способами,
                        не только выбранным. <span className="color-orange">🔄</span>
                    </p>
                </div>

                <div className="section-info mt-large">
                    <h3>Доставка</h3>

                    <p className="mt-short">
                        Способов получить заказ несколько — выбирайте тот,
                        который ближе по духу и расстоянию:
                    </p>

                    <ul className="no-list-markers mt-short">
                        <li className="marked-text mb-short">
                            <span className="icon-marker color-blue">🚶</span>
                            <p className="ml-large">
                                <b>Самовывоз</b><br />
                                Забрать заказ самостоятельно по адресу:{' '}
                                <span className="shop-address">
                                    {COMPANY_DETAILS.displayAddress} ({openWorkingHoursText})
                                </span>
                                .<br />
                                Быстро, бесплатно и без ожиданий курьера.
                            </p>
                        </li>
                        <li className="marked-text mt-short">
                            <span className="icon-marker color-blue">🛵</span>
                            <p className="ml-large">
                                <b>Курьер магазина</b>
                            </p>
                            <ul className="no-mt-mb ml-large">
                                <li>
                                    <i>Бесплатно</i> — доставка по городу в радиусе 10 км от магазина.
                                </li>
                                <li>
                                    <i>Курьер «Экстра»</i> — если дальше или срочно,
                                    стоимость рассчитывается при получении заказа.
                                </li>
                            </ul>
                        </li>
                        <li className="marked-text mt-short">
                            <span className="icon-marker color-blue">🚚</span>
                            <p className="ml-large">
                                <b>Транспортная компания</b><br />
                                Отправка через условную <i>«Транспортную компанию»</i>.<br />
                                Стоимость доставки становится известна при получении —
                                всё честно, без гаданий на калькуляторе.
                            </p> 
                        </li>
                    </ul>
                </div>

                <div className="section-info mt-large">
                    <h3>О сроках и упаковке</h3>

                    <ul className="no-list-markers mt-short">
                        <li className="marked-text">
                            <span className="icon-marker color-green">✔️</span>
                            <p className="ml-large">
                                Заказы передаются на доставку после сборки и упаковки,
                                обычно в течение <b>24 часов</b>.
                            </p>
                        </li>
                        <li className="marked-text">
                            <span className="icon-marker color-green">✔️</span>
                            <p className="ml-large">
                                Все посылки надёжно упакованы: удары, падения, проливные дожди —
                                ваши покупки выживут.
                            </p>
                        </li>
                        <li className="marked-text">
                            <span className="icon-marker color-green">✔️</span>
                            <p className="ml-large">
                                Срок доставки зависит от выбранного способа и логистической
                                загруженности — любите сюрпризы? Мы тоже.
                            </p>
                        </li>
                    </ul>
                </div>

                <div className="section-info mt-large">
                    <h3>Связь и вопросы</h3>

                    <p className="mt-short">
                        Если что-то непонятно, есть сомнения или вы просто боитесь рёва мотора
                        на старте — пишите или звоните:
                    </p>

                    <div className="centered-content mt-short">
                        <p className="marked-text">
                            <span className="icon-marker color-blue">📧</span>
                            <span className="ml-large">
                                <a
                                    href={`mailto:${COMPANY_DETAILS.emails.info}`}
                                    className="email-link"
                                >
                                    {COMPANY_DETAILS.emails.info}
                                </a>
                            </span>
                        </p>
                        <p className="marked-text mt-short">
                            <span className="icon-marker color-blue">📞</span>
                            <span className="ml-large">
                                <a href={`tel:${phoneLink}`} className="phone-link">
                                    {COMPANY_DETAILS.phone}
                                </a>
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
