import React from 'react';
import { useSelector } from 'react-redux';
import { MoonLoader } from 'react-spinners';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';

export default function LogoLoader() {
    const { activeApiRequests, activeMediaRequests } = useSelector(state => state.loading);
    const isLoading = activeApiRequests > 0 || activeMediaRequests > 0;

    return (
        <div className="logo-loader">
            <TrackedImage
                className={cn('logo-image', { visible: !isLoading })}
                src="/images/logo.png"
                alt="Header Logo"
            />

            <MoonLoader
                className={cn('global-loader', { visible: isLoading })}
                color="rgb(25, 100, 195)"
                size={36}
                speedMultiplier={1}
                loading={true}
            />
        </div>
    );
};
