import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import { routeConfig } from '@/config/appRouting.js';
import { formatCurrency } from '@/helpers/textHelpers.js';
import { MIN_ORDER_AMOUNT } from '@shared/constants.js';
import { WORKING_HOURS } from '@shared/company.js';
 
export default function Home() {
    const [bannerLoaded, setBannerLoaded] = useState(false);
    const [search, setSearch] = useState('');
    const navigate = useNavigate();

    const handleSearch = () => {
        const normalizedSearch = search.trim();
        if (!normalizedSearch) return;

        const params = new URLSearchParams({ search: normalizedSearch });
        const urlParams = params.toString();
        const catalogPath = routeConfig.catalog.paths[0];
        const catalogUrl = `${catalogPath}?${urlParams}`;

        navigate(catalogUrl);
    };

    return (
        <div className="home-page">
            <div className="home-hero">
                <TrackedImage
                    className="home-banner-image"
                    src="images/home-banner.jpg"
                    alt="Home Banner"
                    onLoad={() => setBannerLoaded(true)}
                />
                
                <div className={cn('home-hero-text', { 'visible': bannerLoaded })}>
                    <p className="title">
                        <b>
                            <span className="letter-enhance">М</span>ото-
                            <span className="letter-enhance">М</span>агазин
                        </b>
                    </p>
                    <p>
                        Запчасти и экипировка для тех,<br />
                        кто знает, зачем и в чём лезет в мотор.
                    </p>
                    <p>
                        Расходники, редкие детали и аксессуары<br />
                        для дорожных и внедорожных мотоциклов.
                    </p>
                    <p>
                        Подбор, консультации и доставка по всей стране.
                    </p>
                </div>
            </div>

            <div className="home-search-bar">
                <p className="search-title">
                    Найти нужную деталь можно, воспользовавшись
                    поиском<span className="warn">*</span> в каталоге товаров прямо отсюда:
                </p>

                <div className="search-controls">
                    <input
                        type="search"
                        placeholder="По артикулу, наименованию, бренду или тегам товара"
                        title="По артикулу, наименованию, бренду или тегам товара"
                        value={search}
                        autoComplete="off"
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />

                    <button
                        className="search-btn"
                        onClick={handleSearch}
                        disabled={search.trim() === ''}
                    >
                        Поиск
                    </button>
                </div>

                <p className="search-help">
                    *Например: Honda, тормозной диск, шлем LS2, аккум, 50cc, KLEMA-001, Morechi.
                    Частичный поиск также работает.
                </p>
            </div>

            <div className="home-onboarding">
                <h4 className="home-onboarding-title">Как здесь всё устроено:</h4>

                <ul className="home-onboarding-list">
                    <li>Добавляй товары в корзину — даже без регистрации.</li>
                    <li>Корзина сохранится, пока ты думаешь.</li>
                    <li>Оформить заказ можно будет сразу после авторизации.</li>
                    <li>Минимальная сумма заказа — {formatCurrency(MIN_ORDER_AMOUNT)} ₽</li>
                    <li>Если сомневаешься — мы подскажем и подберём.</li>
                </ul>
            </div>

            <div className="home-nav-catalog">
                <button
                    className="nav-catalog-btn"
                    onClick={() => navigate(routeConfig.catalog.paths[0])}
                >
                    Перейти в каталог
                </button>
            </div>

            <div className="home-working-hours">
                <h4 className="home-working-hours-title">График работы:</h4>
                
                {WORKING_HOURS.map((item, idx) => (
                    <p key={idx}>
                        {item.days}:{' '}
                        <span className={item.closed ? 'closed' : 'time'}>{item.time}</span>
                    </p>
                ))}
            </div>

            <div className="home-info">
                <h4 className="home-info-title">Полезная информация:</h4>
                <p>
                    Все лицензии и сертификаты, а также условия доставки и оплаты,
                    можно найти на соответствующих страницах сайта.
                    Если возникнут вопросы, наши контакты всегда под рукой — напиши нам или позвони.
                </p>
            </div>
        </div>
    );
};
