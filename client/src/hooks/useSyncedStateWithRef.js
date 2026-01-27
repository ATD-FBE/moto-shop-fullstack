import { useState, useRef } from 'react';

export default function useSyncedStateWithRef(initialValue) {
    const [state, setState] = useState(initialValue);
    const ref = useRef(state);

    const set = (updater) => {
        setState(prev => {
            const updatedValue = typeof updater === 'function' ? updater(prev) : updater;
            ref.current = updatedValue;
            return updatedValue;
        });
    };

    return [state, set, ref];
};
