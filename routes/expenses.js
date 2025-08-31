const express = require('express');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const CreditCard = require('../models/CreditCard');
const BorrowedMoney = require('../models/BorrowedMoney');

const router = express.Router();

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// @route   POST /api/expenses
// @desc    Create a new expense
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const {
      amount,
      category_id,
      payment_mode,
      credit_card_id,
      borrowed_id,
      date,
      note,
      is_recurring,
      recurring_frequency
    } = req.body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    if (!category_id) {
      return res.status(400).json({ message: 'Category is required' });
    }

    if (!payment_mode) {
      return res.status(400).json({ message: 'Payment mode is required' });
    }

    // Validate ObjectId format for category_id
    if (!isValidObjectId(category_id)) {
      return res.status(400).json({ 
        message: 'Invalid category ID format. Category ID must be a valid MongoDB ObjectId.',
        field: 'category_id',
        value: category_id
      });
    }

    // Validate category exists and belongs to user
    const category = await Category.findOne({ _id: category_id, user_id: req.user._id });
    if (!category) {
      return res.status(400).json({ 
        message: 'Category not found or does not belong to you',
        field: 'category_id',
        value: category_id
      });
    }

    // Validate credit card if payment mode is credit_card
    if (payment_mode === 'credit_card') {
      if (!credit_card_id) {
        return res.status(400).json({ 
          message: 'Credit card is required for credit card payment',
          field: 'credit_card_id'
        });
      }
      if (!isValidObjectId(credit_card_id)) {
        return res.status(400).json({ 
          message: 'Invalid credit card ID format. Credit card ID must be a valid MongoDB ObjectId.',
          field: 'credit_card_id',
          value: credit_card_id
        });
      }
      const creditCard = await CreditCard.findOne({ _id: credit_card_id, user_id: req.user._id });
      if (!creditCard) {
        return res.status(400).json({ 
          message: 'Credit card not found or does not belong to you',
          field: 'credit_card_id',
          value: credit_card_id
        });
      }
    }

    // Validate borrowed money if payment mode is borrowed
    if (payment_mode === 'borrowed') {
      if (!borrowed_id || borrowed_id.trim() === '') {
        return res.status(400).json({ 
          message: 'Borrowed money reference is required',
          field: 'borrowed_id'
        });
      }
      if (!isValidObjectId(borrowed_id)) {
        return res.status(400).json({ 
          message: 'Invalid borrowed money ID format. Borrowed money ID must be a valid MongoDB ObjectId.',
          field: 'borrowed_id',
          value: borrowed_id
        });
      }
      const borrowed = await BorrowedMoney.findOne({ _id: borrowed_id, user_id: req.user._id });
      if (!borrowed) {
        return res.status(400).json({ 
          message: 'Borrowed money record not found or does not belong to you',
          field: 'borrowed_id',
          value: borrowed_id
        });
      }
    }

    // Clean up empty string values to prevent ObjectId casting errors
    const cleanBorrowedId = borrowed_id && borrowed_id.trim() !== '' ? borrowed_id : undefined;
    const cleanCreditCardId = credit_card_id && credit_card_id.trim() !== '' ? credit_card_id : undefined;

    const expense = new Expense({
      user_id: req.user._id,
      amount,
      category_id,
      payment_mode,
      credit_card_id: cleanCreditCardId,
      borrowed_id: cleanBorrowedId,
      date: date || new Date(),
      note,
      is_recurring,
      recurring_frequency
    });

    await expense.save();

    // Populate references for response
    await expense.populate([
      { path: 'category_id', select: 'name color icon' },
      { path: 'credit_card_id', select: 'bank_name card_number' },
      { path: 'borrowed_id', select: 'name amount type' }
    ]);

    res.status(201).json({
      message: 'Expense created successfully',
      expense
    });
  } catch (error) {
    console.error('Expense creation error:', error);
    res.status(500).json({ message: 'Server error while creating expense' });
  }
});

// @route   GET /api/expenses
// @desc    Get all expenses for user with filters
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      start_date,
      end_date,
      category_id,
      payment_mode,
      min_amount,
      max_amount,
      sort_by = 'date',
      sort_order = 'desc'
    } = req.query;

    const filter = { user_id: req.user._id };

    // Date range filter
    if (start_date || end_date) {
      filter.date = {};
      if (start_date) filter.date.$gte = new Date(start_date);
      if (end_date) filter.date.$lte = new Date(end_date);
    }

    // Category filter
    if (category_id) {
      if (!isValidObjectId(category_id)) {
        return res.status(400).json({ message: 'Invalid category ID format' });
      }
      filter.category_id = category_id;
    }

    // Payment mode filter
    if (payment_mode) {
      filter.payment_mode = payment_mode;
    }

    // Amount range filter
    if (min_amount || max_amount) {
      filter.amount = {};
      if (min_amount) filter.amount.$gte = parseFloat(min_amount);
      if (max_amount) filter.amount.$lte = parseFloat(max_amount);
    }

    // Sorting
    const sort = {};
    sort[sort_by] = sort_order === 'desc' ? -1 : 1;

    const expenses = await Expense.find(filter)
      .populate('category_id', 'name color icon')
      .populate('credit_card_id', 'bank_name card_number')
      .populate('borrowed_id', 'name amount type')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(filter);

    res.json({
      expenses,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      hasNext: page * limit < total,
      hasPrev: page > 1
    });
  } catch (error) {
    console.error('Expense fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching expenses' });
  }
});

