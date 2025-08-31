const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  is_default: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: '#667eea'
  },
  icon: {
    type: String,
    default: '💰'
  }
}, {
  timestamps: true
});

// Compound index to ensure unique category names per user
categorySchema.index({ name: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);
