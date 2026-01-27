import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { markAsTouchDevice, setScreenSize } from '@/redux/slices/uiSlice.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { SCREEN_MAX_SIZES } = CLIENT_CONSTANTS;

export default function useDeviceInfo() {
    const dispatch = useDispatch();

    useEffect(() => {
        const detectDeviceInfo = () => {
            const isTouchDevice = 'ontouchstart' in window;
            dispatch(markAsTouchDevice(isTouchDevice));
    
            const width = window.innerWidth;
            const screenSize = width <= SCREEN_MAX_SIZES.SMALL
                ? 'small'
                : width <= SCREEN_MAX_SIZES.MEDIUM
                    ? 'medium'
                    : 'large';
            dispatch(setScreenSize(screenSize));
        };

        detectDeviceInfo();

        window.addEventListener('resize', detectDeviceInfo);
        return () => window.removeEventListener('resize', detectDeviceInfo);
    }, [dispatch]);

    return null;
};
