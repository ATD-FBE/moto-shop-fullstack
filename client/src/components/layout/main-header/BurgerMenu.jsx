import React, { useState, useRef, useEffect } from 'react';
import cn from 'classnames';
import MainNav from './MainNav.jsx';
import DashboardNav from './DashboardNav.jsx';

export default function BurgerMenu({
    userRole,
    navigationMap,
    setActiveClass,
    setFeaturedClass
}) {
    const [isMenuOpen, setMenuOpen] = useState(false);
    const burgerMenuContainerRef = useRef(null);
    const burgerMenuRef = useRef(null);

    const hasDashboardNav = !!navigationMap[`${userRole}Dashboard`];

    useEffect(() => {
        if (!isMenuOpen) return;

        const handleClickOutside = (e) => {
            if (
                burgerMenuContainerRef.current &&
                !burgerMenuContainerRef.current.contains(e.target) &&
                !e.target.closest('.dropdown-portal')
            ) {
                setMenuOpen(false);
            }
        };
    
        document.addEventListener('mousedown', handleClickOutside);
        
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    return (
        <div
            className={cn('burger-menu-container', { 'menu-open': isMenuOpen })}
            ref={burgerMenuContainerRef}
        >
            <button
                className="burger-menu-btn"
                onClick={() => setMenuOpen(prev => !prev)}
                aria-expanded={isMenuOpen}
                aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            >
                <span className="icon">{isMenuOpen ? '✕' : '☰'}</span>
                <span className="title">Меню</span>
            </button>

            <div className="burger-menu" ref={burgerMenuRef}>
                <MainNav
                    navigationMap={navigationMap}
                    setActiveClass={setActiveClass}
                    setFeaturedClass={setFeaturedClass}
                    burgerMenuRef={burgerMenuRef}
                />

                {hasDashboardNav && (
                    <DashboardNav
                        userRole={userRole}
                        navigationMap={navigationMap}
                        setActiveClass={setActiveClass}
                        setFeaturedClass={setFeaturedClass}
                    />
                )}
            </div>
        </div>
    );
};
