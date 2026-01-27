import React from 'react';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import { routeConfig } from '@/config/appRouting.js';

export default function EventsMenu() {
    return (
        <div className="page-menu">
            <div className="menu-box">
                <h2>{routeConfig.events.label}</h2>

                <ul>
                    <li>
                        <BlockableLink to={routeConfig.news.paths[0]}>
                            {routeConfig.news.label}
                        </BlockableLink>
                    </li>
                    <li>
                        <BlockableLink to={routeConfig.promotions.paths[0]}>
                            {routeConfig.promotions.label}
                        </BlockableLink>
                    </li>
                </ul>
            </div>
        </div>
    );
};
