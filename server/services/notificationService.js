export const prepareNotificationData = (dbNotification, { managed = false, edit = false } = {}) => ({
    id: dbNotification._id,
    subject: dbNotification.subject,
    message: dbNotification.message,
    signature: dbNotification.signature,
    sentAt: dbNotification.sentAt,
    ...(managed ? {
        status: dbNotification.status,
        recipients: dbNotification.recipients.map(r => edit ? r._id : r.name),
        createdBy: dbNotification.createdBy?.name,
        createdAt: dbNotification.createdAt,
        updatedAt: dbNotification.updatedAt,
        updateHistory: dbNotification.updateHistory?.map(upd => ({
            updatedBy: upd.updatedBy.name, updatedAt: upd.updatedAt
        })),
        sentBy: dbNotification.sentBy?.name
    } : {
        isRead: dbNotification.isRead,
        readAt: dbNotification.readAt
    })
});
