const apiControllers = new Set();

export const addApiController = (controller) => apiControllers.add(controller);

export const removeApiController = (controller) => apiControllers.delete(controller);

export const abortAllApiControllers = () => {
    apiControllers.forEach(controller => controller.abort());
    apiControllers.clear();
};
