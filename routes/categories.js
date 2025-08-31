const express = require('express');
const auth = require('../middleware/auth');
const Category = require('../models/Category');

const router = express.Router();

// @route   POST /api/categories
// @desc    Create a new category
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, color, icon } = req.body;

    // Check if category already exists for this user
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      user_id: req.user._id
    });

    if (existingCategory) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }

    const category = new Category({
      name,
      user_id: req.user._id,
      color: color || '#667eea',
      icon: icon || '💰'
    });

    await category.save();

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error('Category creation error:', error);
    res.status(500).json({ message: 'Server error while creating category' });
  }
});

// @route   GET /api/categories
// @desc    Get all categories for user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const categories = await Category.find({ user_id: req.user._id })
      .sort({ is_default: -1, name: 1 });

    res.json({ categories });
  } catch (error) {
    console.error('Category fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching categories' });
  }
});

// @route   GET /api/categories/:id
// @desc    Get category by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ category });
  } catch (error) {
    console.error('Category fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching category' });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, color, icon } = req.body;

    // Check if name is being changed and if it conflicts with existing
    if (name) {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        user_id: req.user._id,
        _id: { $ne: req.params.id }
      });

      if (existingCategory) {
        return res.status(400).json({ message: 'Category with this name already exists' });
      }
    }

    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { name, color, icon },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    console.error('Category update error:', error);
    res.status(500).json({ message: 'Server error while updating category' });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (category.is_default) {
      return res.status(400).json({ message: 'Cannot delete default categories' });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Category deletion error:', error);
    res.status(500).json({ message: 'Server error while deleting category' });
  }
});

// @route   POST /api/categories/setup-defaults
// @desc    Setup default categories for new user
// @access  Private
router.post('/setup-defaults', auth, async (req, res) => {
  try {
    const defaultCategories = [
      { name: 'Food & Dining', color: '#FF6B6B', icon: '🍽️' },
      { name: 'Transportation', color: '#4ECDC4', icon: '🚗' },
      { name: 'Shopping', color: '#45B7D1', icon: '🛍️' },
      { name: 'Entertainment', color: '#96CEB4', icon: '🎬' },
      { name: 'Healthcare', color: '#FFEAA7', icon: '🏥' },
      { name: 'Utilities', color: '#DDA0DD', icon: '💡' },
      { name: 'Travel', color: '#98D8C8', icon: '✈️' },
      { name: 'Education', color: '#F7DC6F', icon: '📚' },
      { name: 'Gifts', color: '#BB8FCE', icon: '🎁' },
      { name: 'Other', color: '#AEB6BF', icon: '📌' }
    ];

    const existingCategories = await Category.find({ user_id: req.user._id });
    
    if (existingCategories.length > 0) {
      return res.status(400).json({ message: 'Default categories already set up' });
    }

    const categories = defaultCategories.map(cat => ({
      ...cat,
      user_id: req.user._id,
      is_default: true
    }));

    await Category.insertMany(categories);

    res.json({
      message: 'Default categories created successfully',
      count: categories.length
    });
  } catch (error) {
    console.error('Default categories setup error:', error);
    res.status(500).json({ message: 'Server error while setting up default categories' });
  }
});

module.exports = router;
