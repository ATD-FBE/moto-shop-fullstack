import { PROMO_STORAGE_FOLDER, STORAGE_URL_PATH } from '../config/paths.js';

export const preparePromoData = (dbPromo, { managed = false } = {}) => ({
    id: dbPromo._id,
    title: dbPromo.title,
    image: preparePromoImage(dbPromo._id.toString(), dbPromo.imageFilename),
    description: dbPromo.description,
    startDate: dbPromo.startDate,
    endDate: dbPromo.endDate,
    ...(managed && {
        createdBy: dbPromo.createdBy?.name,
        createdAt: dbPromo.createdAt,
        updateHistory: dbPromo.updateHistory?.map(upd => ({
            updatedBy: upd.updatedBy.name, updatedAt: upd.updatedAt
        }))
    })
});

const preparePromoImage = (promoId, filename) => {
    if (!filename) return undefined; // Опциональная картинка
    return [STORAGE_URL_PATH, PROMO_STORAGE_FOLDER, promoId, filename].join('/');
};
