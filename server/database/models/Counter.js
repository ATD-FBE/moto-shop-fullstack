import mongoose from 'mongoose';

const { Schema } = mongoose;

const CounterSchema = new Schema({
    entity: {
        type: String,
        required: true,
        unique: true // Задаёт индекс по этому полю для быстрого поиска
    },
    seq: {
        type: Number,
        default: 0
    }
});
  
const Counter = mongoose.model('Counter', CounterSchema);

export default Counter;
