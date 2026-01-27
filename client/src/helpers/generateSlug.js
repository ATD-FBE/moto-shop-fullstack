const allowedChars = new Set('abcdefghijklmnopqrstuvwxyz0123456789-_ ');

const cyrillicToLatinMap = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
    'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
    'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
    'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
    'э': 'e', 'ю': 'yu', 'я': 'ya'
};

const extraCharMap = {
    'ë': 'e', 'ñ': 'n', 'ç': 'c', 'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss',
    'é': 'e', 'è': 'e', 'ê': 'e', 'à': 'a', 'á': 'a', 'â': 'a', 'î': 'i', 'ï': 'i',
    '.': '_', ',': '_', ':': '-', ';': '-', '—': '-', '–': '-'
};

const punctuationMap = {
    '\'': '_',
    ',': '_',
    '.': '_',
    '!': '_',
    '?': '_',
    ':': '-',
    ';': '-',
    '—': '-',
    '–': '-',
    '/': '_'
};

function transliterate(str) {
    return str.toLowerCase().split('').map(char => {
        if (allowedChars.has(char)) return char; // a-z, 0-9, -, _, пробел
        if (cyrillicToLatinMap[char]) return cyrillicToLatinMap[char]; // Транслитерация кириллицы
        if (extraCharMap[char]) return extraCharMap[char]; // Транслитерация других известных букв
        if (punctuationMap[char]) return punctuationMap[char]; // Транслитерация знаков пунктуации
        return ''; // Удаление неизвестных букв
    }).join('');
}

export default function generateSlug(str) {
    return transliterate(str)
        .replace(/\s+/g, '-')           // Пробелы в дефисы
        .replace(/-+/g, '-')            // Множественные дефисы в один
        .replace(/_+/g, '_')            // Множественные подчёркивания в один
        .replace(/^[-_]+|[-_]+$/g, ''); // Удаление дефиса и подчёркивания с начала/конца
};
