export const ORDER_VIEW_MATRIX = {
    admin: {
        page: { inList: false, managed: true, details: true },
        list: { inList: true, managed: false, details: false }
    },
    customer: {
        page: { inList: false, managed: false, details: true },
        list: { inList: true, managed: false, details: true }
    }
};
