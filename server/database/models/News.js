import mongoose from 'mongoose';
import UpdateHistoryItemSchema from './schemas/UpdateHistoryItemSchema.js';
import { validationRules } from '../../../shared/validation.js';

const { Schema } = mongoose;

const NewsSchema = new Schema({
    publishDate: {
        type: Date,
        default: Date.now
    },
    title: {
        type: String,
        required: true,
        match: validationRules.news.title
    },
    content: {
        type: String,
        required: true,
        match: validationRules.news.content
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    updateHistory: [UpdateHistoryItemSchema]
});

const News = mongoose.model('News', NewsSchema);

export default News;
