const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['credit_card', 'borrowed'],
    required: [true, 'Payment type is required']
  },
  reference_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Reference ID is required']
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0.01, 'Payment amount must be greater than 0']
  },
  payment_date: {
    type: Date,
    required: [true, 'Payment date is required'],
    default: Date.now
  },
  note: {
    type: String,
    trim: true,
    maxlength: [500, 'Note cannot exceed 500 characters']
  },
  payment_method: {
    type: String,
    enum: ['cash', 'bank_transfer', 'upi', 'cheque'],
    default: 'bank_transfer'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);
