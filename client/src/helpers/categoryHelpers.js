// Функция создания карты категорий и полноценного дерева из прямых данных
export const buildCategoryTreeAndMap = (flatCategoryList) => {
    const categoryMap = {};
    const categoryTree = [];

    // Создание карты категорий по ключу id
    flatCategoryList.forEach(({ id, ...rest }) => {
        categoryMap[id] = {
            id,
            ...rest,
            subcategories: []
        };
    });

    // Заполнение подкатегорий карты и сборка дерева
    flatCategoryList.forEach(cat => {
        const node = categoryMap[cat.id];

        if (cat.parent) {
            categoryMap[cat.parent]?.subcategories.push(node);
        } else {
            categoryTree.push(node);
        }
    });

    // Рекурсивная сортировка подкатегорий
    const sortSubcategoriesByOrder = (cat) => {
        cat.subcategories.sort((a, b) => a.order - b.order);
        cat.subcategories.forEach(sortSubcategoriesByOrder);
    };
    
    categoryTree.sort((a, b) => a.order - b.order); // Сортировка корневых категорий
    categoryTree.forEach(sortSubcategoriesByOrder); // Сортировка всех вложенных подкатегорий

    return { categoryTree, categoryMap };
};

// Рекурсивная функция создания цепочки имён (пути) от корня к выбранной категории
export const findCategoryPath = (categoryTree, selectedCategoryId) => {
    if (!selectedCategoryId) return [''];

    const findPath = (tree) => {
        for (const category of tree) {
            if (category.id === selectedCategoryId) return [category.id];

            const path = findPath(category.subcategories);
            if (path.length) return [category.id, ...path];
        }
        return [];
    };

    const path = findPath(categoryTree);
    return path.length ? ['', ...path] : [];
};

// Рекурсивная функция получения ID всех категорий, имеющих подкатегории
export const getAllExpandableCategoryIds = (categoryTree) => {
    const openableCategories = [];

    for (const category of categoryTree) {
        if (!category.subcategories.length) continue;
        openableCategories.push(category.id, ...getAllExpandableCategoryIds(category.subcategories));
    }

    return openableCategories;
};

// Получение всех конечных категорий - рекурсивный вариант по дереву
export const getLeafCategories = (categoryTree) =>
    categoryTree.flatMap(cat =>
        !cat.subcategories.length
            ? [{ id: cat.id, name: cat.name, slug: cat.slug }]
            : getLeafCategories(cat.subcategories)
    );

// Получение всех конечных категорий - вариант с фильтрацией карты
/*export const getLeafCategories = (categoryMap) =>
    Object.values(categoryMap)
        .filter(cat => !cat.subcategories.length)
        .map(cat => { id: cat.id, name: cat.name, slug: cat.slug });*/

// Рекурсивная функция получения всех потомков выбранной категории
export const getDescendantCategoryIds = (selectedCategory) => {
    const descendants = [];

    const getDescendants = (tree) => {
        for (const category of tree) {
            descendants.push(category.id);

            if (category.subcategories.length) {
                getDescendants(category.subcategories);
            }
        }
    };

    if (selectedCategory?.subcategories.length) {
        getDescendants(selectedCategory.subcategories);
    }
    return descendants;
};

// Рекурсивная функция создания карты всех валидных родителей для категории
export const buildSafeParentCategoryMap = (categoryMap, categoryTree, rootLabel = '(корень)') => {
    const allCategories = Object.values(categoryMap);

    // Создание карты потомков для их кэширования
    const descendantsCache = new Map();

    const getDescendants = (cat) => {
        // Поиск потомков в кэше
        if (descendantsCache.has(cat.id)) {
            return descendantsCache.get(cat.id);
        }

        const descendantSet = new Set(); // Собирать потомков в Set для быстрого доступа

        for (const subcat of cat.subcategories) {
            descendantSet.add(subcat.id);

            const subcatDescendants = getDescendants(subcat);
            subcatDescendants.forEach(id => descendantSet.add(id));
        }

        descendantsCache.set(cat.id, descendantSet); // Кэширование потомков
        return descendantSet;
    };

    allCategories.forEach(cat => getDescendants(cat));

    // Сбор select-опций для выбора родителя категорий
    const rootOption = {
        id: '',
        label: `${rootLabel} (${categoryTree.length || 'нет'} кат.)`,
        subcategoryCount: categoryTree.length
    };

    const dataMap = allCategories.reduce((map, currentCat) => {
        const descendants = descendantsCache.get(currentCat.id); // Set

        const options = allCategories
            .filter(cat =>
                cat.id !== currentCat.id &&
                !descendants.has(cat.id) &&
                !cat.restricted
            )
            .map(cat => ({
                id: cat.id,
                label: `${cat.name} (${cat.subcategories.length || 'нет'} подкат.)`,
                subcategoryCount: cat.subcategories.length
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        const subcatCounts = options.reduce((acc, { id, subcategoryCount }) => {
            acc[id] = subcategoryCount;
            return acc;
        }, {});
        subcatCounts[rootOption.id] = rootOption.subcategoryCount;

        map[currentCat.id] = {
            selectOptions: [rootOption, ...options],
            subcatCounts
        };
        return map;
    }, {});

    return dataMap;
};
