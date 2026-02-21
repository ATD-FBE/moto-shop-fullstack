// Информация о магазине
export const COMPANY_DETAILS = {
    _id: 'static',
    companyName: 'ИП Тристараев Пётр Игнатьевич',
    shopName: 'Мото-Магазин',
    inn: '7701234567',
    ogrn: '3047701234567',
    phone: '+7 (900) 123-45-67',
    emails: {
        info: 'info@moto-shop.ru',
        payments: 'payments@moto-shop.ru',
        opt: 'opt@moto-shop.ru'
    },
    legalAddress:
        'Дорожная Республика, Ездовая область, Двухколёсный район, ' +
        'г. Моторск, ул. Механиков, д. 7, стр. 2',
    displayAddress: 'Дорожная Республика, г. Моторск, ул. Механиков, д. 7, стр. 2',
    bank: {
        name: 'АО «Примербанк»',
        bik: '044525000',
        rs: '40702810900000001234',
        ks: '30101810400000000225'
    }
};

export const WORKING_HOURS = [
    { days: 'Пн–Пт', time: '08:00-17:00' },
    { days: 'Сб–Вс', time: 'выходной', closed: true },
];
