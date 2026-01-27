import React from 'react';
import { useSelector } from 'react-redux';

export default function NotificationsBadge() {
    const unreadCount = useSelector(state => state.auth.user?.unreadNotificationsCount ?? 0);

    return unreadCount > 0 ? (
        <div className="badge-box single-badge">
            <span className="badge">{unreadCount}</span>
        </div>
    ) : null;
};
