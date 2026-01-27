export const prepareNewsData = (dbNews, { managed = false } = {}) => ({
    id: dbNews._id,
    publishDate: dbNews.publishDate,
    title: dbNews.title,
    content: dbNews.content,
    ...(managed && {
        createdBy: dbNews.createdBy?.name,
        updateHistory: dbNews.updateHistory?.map(upd => ({
            updatedBy: upd.updatedBy.name, updatedAt: upd.updatedAt
        }))
    })
});
