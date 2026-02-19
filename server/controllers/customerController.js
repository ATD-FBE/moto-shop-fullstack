import mongoose from 'mongoose';
import User from '../database/models/User.js';
import Order from '../database/models/Order.js';
import { checkTimeout } from '../middlewares/timeoutMiddleware.js';
import { prepareOrderData } from '../services/orderService.js';
import {
    buildSearchMatch,
    buildFilterMatch,
    buildPaginatedPipeline,
    buildOrderedFiltersPipeline
} from '../utils/aggregationBuilders.js';
import { validateInputTypes } from '../utils/typeValidation.js';
import { runInTransaction } from '../utils/transaction.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { customersFilterOptions } from '../../shared/filterOptions.js';
import { customersSortOptions } from '../../shared/sortOptions.js';
import { customersPageLimitOptions } from '../../shared/pageLimitOptions.js';
import { DEFAULT_SEARCH_TYPE } from '../../shared/constants.js';
import { validationRules, fieldErrorMessages } from '../../shared/validation.js';
import { ORDER_STATUS } from '../../shared/constants.js';

/// Загрузка ID всех отфильтрованных клиентов и их данных для одной страницы ///
export const handleCustomerListRequest = async (req, res, next) => {
    // Настройка фильтра поиска
    const allowedSearchFields = ['name', 'email'];
    const searchMatch = buildSearchMatch(req.query.search, allowedSearchFields, DEFAULT_SEARCH_TYPE);

    // Настройка фильтра по параметрам
    const filterMatch = buildFilterMatch(req.query, customersFilterOptions);
    filterMatch.role = 'customer';

    // Пайплайн вывода ID всех отфильтрованных результатов
    const filteredPipeline = [{ $project: { _id: 1, name: 1 } }];

    // Пайплайн вывода результатов на странице
    const paginatedPipeline = buildPaginatedPipeline(
        req.query,
        customersSortOptions,
        customersPageLimitOptions
    );

    paginatedPipeline.push({
        $project: {
            _id: 0, // Иначе добавляется автоматически
            id: '$_id',
            name: 1,
            email: 1,
            discount: 1,
            totalSpent: 1,
            isBanned: 1,
            createdAt: 1
        }
    });

    // Установка порядка всех фильтров в зависимости от типа поиска
    const allFiltersPipeline = buildOrderedFiltersPipeline({ searchMatch, filterMatch });

    // Сборка пайплайна для агрегатора
    const pipeline = [
        ...allFiltersPipeline, // Фильтры
        {
            $facet: { // Сбор результатов
                filteredCustomerIdList: filteredPipeline,
                paginatedCustomerList: paginatedPipeline
            }
        }
    ];

    try {
        // Агрегатный запрос с информацией для отладки
        //const explainResult = await User.aggregate(pipeline).explain('executionStats');
        //console.dir(explainResult.stages[0].$cursor, { depth: null });

        // Агрегатный запрос
        const aggregateResult = await User.aggregate(pipeline);
        checkTimeout(req);
        
        const filteredCustomerNamesMap = Object.fromEntries(
            aggregateResult[0]?.filteredCustomerIdList.map(c => [c._id, c.name]) || []
        );
        const paginatedCustomerList = aggregateResult[0]?.paginatedCustomerList || [];

        safeSendResponse(req, res, 200, {
            message: 'Данные клиентов успешно загружены',
            filteredCustomerNamesMap,
            paginatedCustomerList
        });
    } catch (err) {
        next(err);
    }
};

