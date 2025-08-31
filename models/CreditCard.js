const mongoose = require('mongoose');

const creditCardSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bank_name: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true,
    maxlength: [100, 'Bank name cannot exceed 100 characters']
  },
  card_number: {
    type: String,
    required: [true, 'Card number is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{4}$/.test(v);
      },
      message: 'Card number must be last 4 digits only'
    }
  },
  limit_amount: {
    type: Number,
    min: [0, 'Limit amount cannot be negative'],
    default: null
  },
  due_date: {
    type: Number,
    min: [1, 'Due date must be between 1 and 31'],
    max: [31, 'Due date must be between 1 and 31'],
    required: [true, 'Due date is required']
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CreditCard', creditCardSchema);
