const express = require('express');
const auth = require('../middleware/auth');
const CreditCard = require('../models/CreditCard');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');

const router = express.Router();

// @route   POST /api/credit-cards
// @desc    Create a new credit card
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { bank_name, card_number, limit_amount, due_date } = req.body;

    const creditCard = new CreditCard({
      user_id: req.user._id,
      bank_name,
      card_number,
      limit_amount,
      due_date
    });

    await creditCard.save();

    res.status(201).json({
      message: 'Credit card added successfully',
      creditCard
    });
  } catch (error) {
    console.error('Credit card creation error:', error);
    res.status(500).json({ message: 'Server error while adding credit card' });
  }
});

// @route   GET /api/credit-cards
// @desc    Get all credit cards for user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const creditCards = await CreditCard.find({ user_id: req.user._id })
      .sort({ bank_name: 1 });

    res.json({ creditCards });
  } catch (error) {
    console.error('Credit card fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching credit cards' });
  }
});

// @route   GET /api/credit-cards/:id
// @desc    Get credit card by ID with summary
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const creditCard = await CreditCard.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!creditCard) {
      return res.status(404).json({ message: 'Credit card not found' });
    }

    // Get current month's expenses
    const currentMonth = new Date();
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const currentMonthExpenses = await Expense.aggregate([
      {
        $match: {
          user_id: req.user._id,
          credit_card_id: creditCard._id,
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get last payment
    const lastPayment = await Payment.findOne({
      user_id: req.user._id,
      type: 'credit_card',
      reference_id: creditCard._id
    }).sort({ payment_date: -1 });

    const summary = {
      creditCard,
      current_month: {
        expenses: currentMonthExpenses[0]?.total || 0,
        count: currentMonthExpenses[0]?.count || 0
      },
      last_payment: lastPayment,
      available_limit: creditCard.limit_amount ? 
        creditCard.limit_amount - (currentMonthExpenses[0]?.total || 0) : null
    };

    res.json({ summary });
  } catch (error) {
    console.error('Credit card fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching credit card' });
  }
});

// @route   PUT /api/credit-cards/:id
// @desc    Update credit card
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { bank_name, card_number, limit_amount, due_date, is_active } = req.body;

    const creditCard = await CreditCard.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { bank_name, card_number, limit_amount, due_date, is_active },
      { new: true, runValidators: true }
    );

    if (!creditCard) {
      return res.status(404).json({ message: 'Credit card not found' });
    }

    res.json({
      message: 'Credit card updated successfully',
      creditCard
    });
  } catch (error) {
    console.error('Credit card update error:', error);
    res.status(500).json({ message: 'Server error while updating credit card' });
  }
});

// @route   DELETE /api/credit-cards/:id
// @desc    Delete credit card
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if credit card has any expenses
    const hasExpenses = await Expense.exists({
      credit_card_id: req.params.id,
      user_id: req.user._id
    });

    if (hasExpenses) {
      return res.status(400).json({ 
        message: 'Cannot delete credit card with associated expenses. Please update or delete expenses first.' 
      });
    }

    const creditCard = await CreditCard.findOneAndDelete({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!creditCard) {
      return res.status(404).json({ message: 'Credit card not found' });
    }

    res.json({ message: 'Credit card deleted successfully' });
  } catch (error) {
    console.error('Credit card deletion error:', error);
    res.status(500).json({ message: 'Server error while deleting credit card' });
  }
});

// @route   GET /api/credit-cards/:id/expenses
// @desc    Get expenses for a specific credit card
// @access  Private
router.get('/:id/expenses', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, start_date, end_date } = req.query;

    const filter = {
      user_id: req.user._id,
      credit_card_id: req.params.id
    };

    if (start_date || end_date) {
      filter.date = {};
      if (start_date) filter.date.$gte = new Date(start_date);
      if (end_date) filter.date.$lte = new Date(end_date);
    }

    const expenses = await Expense.find(filter)
      .populate('category_id', 'name color icon')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(filter);

    res.json({
      expenses,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Credit card expenses fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching credit card expenses' });
  }
});

// @route   GET /api/credit-cards/:id/payments
// @desc    Get payment history for a credit card
// @access  Private
router.get('/:id/payments', auth, async (req, res) => {
  try {
    const payments = await Payment.find({
      user_id: req.user._id,
      type: 'credit_card',
      reference_id: req.params.id
    }).sort({ payment_date: -1 });

    res.json({ payments });
  } catch (error) {
    console.error('Credit card payments fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching credit card payments' });
  }
});

module.exports = router;
