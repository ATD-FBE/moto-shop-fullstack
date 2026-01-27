import mongoose from 'mongoose';
import uniqueValidator from 'mongoose-unique-validator';
import { validationRules } from '../../../shared/validation.js';

const { Schema } = mongoose;

const CategorySchema = new Schema({
    name: {
        type: String,
        required: true,
        match: validationRules.category.name
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        match: validationRules.category.slug
    },
    order: { // Индексация от 0
        type: Number,
        min: 0,
        required: true
    },
    parent: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        default: null,
        index: true
    },
    restricted: {
        type: Boolean,
        default: false
    }
});

// Запрет удаления категории "Неотсортированные товары" ("unsorted")
CategorySchema.pre('remove', function(next) {
    if (this.slug === 'unsorted') {
        return next(new Error(`Категорию ${this.name} удалять нельзя.`));
    }

    next();
});

// Плагин, собирающий все ошибки уникальности полей до выбрасывания исключения
CategorySchema.plugin(uniqueValidator);

const Category = mongoose.model('Category', CategorySchema);

export default Category;
