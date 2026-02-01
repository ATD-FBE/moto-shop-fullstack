export const processFormattedFieldDeletion = (e, context) => {
    const { value, selectionStart, selectionEnd, charRegex = /\d/, format } = context;
    if (!value) return null;

    const isBackspace = e.key === 'Backspace';
    const isDelete = e.key === 'Delete';
    if (!isBackspace && !isDelete) return null;

    let newValue = value;
    let newCursorPos = selectionStart; // Дефолт для диапазона и Delete

    // Если есть выделение — простое вырезание выделенного диапазона
    if (selectionStart !== selectionEnd) {
        newValue = value.slice(0, selectionStart) + value.slice(selectionEnd);
        // newCursorPos остаётся selectionStart
    } else {
        // Если выделения нет — работаем с одиночными символами
        if (isBackspace) {
            if (selectionStart === 0) return null;
            
            // Поиск и удаление ближайшего значащего символа слева от курсора
            let charToDeleteIdx = selectionStart - 1;
            while (charToDeleteIdx >= 0 && !charRegex.test(value[charToDeleteIdx])) {
                charToDeleteIdx--;
            }
            if (charToDeleteIdx < 0) return null;
            
            newValue = value.slice(0, charToDeleteIdx) + value.slice(charToDeleteIdx + 1);
            newCursorPos = charToDeleteIdx; // Символ перед курсором удалён
        } else if (isDelete) {
            if (selectionStart === value.length) return null;

            // Поиск и удаление ближайшего значащего символа справа от курсора
            let charToDeleteIdx = selectionStart;
            while (charToDeleteIdx < value.length && !charRegex.test(value[charToDeleteIdx])) {
                charToDeleteIdx++;
            }
            if (charToDeleteIdx >= value.length) return null;

            newValue = value.slice(0, charToDeleteIdx) + value.slice(charToDeleteIdx + 1);
            // newCursorPos равен selectionStart, так как слева от курсора не было изменений
        }
    }

    // Форматирование нового значения с удалённым значащим символом или диапазоном
    const formattedValue = format ? format(newValue) : newValue;

    return {
        preventDefault: true, // Браузер не изменит value инпута (onChange не сработает)
        nextValue: formattedValue,
        nextCursorPos: calcFormattedFieldCursorPos(newValue, newCursorPos, formattedValue, charRegex)
    };
};

export const calcFormattedFieldCursorPos = (rawString, rawCursorPos, formattedString, charRegex) => {
    // Поиск значащих символов до курсора в старой строке
    let validCharsCount = 0;
    
    for (let i = 0; i < rawCursorPos; i++) {
        if (charRegex.test(rawString[i])) {
            validCharsCount++;
        }
    }

    // Основной поиск позиции по количеству значащих символов в новой строке
    let newCursorPos = 0;
    let foundChars = 0;

    while (foundChars < validCharsCount && newCursorPos < formattedString.length) {
        if (charRegex.test(formattedString[newCursorPos])) {
            foundChars++;
        }
        newCursorPos++;
    }

    // Пропуск разделителей перед следующим значащим символом
    while (newCursorPos < formattedString.length && !charRegex.test(formattedString[newCursorPos])) {
        newCursorPos++;
    }

    return newCursorPos;
};
