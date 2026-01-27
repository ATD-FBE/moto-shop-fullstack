import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, Link } from 'react-router-dom';
import { setLockedRouteCancelPath } from '@/redux/slices/uiSlice.js';

export default function BlockableLink({ to, children, ...props }) {
    const { isNavigationBlocked, lockedRoute } = useSelector(state => state.ui);
    const dispatch = useDispatch();
    const location = useLocation();

    const handleClick = (e) => {
        if (isNavigationBlocked) {
            e.preventDefault();
            console.warn('Навигация заблокирована в данный момент');

            if (
                lockedRoute &&
                location.pathname === lockedRoute.path &&
                !lockedRoute.isCancelFreeze
            ) {
                dispatch(setLockedRouteCancelPath(to));
            }
        }
    };

    return (
        <Link to={to} onClick={handleClick} {...props}>
            {children}
        </Link>
    );
};
