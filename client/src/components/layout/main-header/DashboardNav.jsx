import React from 'react';
import cn from 'classnames';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import CartBadge from '@/components/common/badges/CartBadge.jsx';
import NotificationsBadge from '@/components/common/badges/NotificationsBadge.jsx';
import OrderManagementBadge from '@/components/common/badges/OrderManagementBadge.jsx';

export default function DashboardNav({ userRole, navigationMap, setActiveClass, setFeaturedClass }) {
    const dashboardNavItems = navigationMap[`${userRole}Dashboard`] || [];

    return (
        <nav className={`dashboard-nav ${userRole}-role`}>
            <ul>
                {dashboardNavItems.map(navItem => (
                    <li
                        key={navItem.paths[0]}
                        className={cn(setFeaturedClass(navItem), setActiveClass(navItem.paths))}
                    >
                        <BlockableLink to={navItem.paths[0]}>
                            {navItem.label}
                            {navItem.badge === 'cart' && <CartBadge />}
                            {navItem.badge === 'notifications' && <NotificationsBadge />}
                            {navItem.badge === 'order-management' && <OrderManagementBadge />}
                        </BlockableLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
};
