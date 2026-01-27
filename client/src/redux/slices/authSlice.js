import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    isAuthenticated: false,
    isLocalSession: false,
    suppressAuthRedirect: false,
    forceRedirectToLogin: false,
    user: null,
    accessTokenExpiresAt: 0,
    refreshTokenExpiresAt: 0
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        login: (state, action) => {
            const {
                isLocalSession = false,
                suppressAuthRedirect = false,
                user,
                accessTokenExp = 0,
                refreshTokenExp = 0
            } = action.payload;
            
            state.isAuthenticated = true;
            state.isLocalSession = isLocalSession;
            state.suppressAuthRedirect = suppressAuthRedirect;
            state.forceRedirectToLogin = false;
            state.user = user;
            state.accessTokenExpiresAt = accessTokenExp;
            state.refreshTokenExpiresAt = refreshTokenExp;
        },

        logout: (state, action) => {
            state.isAuthenticated = false;
            state.isLocalSession = false;
            state.suppressAuthRedirect = false;
            state.forceRedirectToLogin = Boolean(action.payload);
            state.user = null;
            state.accessTokenExpiresAt = 0;
            state.refreshTokenExpiresAt = 0;
        },

        updateUser: (state, action) => {
            state.user = action.payload;
        },

        updateCustomerDiscount: (state, action) => {
            if (!state.user) return;
            
            state.user = { 
                ...state.user, 
                discount: action.payload
            };
        },

        setAccessTokenExpiry(state, action) {
            state.accessTokenExpiresAt = action.payload;
        },

        resetSuppressAuthRedirect: (state) => {
            state.suppressAuthRedirect = false;
        },

        adjustUnreadNotificationsCount: (state, action) => {
            if (!state.user) return;

            const newCount = action.payload || 0;
            if (!newCount) return;

            state.user = { 
                ...state.user, 
                unreadNotificationsCount: Math.max(0, state.user.unreadNotificationsCount + newCount) 
            };
        },

        adjustManagedActiveOrdersCount: (state, action) => {
            if (!state.user) return;

            const newCount = action.payload || 0;
            if (!newCount) return;

            state.user = { 
                ...state.user, 
                managedActiveOrdersCount: Math.max(0, state.user.managedActiveOrdersCount + newCount) 
            };
        }
    }
});

export const {
    login,
    logout,
    updateUser,
    updateCustomerDiscount,
    setAccessTokenExpiry,
    resetSuppressAuthRedirect,
    adjustUnreadNotificationsCount,
    adjustManagedActiveOrdersCount
} = authSlice.actions;

export default authSlice.reducer;
