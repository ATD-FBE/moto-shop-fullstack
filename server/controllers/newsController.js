import News from '../database/models/News.js';
import { prepareNewsData } from '../services/newsService.js';
import { typeCheck, validateInputTypes } from '../utils/typeValidation.js';
import { parseValidationErrors } from '../utils/errorUtils.js';
import safeSendResponse from '../utils/safeSendResponse.js';

/// Загрузка всех новостей ///
export const handleNewsListRequest = async (req, res, next) => {
    const isAdmin = req.dbUser?.role === 'admin';
    const selectedDbFields = '_id publishDate title content' + (isAdmin ? ' createdBy updateHistory' : '');

    try {
        let dbNewsQuery = News.find() // Поиск всех новостей
            .sort({ publishDate: -1 }) // Сортировка от новой новости к старой
            .select(selectedDbFields); // Выборка только нужных полей

        if (isAdmin) { // Заполнение полей с именами пользователей по ссылкам на их _id в коллекции users
            dbNewsQuery = dbNewsQuery
                .populate('createdBy', 'name')
                .populate('updateHistory.updatedBy', 'name');
        }

        const dbNewsList = await dbNewsQuery.lean(); // Преобразование в обычный JS-объект
        const newsList = dbNewsList.map(news => prepareNewsData(news, { managed: isAdmin }));

        safeSendResponse(req, res, 200, { message: 'Новости успешно загружены', newsList });
    } catch (err) {
        next(err);
    }
};

/// Загрузка отдельной новости для редактирования ///
export const handleNewsRequest = async (req, res, next) => {
    const newsId = req.params.newsId;

    if (!typeCheck.objectId(newsId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: newsId' });
    }

    try {
        const dbNews = await News.findById(newsId).select('title content').lean();

        if (!dbNews) {
            return safeSendResponse(req, res, 404, { message: `Новость (ID: ${newsId}) не найдена` });
        }

        safeSendResponse(req, res, 200, {
            message: `Новость "${dbNews.title}" успешно загружена`,
            news: prepareNewsData(dbNews)
        });
    } catch (err) {
        next(err);
    }
};

/// Создание новости ///
export const handleNewsCreateRequest = async (req, res, next) => {
    const userId = req.dbUser._id;
    const { title, content } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        title: { value: title, type: 'string', form: true },
        content: { value: content, type: 'string', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'news');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Создание документа в базе MongoDB
    try {
        const newNews = await News.create({
            title: title.trim(),
            content: content.trim(),
            createdBy: userId
        });

        safeSendResponse(req, res, 201, { message: `Новость "${newNews.title}" успешно создана` });
    } catch (err) {
        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'news');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Изменение новости ///
export const handleNewsUpdateRequest = async (req, res, next) => {
    const userId = req.dbUser._id;
    const newsId = req.params.newsId;
    const { title, content } = req.body ?? {};

    // Предварительная проверка формата данных
    const inputTypeMap = {
        newsId: { value: newsId, type: 'objectId' },
        title: { value: title, type: 'string', form: true },
        content: { value: content, type: 'string', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'news');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Апдейт документа в базе MongoDB
    try {
        // Проверка на существование изменяемой новости
        const dbNews = await News.findById(newsId);
        
        if (!dbNews) {
            return safeSendResponse(req, res, 404, { message: `Новость (ID: ${newsId}) не найдена` });
        }

        const oldTitle = dbNews.title;

        // Установка новых данных и проверка их изменений
        dbNews.set({
            title: title.trim(),
            content: content.trim()
        });

        if (!dbNews.isModified()) {
            return safeSendResponse(req, res, 204);
        }

        // Добавление лога редактирования и сохранение в базе MongoDB
        dbNews.updateHistory.push({ updatedBy: userId, updatedAt: new Date() });
        await dbNews.save();

        safeSendResponse(req, res, 200, { message: `Новость "${oldTitle}" успешно изменена` });
    } catch (err) {
        // Обработка ошибок валидации полей
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'news');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Удаление новости ///
export const handleNewsDeleteRequest = async (req, res, next) => {
    const newsId = req.params.newsId;

    if (!typeCheck.objectId(newsId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: newsId' });
    }

    try {
        const dbNews = await News.findByIdAndDelete(newsId);

        if (!dbNews) {
            return safeSendResponse(req, res, 404, { message: `Новость (ID: ${newsId}) не найдена` });
        }

        safeSendResponse(req, res, 200, { message: `Новость "${dbNews.title}" успешно удалена` });
    } catch (err) {
        next(err);
    }
};
