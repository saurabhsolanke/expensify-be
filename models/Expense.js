const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Expense amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required']
  },
  payment_mode: {
    type: String,
    enum: ['cash', 'credit_card', 'borrowed'],
    required: [true, 'Payment mode is required']
  },
  credit_card_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CreditCard',
    default: null
  },
  borrowed_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BorrowedMoney',
    default: null
  },
  date: {
    type: Date,
    required: [true, 'Expense date is required'],
    default: Date.now
  },
  note: {
    type: String,
    trim: true,
    maxlength: [500, 'Note cannot exceed 500 characters']
  },
  is_recurring: {
    type: Boolean,
    default: false
  },
  recurring_frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
expenseSchema.index({ user_id: 1, date: -1 });
expenseSchema.index({ user_id: 1, category_id: 1 });
expenseSchema.index({ user_id: 1, payment_mode: 1 });

// Virtual for formatted date
expenseSchema.virtual('formatted_date').get(function() {
  return this.date.toLocaleDateString();
});

// Ensure credit_card_id is set when payment_mode is credit_card
expenseSchema.pre('save', function(next) {
  if (this.payment_mode === 'credit_card' && !this.credit_card_id) {
    return next(new Error('Credit card must be selected when payment mode is credit_card'));
  }
  
  if (this.payment_mode === 'borrowed' && !this.borrowed_id) {
    return next(new Error('Borrowed money reference must be set when payment mode is borrowed'));
  }
  
  next();
});

module.exports = mongoose.model('Expense', expenseSchema);
