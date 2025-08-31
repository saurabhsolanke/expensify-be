const mongoose = require('mongoose');

const borrowedMoneySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Person name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },
  type: {
    type: String,
    enum: ['borrowed', 'lent'],
    required: [true, 'Type is required']
  },
  status: {
    type: String,
    enum: ['pending', 'repaid', 'partial'],
    default: 'pending'
  },
  note: {
    type: String,
    trim: true,
    maxlength: [500, 'Note cannot exceed 500 characters']
  },
  repaid_amount: {
    type: Number,
    default: 0,
    min: [0, 'Repaid amount cannot be negative']
  }
}, {
  timestamps: true
});

// Virtual for remaining amount
borrowedMoneySchema.virtual('remaining_amount').get(function() {
  return this.amount - this.repaid_amount;
});

// Ensure repaid_amount doesn't exceed total amount
borrowedMoneySchema.pre('save', function(next) {
  if (this.repaid_amount > this.amount) {
    this.repaid_amount = this.amount;
  }
  
  // Update status based on repaid amount
  if (this.repaid_amount === 0) {
    this.status = 'pending';
  } else if (this.repaid_amount >= this.amount) {
    this.status = 'repaid';
  } else {
    this.status = 'partial';
  }
  
  next();
});

module.exports = mongoose.model('BorrowedMoney', borrowedMoneySchema);
