import React from 'react';
import NotificationsBase from '@/components/pages/shared/NotificationsBase.jsx';
import NotificationCardCustomer from './customer-notifications/NotificationCardCustomer.jsx';
import NewNotificationsAlert from './customer-notifications/NewNotificationsAlert.jsx';

export default function CustomerNotifications() {
    return (
        <NotificationsBase
            showSort={true}
            resetNewNotification={true}
            headerContent={<h2>Просмотр уведомлений</h2>}
            renderNotificationCard={(notification, props) => (
                <NotificationCardCustomer
                    notification={notification}
                    {...props}
                />
            )}
            renderNewNotificationsAlert={props => <NewNotificationsAlert {...props} />}
        />
    );
};
