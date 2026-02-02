import React, { forwardRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { navigationMap } from '@/config/appRouting.js';
import HeaderContentSmallScreen from './main-header/HeaderContentSmallScreen.jsx';
import HeaderContentMediumScreen from './main-header/HeaderContentMediumScreen.jsx';
import HeaderContentLargeScreen from './main-header/HeaderContentLargeScreen.jsx';
import { setDashboardPanelActivity } from '@/redux/slices/uiSlice.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { SCREEN_SIZE } = CLIENT_CONSTANTS;

const MainHeader = forwardRef(function (_, ref) {
    const { screenSize } = useSelector(state => state.ui);
    const { isAuthenticated, user } = useSelector(state => state.auth);

    const dispatch = useDispatch();
    const location = useLocation();

    const userRole = isAuthenticated ? user?.role ?? 'guest' : 'guest';
    const userName = isAuthenticated ? user?.name ?? 'Гость' : 'Гость';

    const setActiveClass = (paths) => paths?.includes(location.pathname) ? 'active' : null;
    const setFeaturedClass = (navItem) => navItem.featured ? 'featured' : null;

    const props = {
        userRole,
        userName,
        navigationMap,
        setActiveClass,
        setFeaturedClass
    };

    const headerContentsBySize = {
        [SCREEN_SIZE.XS]: <HeaderContentSmallScreen {...props} />,
        [SCREEN_SIZE.SMALL]: <HeaderContentSmallScreen {...props} />,
        [SCREEN_SIZE.MEDIUM]: <HeaderContentMediumScreen {...props} />,
        [SCREEN_SIZE.LARGE]: <HeaderContentLargeScreen {...props} />
    };

    const screenSizeKey = Object.entries(SCREEN_SIZE)
        .find(([_, max]) => max === screenSize)
        ?.[0].toLowerCase();

    // Установка флага активности dashboard-панели в хэдере
    useEffect(() => {
        const isDashboardPanelActive =
            [SCREEN_SIZE.LARGE].includes(screenSize) &&
            !!navigationMap[`${userRole}Dashboard`];
            
        dispatch(setDashboardPanelActivity(isDashboardPanelActive));
    }, [screenSize, userRole, dispatch]);
      
    return (
        <header ref={ref} className={`main-header ${screenSizeKey}-screen ${userRole}-role`}>
            {headerContentsBySize[screenSize] ?? null}
        </header>
    );
});

export default MainHeader;
