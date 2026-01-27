import mongoose from 'mongoose';

const { Schema } = mongoose;

const CriticalEventSchema = new Schema({
    category: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        default: 'UNKNOWN'
    },
    data: {
        type: Schema.Types.Mixed,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    resolved: {
        type: Boolean,
        default: false
    },
    resolvedAt: {
        type: Date
    },
    comment: {
        type: String
    }
});

const CriticalEvent = mongoose.model('CriticalEvent', CriticalEventSchema);

export default CriticalEvent;
