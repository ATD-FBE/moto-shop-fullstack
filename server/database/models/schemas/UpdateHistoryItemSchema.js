import mongoose from 'mongoose';

const { Schema } = mongoose;

const UpdateHistoryItemSchema = new Schema({
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    _id: false
});

export default UpdateHistoryItemSchema;
