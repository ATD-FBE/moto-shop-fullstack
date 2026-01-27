import React from 'react';
import { useDispatch } from 'react-redux';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import { handleLogout } from '@/services/authService.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';

export default function AuthNav({ userRole, userName, navigationMap, setActiveClass }) {
    const authNavItems = navigationMap[`${userRole}Auth`] || [];
    const dispatch = useDispatch();

    const safeHandleLogout = async () => {
        dispatch(setIsNavigationBlocked(true));
        await dispatch(handleLogout());
        dispatch(setIsNavigationBlocked(false));
    };

    return (
        <div className="auth-wrapper">
            <nav className="auth-nav">
                <ul>
                    {authNavItems.map(navItem => {
                        switch (navItem.type) {
                            case 'userLabel':
                                return (
                                    <li key={navItem.type} className={setActiveClass(navItem.paths)}>
                                        {navItem.label}
                                        <BlockableLink className="user-name" to={navItem.paths[0]}>
                                            {userName}
                                        </BlockableLink>
                                    </li>
                                );
                
                            case 'logout':
                                return (
                                    <li key={navItem.type}>
                                        <button className="logout-btn" onClick={safeHandleLogout}>
                                            {navItem.label}
                                        </button>
                                    </li>
                                );
                
                            case 'link':
                            default:
                                return (
                                    <li key={navItem.paths[0]} className={setActiveClass(navItem.paths)}>
                                        <BlockableLink to={navItem.paths[0]}>
                                            {navItem.label}
                                        </BlockableLink>
                                    </li>
                                );
                        }
                    })}
                </ul>
            </nav>
        </div>
    );
};