// @route   GET /api/expenses/:id
// @desc    Get expense by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      user_id: req.user._id
    }).populate([
      { path: 'category_id', select: 'name color icon' },
      { path: 'credit_card_id', select: 'bank_name card_number' },
      { path: 'borrowed_id', select: 'name amount type' }
    ]);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ expense });
  } catch (error) {
    console.error('Expense fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching expense' });
  }
});

// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Validate category if being updated
    if (req.body.category_id) {
      if (!isValidObjectId(req.body.category_id)) {
        return res.status(400).json({ 
          message: 'Invalid category ID format. Category ID must be a valid MongoDB ObjectId.',
          field: 'category_id',
          value: req.body.category_id
        });
      }
      const category = await Category.findOne({ _id: req.body.category_id, user_id: req.user._id });
      if (!category) {
        return res.status(400).json({ 
          message: 'Category not found or does not belong to you',
          field: 'category_id',
          value: req.body.category_id
        });
      }
    }

    // Validate credit card if payment mode is credit_card
    if (req.body.payment_mode === 'credit_card' && req.body.credit_card_id) {
      if (!isValidObjectId(req.body.credit_card_id)) {
        return res.status(400).json({ 
          message: 'Invalid credit card ID format. Credit card ID must be a valid MongoDB ObjectId.',
          field: 'credit_card_id',
          value: req.body.credit_card_id
        });
      }
      const creditCard = await CreditCard.findOne({ _id: req.body.credit_card_id, user_id: req.user._id });
      if (!creditCard) {
        return res.status(400).json({ 
          message: 'Credit card not found or does not belong to you',
          field: 'credit_card_id',
          value: req.body.credit_card_id
        });
      }
    }

    // Validate borrowed money if payment mode is borrowed
    if (req.body.payment_mode === 'borrowed' && req.body.borrowed_id) {
      if (!req.body.borrowed_id || req.body.borrowed_id.trim() === '') {
        return res.status(400).json({ 
          message: 'Borrowed money reference is required',
          field: 'borrowed_id'
        });
      }
      if (!isValidObjectId(req.body.borrowed_id)) {
        return res.status(400).json({ 
          message: 'Invalid borrowed money ID format. Borrowed money ID must be a valid MongoDB ObjectId.',
          field: 'borrowed_id',
          value: req.body.borrowed_id
        });
      }
      const borrowed = await BorrowedMoney.findOne({ _id: req.body.borrowed_id, user_id: req.user._id });
      if (!borrowed) {
        return res.status(400).json({ 
          message: 'Borrowed money record not found or does not belong to you',
          field: 'borrowed_id',
          value: req.body.borrowed_id
        });
      }
    }

    // Clean up empty string values in update data
    const updateData = { ...req.body };
    if (updateData.borrowed_id !== undefined && updateData.borrowed_id !== null) {
      updateData.borrowed_id = updateData.borrowed_id.trim() !== '' ? updateData.borrowed_id : undefined;
    }
    if (updateData.credit_card_id !== undefined && updateData.credit_card_id !== null) {
      updateData.credit_card_id = updateData.credit_card_id.trim() !== '' ? updateData.credit_card_id : undefined;
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'category_id', select: 'name color icon' },
      { path: 'credit_card_id', select: 'bank_name card_number' },
      { path: 'borrowed_id', select: 'name amount type' }
    ]);

    res.json({
      message: 'Expense updated successfully',
      expense: updatedExpense
    });
  } catch (error) {
    console.error('Expense update error:', error);
    res.status(500).json({ message: 'Server error while updating expense' });
  }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Expense deletion error:', error);
    res.status(500).json({ message: 'Server error while deleting expense' });
  }
});

// @route   GET /api/expenses/analytics/summary
// @desc    Get expense analytics summary
// @access  Private
router.get('/analytics/summary', auth, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const filter = { user_id: req.user._id };

    if (start_date || end_date) {
      filter.date = {};
      if (start_date) filter.date.$gte = new Date(start_date);
      if (end_date) filter.date.$lte = new Date(end_date);
    }

    // Total expenses
    const totalExpenses = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Expenses by category
    const expensesByCategory = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$category_id',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $project: {
          category_name: '$category.name',
          category_color: '$category.color',
          category_icon: '$category.icon',
          total: 1,
          count: 1
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Expenses by payment mode
    const expensesByPaymentMode = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$payment_mode',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Monthly trend (last 12 months)
    const monthlyTrend = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ]);

    res.json({
      summary: {
        total_amount: totalExpenses[0]?.total || 0,
        total_count: await Expense.countDocuments(filter)
      },
      by_category: expensesByCategory,
      by_payment_mode: expensesByPaymentMode,
      monthly_trend: monthlyTrend
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Server error while fetching analytics' });
  }
});

module.exports = router;
