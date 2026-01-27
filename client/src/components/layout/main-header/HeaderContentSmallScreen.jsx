import React from 'react';
import LogoLoader from './LogoLoader.jsx';
import AuthNav from './AuthNav.jsx';
import BurgerMenu from './BurgerMenu.jsx';

export default function HeaderContentSmallScreen({
    userRole,
    userName,
    navigationMap,
    setActiveClass,
    setFeaturedClass
}) {
    return (
        <div className="header-main-panel">
            <BurgerMenu
                userRole={userRole}
                navigationMap={navigationMap}
                setActiveClass={setActiveClass}
                setFeaturedClass={setFeaturedClass}
            />

            <LogoLoader />

            <AuthNav
                userRole={userRole}
                userName={userName}
                navigationMap={navigationMap}
                setActiveClass={setActiveClass}
            />
        </div>
    );
};
