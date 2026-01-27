import React from 'react';
import { useSelector } from 'react-redux';
import cn from 'classnames';
import LogoLoader from './LogoLoader.jsx';
import MainTitle from './MainTitle.jsx';
import MainNav from './MainNav.jsx';
import AuthNav from './AuthNav.jsx';
import DashboardNav from './DashboardNav.jsx';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { DASHBOARD_TITLES } = CLIENT_CONSTANTS;

export default function HeaderContentLargeScreen({
    userRole,
    userName,
    navigationMap,
    setActiveClass,
    setFeaturedClass
}) {
    const isDashboardActive = useSelector(state => state.ui.dashboardPanelActive);

    return (
        <>
            <div className={cn('header-main-panel', { 'dashboard-panel-active': isDashboardActive })}>
                <LogoLoader />

                <MainTitle />

                <MainNav
                    navigationMap={navigationMap}
                    setActiveClass={setActiveClass}
                    setFeaturedClass={setFeaturedClass}
                />

                <AuthNav
                    userRole={userRole}
                    userName={userName}
                    navigationMap={navigationMap}
                    setActiveClass={setActiveClass}
                />
            </div>

            {isDashboardActive && (
                <div className={`dashboard-panel ${userRole}-role`}>
                    <header className="dashboard-header">
                        <h2>{DASHBOARD_TITLES[userRole.toUpperCase()] || userRole}</h2>
                    </header>

                    <DashboardNav
                        userRole={userRole}
                        navigationMap={navigationMap}
                        setActiveClass={setActiveClass}
                        setFeaturedClass={setFeaturedClass}
                    />
                </div>
            )}
        </>
    );
};
