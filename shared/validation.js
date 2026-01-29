import {
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_PROMO_IMAGE_SIZE_MB,
    MAX_PRODUCT_IMAGE_SIZE_MB,
    PRODUCT_FILES_LIMIT,
    PRODUCT_UNITS,
    DELIVERY_METHOD_OPTIONS,
    PAYMENT_METHOD_OPTIONS,
    REFUND_METHOD_OPTIONS,
    BANK_PROVIDER,
    CARD_ONLINE_PROVIDER
} from './constants.js';

/// Валидация полей формы ///
const userNameValidation = /^[\wа-яА-ЯёЁ.-][\wа-яА-ЯёЁ\s.-]{1,28}[\wа-яА-ЯёЁ.-]$/;
const emailValidation = /^[a-zA-Z0-9]([a-zA-Z0-9_.-]*[a-zA-Z0-9])?@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
const passwordValidation = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9@#$%^&*!?-]{8,30}$/;
const adminCodeValidation = /^[a-zA-Z0-9@#$%^&*!?-]{1,30}$/;
const textValidation = /\S+/;
const naturalValidation = /^\d+$/;
const decimalValidation = /^\d+(\.\d+)?$/;
const currencyValidation = /^\d+(?:\.\d{1,2})?$/;
const currencySignedValidation = /^-?\d+(?:\.\d{1,2})?$/;
const dateValidation = /^\d{4}-\d{2}-\d{2}$/;
const slugValidation = /^[a-z0-9_-]{2,}$/;
const skuValidation = /^[A-Z]{2,5}-\d{2,5}$/;
const phoneValidation = /^(\+7|8)\d{10}$/;
const cvcValidation = /^\d{3,4}$/;
const expiryMonthValidation = /^(0[1-9]|1[0-2])$/;

const alwaysPassValidation = () => true;

const booleanRequiredValidation = (val) => val === true;

const imageValidation = (file, allowedTypes, maxSizeMB, optional = false) => {
    if (!file) return optional;

    const allowedTypesRegex = new RegExp(allowedTypes.join('|'));

    if (!allowedTypesRegex.test(file.type)) return false;
    if (file.size > Math.floor(maxSizeMB * 1024 * 1024)) return false;
    return true;
};

const recipientsValidation = (recipients) => Array.isArray(recipients) && recipients.length > 0;

const productUnitValidation = (val) => PRODUCT_UNITS.includes(val);

const discountValidation = (val) =>
    val !== '' &&
    Number.isInteger(val = Number(val)) &&
    val >= 0 &&
    val <= 100;

const deliveryMethodValidation = (val) => DELIVERY_METHOD_OPTIONS.some(opt => opt.value === val);

const paymentMethodValidation = (val) => PAYMENT_METHOD_OPTIONS.some(opt => opt.value === val);

const refundMethodValidation = (val) => REFUND_METHOD_OPTIONS.some(opt => opt.value === val);

const providerValidation = (val) =>
    [...Object.values(BANK_PROVIDER), ...Object.values(CARD_ONLINE_PROVIDER)].includes(val);

const cardNumberValidation = (val) => /^\d{16}$/.test(val.replace(/\s/g, ''));

const expiryYearValidation = (val) => val >= new Date().getFullYear() % 100;

export const validationRules = {
    auth: {
        name: userNameValidation,
        email: emailValidation,
        password: passwordValidation,
        confirmPassword: passwordValidation,
        adminCode: adminCodeValidation,
        newName: userNameValidation,
        newEmail: emailValidation,
        currentPassword: passwordValidation,
        newPassword: passwordValidation,
        confirmNewPassword: passwordValidation
    },
    customer: {
        discount: discountValidation
    },
    news: {
        title: textValidation,
        content: textValidation
    },
    promotion: {
        title: textValidation,
        image: imageValidation,
        description: textValidation,
        startDate: dateValidation,
        endDate: dateValidation
    },
    notification: {
        recipients: recipientsValidation,
        subject: textValidation,
        message: textValidation,
        signature: textValidation
    },
    category: {
        name: textValidation,
        slug: slugValidation,
        order: naturalValidation,
        parent: alwaysPassValidation // select с динамическими вычисленными options или output
    },
    product: {
        images: imageValidation,
        sku: skuValidation,
        name: textValidation,
        brand: textValidation,
        description: textValidation,
        stock: naturalValidation,
        unit: productUnitValidation,
        price: currencyValidation,
        discount: discountValidation,
        category: alwaysPassValidation, // select с динамически вычисленными options
        tags: textValidation,
        isActive: alwaysPassValidation
    },
    checkout: {
        firstName: textValidation,
        lastName: textValidation,
        middleName: textValidation,
        email: emailValidation,
        phone: phoneValidation,
        deliveryMethod: deliveryMethodValidation,
        allowCourierExtra: alwaysPassValidation,
        region: textValidation,
        district: textValidation,
        city: textValidation,
        street: textValidation,
        house: textValidation,
        apartment: textValidation,
        postalCode: textValidation,
        defaultPaymentMethod: paymentMethodValidation,
        customerComment: textValidation
    },
    order: {
        firstName: textValidation,
        lastName: textValidation,
        middleName: textValidation,
        email: emailValidation,
        phone: phoneValidation,
        deliveryMethod: deliveryMethodValidation,
        allowCourierExtra: alwaysPassValidation,
        region: textValidation,
        district: textValidation,
        city: textValidation,
        street: textValidation,
        house: textValidation,
        apartment: textValidation,
        postalCode: textValidation,
        defaultPaymentMethod: paymentMethodValidation,
        shippingCost: currencyValidation,
        itemQuantity: naturalValidation,
        editReason: textValidation,
        cancellationReason: textValidation,
        internalNote: textValidation
    },
    financials: {
        totalPaid: currencyValidation,
        totalRefunded: currencyValidation,
        amount: currencyValidation,     // Общее поле для payment и refund действий
        transactionId: textValidation,  // Общее поле для payment и refund действий
        failureReason: textValidation,  // Общее поле для payment и refund действий
        eventId: textValidation,
        voidedNote: textValidation
    },
    payment: {
        method: paymentMethodValidation,
        provider: providerValidation,
        amount: currencyValidation,
        transactionId: textValidation,
        markAsFailed: alwaysPassValidation,
        failureReason: textValidation,
        cardNumber: cardNumberValidation,
        cvc: cvcValidation,
        expiryMonth: expiryMonthValidation,
        expiryYear: expiryYearValidation
    },
    refund: {
        method: refundMethodValidation,
        provider: providerValidation,
        amount: currencyValidation,
        transactionId: textValidation,
        originalPaymentId: textValidation,
        markAsFailed: alwaysPassValidation,
        failureReason: textValidation,
        externalReference: textValidation
    }
};

/// Сообщения об ошибках полей формы ///
export const fieldErrorMessages = {
    DEFAULT: 'Некорректное значение',

    auth: {
        name: {
            default: 'Имя (3–30 символов) может включать буквы, цифры, пробелы и знаки _ . -',
            login: 'Неверное имя пользователя',
            unique: 'Пользователь с таким именем уже существует'
        },
        email: {
            default: 'Неверный формат email',
            unique: 'Пользователь с таким email уже существует'
        },
        password: {
            default: 'Пароль (8-30 символов) должен содержать хотя бы одну цифру и букву',
            login: 'Неверный пароль'
        },
        confirmPassword: {
            default: 'Подтверждение пароля не совпадает или указано в неверном формате'
        },
        adminCode: {
            default: 'Код администратора указан в неверном формате'
        },
        newName: {
            default: 'Имя (3–30 символов) может включать буквы, цифры, пробелы и знаки _ . -',
            unique: 'Пользователь с таким именем уже существует',
            duplicate: 'Это имя уже привязано к аккаунту'
        },
        newEmail: {
            default: 'Неверный формат email',
            unique: 'Пользователь с таким email уже существует',
            duplicate: 'Этот email уже привязан к аккаунту'
        },
        currentPassword: {
            default: 'Текущий пароль указан неверно'
        },
        newPassword: {
            default: 'Пароль (8-30 символов) должен содержать хотя бы одну цифру и букву',
            duplicate: 'Новый пароль не может быть таким же, как текущий'
        },
        confirmNewPassword: {
            default: 'Подтверждение нового пароля не совпадает или указано в неверном формате'
        }
    },

    customer: {
        discount: {
            default: 'Допустимо целое число от 0 до 100'
        }
    },

    news: {
        title: {
            default: 'Название новости обязательно для заполнения'
        },
        content: {
            default: 'Содержание новости должно быть указано'
        }
    },

    promotion: {
        title: {
            default: 'Название акции обязательно для заполнения'
        },
        image: {
            default: `Изображение не должно превышать ${MAX_PROMO_IMAGE_SIZE_MB} МБ` +
                ' и должно быть в формате ' +
                ALLOWED_IMAGE_MIME_TYPES
                    .map(type => type.split('/').pop().toUpperCase())
                    .concat('JPG')
                    .sort((a, b) => a.localeCompare(b))
                    .join(', ')
        },
        description: {
            default: 'Описание акции обязательно для заполнения'
        },
        startDate: {
            default: 'Дата начала акции обязательна',
            mismatch: 'Некорректная дата начала акции'
        },
        endDate: {
            default: 'Дата окончания акции обязательна',
            mismatch: 'Некорректная дата окончания акции',
            rangeError: 'Дата окончания акции не может быть раньше даты её начала'
        }
    },

    notification: {
        recipients: {
            default: 'Необходимо указать хотя бы один ID получателя',
            mismatch: 'ID получателей отсутствуют или не соответствуют формату'
        },
        subject: {
            default: 'Тема уведомления обязательна для заполнения'
        },
        message: {
            default: 'Содержание уведомления должно быть указано'
        },
        signature: {
            default: 'Отправитель уведомления должен быть указан'
        }
    },

    category: {
        name: {
            default: 'Название категории обязательно для заполнения'
        },
        slug: {
            default: 'Адрес категории (от 2 символов): строчные латинские буквы, цифры и знаки _ -',
            unique: 'Такой адрес уже существует'
        },
        order: {
            default: 'Некорректный номер категории'
        }
    },
    
    product: {
        images: {
            default: `Максимум ${PRODUCT_FILES_LIMIT} фотографий. ` +
                `Каждый файл должен не превышать ${MAX_PRODUCT_IMAGE_SIZE_MB} МБ и быть в формате ` +
                ALLOWED_IMAGE_MIME_TYPES
                    .map(type => type.split('/').pop().toUpperCase())
                    .concat('JPG')
                    .sort((a, b) => a.localeCompare(b))
                    .join(', ')
        },
        sku: {
            default: 'Артикул должен быть в формате: 2-5 заглавных латинских букв, дефис, 2-5 цифр' +
                ' (от AA-00 до ZZZZZ-99999)',
            unique: 'Товар с таким артикулом уже существует'
        },
        name: {
            default: 'Наименование товара обязательно для заполнения'
        },
        brand: {        // Опциональное поле
            default: ''
        },
        description: {  // Опциональное поле
            default: ''
        },
        unit: {
            default: 'Некорректная товарная единица'
        },
        stock: {
            default: 'Допустимо целое число от 0'
        },
        reserved: {     // Для парсера ошибок
            default: ''
        },
        price: {
            default: 'Некорректная цена'
        },
        discount: {
            default: 'Допустимо целое число от 0 до 100'
        },
        category: {
            default: 'Некорректное значение категории товара'
        },
        tags: {
            default: 'Теги должны разделяться запятой или запятой с пробелом'
        },
        isActive: {
            default: 'Некорректное значение статуса доступности товара'
        }
    },

    checkout: {
        firstName: {
            default: 'Имя обязательно для заполнения'
        },
        lastName: {
            default: 'Фамилия обязательна для заполнения'
        },
        middleName: {   // Опциональное поле
            default: ''
        },
        email: {
            default: 'Неверный формат email'
        },
        phone: {
            default: 'Номер телефона должен быть в формате +7 (xxx) xxx-xx-xx или 8 (xxx) xxx-xx-xx ' +
                '(без пробелов, скобок и дефисов)'
        },
        deliveryMethod: {
            default: 'Необходимо выбрать способ доставки'
        },
        region: {       // Опциональное поле
            default: ''
        },
        district: {     // Опциональное поле
            default: ''
        },
        city: {
            default: 'Город обязателен для заполнения'
        },
        street: {
            default: 'Улица обязательна для заполнения'
        },
        house: {
            default: 'Номер дома обязателен для заполнения'
        },
        apartment: {    // Опциональное поле
            default: ''
        },
        postalCode: {   // Опциональное поле
            default: ''
        },
        defaultPaymentMethod: {
            default: 'Необходимо выбрать способ оплаты'
        },
        customerComment: { // Опциональное поле
            default: ''
        }
    },

    order: {
        firstName: {
            default: 'Имя обязательно для заполнения'
        },
        lastName: {
            default: 'Фамилия обязательна для заполнения'
        },
        middleName: {   // Опциональное поле
            default: ''
        },
        email: {
            default: 'Неверный формат email'
        },
        phone: {
            default: 'Номер телефона должен быть в формате +7 (xxx) xxx-xx-xx или 8 (xxx) xxx-xx-xx ' +
                '(без пробелов, скобок и дефисов)'
        },
        deliveryMethod: {
            default: 'Необходимо выбрать способ доставки'
        },
        region: {       // Опциональное поле
            default: ''
        },
        district: {     // Опциональное поле
            default: ''
        },
        city: {
            default: 'Город обязателен для заполнения'
        },
        street: {
            default: 'Улица обязательна для заполнения'
        },
        house: {
            default: 'Номер дома обязателен для заполнения'
        },
        apartment: {    // Опциональное поле
            default: ''
        },
        postalCode: {   // Опциональное поле
            default: ''
        },
        defaultPaymentMethod: {
            default: 'Необходимо выбрать способ оплаты'
        },
        shippingCost: {
            default: 'Некорректное значение'
        },
        itemQuantity: {
            default: 'Некоррект. кол-во'
        },
        editReason: {
            default: 'Причина изменений обязательна для заполнения'
        },
        cancellationReason: {
            default: 'Обязательно к заполнению'
        },
        internalNote: {  // Опциональное поле
            default: ''
        }
    },

    financials: {
        totalPaid: {     // Для парсера ошибок
            default: ''
        },
        totalRefunded: { // Для парсера ошибок
            default: ''
        },
        amount: {        // Общее поле при оплате/возврате для проверки в схеме Mongoose
            default: 'Некорректная сумма'
        },
        transactionId: { // Общее поле при оплате/возврате для проверки в схеме Mongoose
            default: 'Некорректный ID транзакции'
        },
        failureReason: { // Общее поле при оплате/возврате для проверки в схеме Mongoose
            default: 'Некорректная причина неуспеха'
        },
        eventId: {
            default: 'Некорректный ID финансового события'
        },
        voidedNote: {    // Опциональное поле
            default: ''
        }
    },

    payment: {
        method: {
            default: 'Необходимо выбрать способ оплаты',
            mismatch: 'Некорректный способ оплаты'
        },
        provider: {
            default: 'Некорректный провайдер',
        },
        amount: {
            default: 'Некорректная сумма оплаты'
        },
        transactionId: {
            default: 'ID транзакции оплаты обязателен',
            mismatch: 'Некорректный ID транзакции оплаты'
        },
        markAsFailed: {
            default: 'Некорректное значение флага'
        },
        failureReason: { // Опциональное поле
            default: ''
        },
        cardNumber: {
            default: 'Некорректный номер карты'
        },
        cvc: {
            default: 'Некорректный CVC'
        },
        expiryMonth: {
            default: 'Некорректный месяц действия карты'
        },
        expiryYear: {
            default: 'Некорректный год действия карты'
        }
    },
    
    refund: {
        method: {
            default: 'Необходимо выбрать способ возврата',
            mismatch: 'Некорректный способ возврата'
        },
        provider: {
            default: 'Некорректный источник возврата',
        },
        amount: {
            default: 'Некорректная сумма возврата'
        },
        transactionId: {
            default: 'ID транзакции возврата обязателен',
            mismatch: 'Некорректный ID транзакции возврата'
        },
        markAsFailed: {
            default: 'Некорректное значение флага'
        },
        failureReason: { // Опциональное поле
            default: ''
        },
        originalPaymentId: { // Для парсера ошибок
            default: ''
        },
        externalReference: { // Опциональное поле
            default: ''
        }
    }
};
