import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    activeApiRequests: 0,
    activeMediaRequests: 0
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
        }
    }
});

export const {
    incrementApiRequests,
    decrementApiRequests,
    incrementMediaRequests,
    decrementMediaRequests
} = loadingSlice.actions;

export default loadingSlice.reducer;
