import React from 'react';
import { useSelector } from 'react-redux';

export default function OrderManagementBadge() {
    const activeCount = useSelector(state => state.auth.user?.managedActiveOrdersCount ?? 0);

    return activeCount > 0 ? (
        <div className="badge-box single-badge">
            <span className="badge">{activeCount}</span>
        </div>
    ) : null;
};
