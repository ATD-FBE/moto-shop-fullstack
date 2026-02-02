import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    isTouchDevice: false,
    screenSize: null,
    dashboardPanelActive: false,
    isNavigationBlocked: false,
    lockedRoute: null, // { path: '/', cancelPath: null, isCancelFreeze: true/false }
    sessionReady: false,
    newNotificationsCount: 0,
    newManagedActiveOrdersCount: 0
};

const uiSlice = createSlice({
    name: 'ui',
    initialState,
    reducers: {
        markAsTouchDevice: (state, action) => {
            state.isTouchDevice = action.payload;
        },

        setScreenSize: (state, action) => {
            state.screenSize = action.payload;
        },

        setDashboardPanelActivity(state, action) {
            state.dashboardPanelActive = action.payload;
        },

        setIsNavigationBlocked: (state, action) => {
            state.isNavigationBlocked = action.payload;
        },

        setLockedRoute: (state, action) => {
            state.lockedRoute = { path: action.payload, cancelPath: null, isCancelFreeze: false };
            state.isNavigationBlocked = true;
        },

        setLockedRouteCancelPath: (state, action) => {
            if (state.lockedRoute) state.lockedRoute.cancelPath = action.payload;
        },

        freezeLockedRouteCancel(state) { // Нельзя изменить cancel-маршрут после заморозки состояния
            if (state.lockedRoute) state.lockedRoute.isCancelFreeze = true;
        },

        clearLockedRoute: (state) => {
            state.lockedRoute = null;
            state.isNavigationBlocked = false;
        },

        setSessionReady: (state, action) => {
            state.sessionReady = action.payload;
        },

        adjustNewNotificationsCount: (state, action) => {
            state.newNotificationsCount += Math.max(0, action.payload);
        },

        resetNewNotificationsCount: (state) => {
            state.newNotificationsCount = 0;
        },

        adjustNewManagedActiveOrdersCount: (state, action) => {
            state.newManagedActiveOrdersCount += Math.max(0, action.payload);
        },

        resetNewManagedActiveOrdersCount: (state) => {
            state.newManagedActiveOrdersCount = 0;
        }
    }
});

export const {
    markAsTouchDevice,
    setScreenSize,
    setDashboardPanelActivity,
    setIsNavigationBlocked,
    setLockedRoute,
    setLockedRouteCancelPath,
    freezeLockedRouteCancel,
    clearLockedRoute,
    setSessionReady,
    adjustNewNotificationsCount,
    resetNewNotificationsCount,
    adjustNewManagedActiveOrdersCount,
    resetNewManagedActiveOrdersCount
} = uiSlice.actions;

export default uiSlice.reducer;
