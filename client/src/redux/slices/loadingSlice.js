import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    activeApiRequests: 0,
    activeMediaRequests: 0,
    resetTimestamp: Date.now()
};

const loadingSlice = createSlice({
    name: 'loading',
    initialState,
    reducers: {
        incrementApiRequests: (state) => {
            state.activeApiRequests++;
        },

        decrementApiRequests: (state) => {
            state.activeApiRequests--;
        },

        incrementMediaRequests: (state) => {
            state.activeMediaRequests++;
        },

        decrementMediaRequests: (state) => {
            state.activeMediaRequests--;
        },

        resetActiveRequests: (state) => {
            state.activeApiRequests = 0;
            state.activeMediaRequests = 0;
            state.resetTimestamp = Date.now();
        }
    }
});

export const {
    incrementApiRequests,
    decrementApiRequests,
    incrementMediaRequests,
    decrementMediaRequests,
    resetActiveRequests
} = loadingSlice.actions;

export default loadingSlice.reducer;
