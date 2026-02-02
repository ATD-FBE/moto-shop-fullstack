import React from 'react';
import ResourceLoader from './ResourceLoader.jsx';
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

            <ResourceLoader />

            <AuthNav
                userRole={userRole}
                userName={userName}
                navigationMap={navigationMap}
                setActiveClass={setActiveClass}
            />
        </div>
    );
};
