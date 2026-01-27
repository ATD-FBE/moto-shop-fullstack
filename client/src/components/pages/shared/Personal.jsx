import React from 'react';
import { useSelector } from 'react-redux';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import { navigationMap } from '@/config/appRouting.js';

export default function Personal() {
    const { user } = useSelector(state => state.auth);
    const userRole = user?.role ?? 'guest';
    const personalNavItems = navigationMap[`${userRole}Personal`] || [];

    return (
        <div className="personal-page">
            <header className="personal-header">
                <h2>Добро пожаловать в ваш личный кабинет, {user.name}!</h2>
            </header>
            
            <div className="personal-menu-wrapper">
                <ul className="personal-menu">
                    {personalNavItems.map(navItem => (
                        <li key={navItem.paths[0]} className="personal-item">
                            <BlockableLink to={navItem.paths[0]}>
                                {navItem.label}
                                <span className="icon">▶️</span>
                            </BlockableLink>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