/// Загрузка заказов клиента в таблице ///
export const handleCustomerOrderListRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const customerId = req.params.customerId;
    const firstOrderId = req.query.firstOrderId;
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const limit = Math.max(parseInt(req.query.limit, 10) || 0, 0);

    const inputTypeMap = {
        customerId: { value: customerId, type: 'objectId' },
        firstOrderId: { value: firstOrderId, type: 'objectId', optional: true }
    };

    const { invalidInputKeys } = validateInputTypes(inputTypeMap);

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }

    try {
        const matchFilter = { 
            customerId: mongoose.Types.ObjectId.createFromHexString(customerId), 
            currentStatus: { $ne: ORDER_STATUS.DRAFT }
        };
        let needFullReload = false;

        // Проверка ID первого загруженного заказа при дозагрузке следующей порции заказов
        if (firstOrderId) {
            const firstOrder = await Order.findOne(matchFilter)
                .select('_id')
                .sort({ confirmedAt: -1 })
                .lean();
            checkTimeout(req);
        
            if (!firstOrder || firstOrder._id.toString() !== firstOrderId) {
                needFullReload = true;
            }
        }

        const totalCustomerOrders = await Order.countDocuments(matchFilter);
        checkTimeout(req);

        const effectiveSkip = needFullReload ? 0 : skip;
        const effectiveLimit = needFullReload && limit > 0 ? skip + limit : limit;

        const dbCustomerOrderList = await Order.find(matchFilter)
            .sort({ confirmedAt: -1 })
            .skip(effectiveSkip)
            .limit(effectiveLimit)
            .lean();
        checkTimeout(req);

        const customerOrderList = dbCustomerOrderList.map(dbOrder => prepareOrderData(dbOrder, {
            inList: true,
            managed: false,
            details: false,
            viewerRole: dbUser.role
        }));

        safeSendResponse(req, res, 200, {
            message: 'Заказы клиента успешно загружены',
            totalCustomerOrders,
            customerOrderList,
            needFullReload
        });
    } catch (err) {
        next(err);
    }
};

/// Изменение скидки клиента ///
export const handleCustomerDiscountUpdateRequest = async (req, res, next) => {
    const customerId = req.params.customerId;
    const { discount } = req.body ?? {};

    const inputTypeMap = {
        customerId: { value: customerId, type: 'objectId' },
        discount: { value: discount, type: 'number', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'customer');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    const discountNum = Number(discount);
    const discountValidator = validationRules.customer.discount;

    if (!discountValidator || !discountValidator(discountNum)) {
        return safeSendResponse(req, res, 422, {
            message: 'Некорректное значение поля',
            fieldErrors: {
                discount: fieldErrorMessages.customer.discount?.default || fieldErrorMessages.DEFAULT
            }
        });
    }

    try {
        const { customerLbl } = await runInTransaction(async (session) => {
            const dbCustomer = await User.findByIdAndUpdate(
                customerId,
                { discount: discountNum },
                { new: true, session }
            );
            checkTimeout(req);

            const customerLbl = dbCustomer ? dbCustomer.name : `(ID: ${customerId})`;
    
            if (!dbCustomer) {
                throw createAppError(404, `Клиент ${customerLbl} не найден`);
            }

            return { customerLbl };
        });

        safeSendResponse(req, res, 200, {
            message: `Скидка клиента ${customerLbl} успешно изменена на ${discountNum}%`,
            updatedFields: { discount: discountNum }
        });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};

/// Изменение статуса блокировки клиента ///
export const handleCustomerBanToggleRequest = async (req, res, next) => {
    const customerId = req.params.customerId;
    const { newBanStatus } = req.body ?? {};

    const inputTypeMap = {
        customerId: { value: customerId, type: 'objectId' },
        newBanStatus: { value: newBanStatus, type: 'boolean' }
    };

    const { invalidInputKeys } = validateInputTypes(inputTypeMap);

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }

    try {
        const { customerLbl } = await runInTransaction(async (session) => {
            const dbCustomer = await User.findByIdAndUpdate(
                customerId,
                { isBanned: newBanStatus },
                { new: true, session }
            );
            checkTimeout(req);
        
            const customerLbl = dbCustomer ? dbCustomer.name : `(ID: ${customerId})`;
    
            if (!dbCustomer) {
                throw createAppError(404, `Клиент ${customerLbl} не найден`);
            }

            return { customerLbl };
        });

        const banStatusText = newBanStatus ? 'заблокирован' : 'разблокирован';

        safeSendResponse(req, res, 200, {
            message: `Статус блокировки клиента ${customerLbl}: ${banStatusText}`,
            updatedFields: { isBanned: newBanStatus }
        });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        next(err);
    }
};
