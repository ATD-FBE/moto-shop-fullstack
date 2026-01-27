let lastInputWasKeyboard = false;

export const setKeyboardInput = () => {
    lastInputWasKeyboard = true;
};

export const setPointerInput = () => {
    lastInputWasKeyboard = false;
};

export const wasLastInputKeyboard = () => lastInputWasKeyboard;
