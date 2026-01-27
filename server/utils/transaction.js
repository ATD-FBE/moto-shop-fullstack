import mongoose from 'mongoose';

export async function runInTransaction(handler, options = {}) {
    // Создание сессии транзакции
    const session = await mongoose.startSession();

    try {
        let result;

        // Начало транзакции
        await session.withTransaction(async () => {
            result = await handler(session);
        }, options);

        return result;
    } finally {
        // Конец транзакции
        await session.endSession();
    }
};
