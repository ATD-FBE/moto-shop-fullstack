import mongoose from 'mongoose';

export async function runInTransaction(handler, options = {}) {
    // Создание сессии транзакции
    const session = await mongoose.startSession();

    try {
        // Начало транзакции
        const result = await session.withTransaction(async () => {
            return await handler(session);
        }, options);

        return result;
    } finally {
        // Конец транзакции
        await session.endSession();
    }
};
