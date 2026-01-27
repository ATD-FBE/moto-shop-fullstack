import React from 'react';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import { routeConfig } from '@/config/appRouting.js';

export default function DocumentsMenu() {
    return (
        <div className="page-menu">
            <div className="menu-box">
                <h2>{routeConfig.documents.label}</h2>

                <ul>
                    <li>
                        <BlockableLink to={routeConfig.guarantees.paths[0]}>
                            {routeConfig.guarantees.label}
                        </BlockableLink>
                    </li>
                    <li>
                        <BlockableLink to={routeConfig.insurance.paths[0]}>
                            {routeConfig.insurance.label}
                        </BlockableLink>
                    </li>
                    <li>
                        <BlockableLink to={routeConfig.licenses.paths[0]}>
                            {routeConfig.licenses.label}
                        </BlockableLink>
                    </li>
                    <li>
                        <BlockableLink to={routeConfig.companyDetails.paths[0]}>
                            {routeConfig.companyDetails.label}
                        </BlockableLink>
                    </li>
                </ul>
            </div>
        </div>
    );
};
