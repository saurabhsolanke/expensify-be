const express = require('express');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const CreditCard = require('../models/CreditCard');
const BorrowedMoney = require('../models/BorrowedMoney');

const router = express.Router();

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// @route   POST /api/payments
// @desc    Create a new payment
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { type, reference_id, amount, payment_date, note, payment_method } = req.body;

    // Validate ObjectId format for reference_id
    if (!isValidObjectId(reference_id)) {
      return res.status(400).json({ 
        message: 'Invalid reference ID format. Reference ID must be a valid MongoDB ObjectId.',
        field: 'reference_id',
        value: reference_id
      });
    }

    // Validate reference exists and belongs to user
    if (type === 'credit_card') {
      const creditCard = await CreditCard.findOne({ _id: reference_id, user_id: req.user._id });
      if (!creditCard) {
        return res.status(400).json({ 
          message: 'Credit card not found or does not belong to you',
          field: 'reference_id',
          value: reference_id
        });
      }
    } else if (type === 'borrowed') {
      const borrowed = await BorrowedMoney.findOne({ _id: reference_id, user_id: req.user._id });
      if (!borrowed) {
        return res.status(400).json({ 
          message: 'Borrowed money record not found or does not belong to you',
          field: 'reference_id',
          value: reference_id
        });
      }
    } else {
      return res.status(400).json({ 
        message: 'Invalid payment type. Must be either "credit_card" or "borrowed"',
        field: 'type',
        value: type
      });
    }

    const payment = new Payment({
      user_id: req.user._id,
      type,
      reference_id,
      amount,
      payment_date: payment_date || new Date(),
      note,
      payment_method
    });

    await payment.save();

    // Update borrowed money repaid amount if applicable
    if (type === 'borrowed') {
      const borrowed = await BorrowedMoney.findById(reference_id);
      const newRepaidAmount = Math.min(borrowed.repaid_amount + amount, borrowed.amount);
      await BorrowedMoney.findByIdAndUpdate(reference_id, {
        repaid_amount: newRepaidAmount
      });
    }

    res.status(201).json({
      message: 'Payment recorded successfully',
      payment
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ message: 'Server error while recording payment' });
  }
});

// @route   GET /api/payments
// @desc    Get all payments for user with filters
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      start_date,
      end_date,
      min_amount,
      max_amount,
      sort_by = 'payment_date',
      sort_order = 'desc'
    } = req.query;

    const filter = { user_id: req.user._id };

    if (type) filter.type = type;
    
    if (start_date || end_date) {
      filter.payment_date = {};
      if (start_date) filter.payment_date.$gte = new Date(start_date);
      if (end_date) filter.payment_date.$lte = new Date(end_date);
    }

    if (min_amount || max_amount) {
      filter.amount = {};
      if (min_amount) filter.amount.$gte = parseFloat(min_amount);
      if (max_amount) filter.amount.$lte = parseFloat(max_amount);
    }

    const sort = {};
    sort[sort_by] = sort_order === 'desc' ? -1 : 1;

    const payments = await Payment.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments(filter);

    res.json({
      payments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Payment fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching payments' });
  }
});

// @route   GET /api/payments/:id
// @desc    Get payment by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Payment fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching payment' });
  }
});

// @route   PUT /api/payments/:id
// @desc    Update payment
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { amount, payment_date, note, payment_method } = req.body;

    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { amount, payment_date, note, payment_method },
      { new: true, runValidators: true }
    );

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Update borrowed money repaid amount if applicable
    if (payment.type === 'borrowed') {
      const borrowed = await BorrowedMoney.findById(payment.reference_id);
      if (borrowed) {
        // Recalculate repaid amount by summing all payments
        const totalPaid = await Payment.aggregate([
          {
            $match: {
              user_id: req.user._id,
              type: 'borrowed',
              reference_id: payment.reference_id
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);

        const newRepaidAmount = Math.min(totalPaid[0]?.total || 0, borrowed.amount);
        await BorrowedMoney.findByIdAndUpdate(payment.reference_id, {
          repaid_amount: newRepaidAmount
        });
      }
    }

    res.json({
      message: 'Payment updated successfully',
      payment
    });
  } catch (error) {
    console.error('Payment update error:', error);
    res.status(500).json({ message: 'Server error while updating payment' });
  }
});

// @route   DELETE /api/payments/:id
// @desc    Delete payment
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    await Payment.findByIdAndDelete(req.params.id);

    // Update borrowed money repaid amount if applicable
    if (payment.type === 'borrowed') {
      const borrowed = await BorrowedMoney.findById(payment.reference_id);
      if (borrowed) {
        // Recalculate repaid amount by summing remaining payments
        const totalPaid = await Payment.aggregate([
          {
            $match: {
              user_id: req.user._id,
              type: 'borrowed',
              reference_id: payment.reference_id
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);

        const newRepaidAmount = Math.min(totalPaid[0]?.total || 0, borrowed.amount);
        await BorrowedMoney.findByIdAndUpdate(payment.reference_id, {
          repaid_amount: newRepaidAmount
        });
      }
    }

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Payment deletion error:', error);
    res.status(500).json({ message: 'Server error while deleting payment' });
  }
});

// @route   GET /api/payments/summary/totals
// @desc    Get payment summary totals
// @access  Private
router.get('/summary/totals', auth, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const filter = { user_id: req.user._id };

    if (start_date || end_date) {
      filter.payment_date = {};
      if (start_date) filter.payment_date.$gte = new Date(start_date);
      if (end_date) filter.payment_date.$lte = new Date(end_date);
    }

    const summary = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          total_amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totals = {
      credit_card: { amount: 0, count: 0 },
      borrowed: { amount: 0, count: 0 }
    };

    summary.forEach(item => {
      if (item._id === 'credit_card') {
        totals.credit_card = { amount: item.total_amount, count: item.count };
      } else if (item._id === 'borrowed') {
        totals.borrowed = { amount: item.total_amount, count: item.count };
      }
    });

    res.json({ totals });
  } catch (error) {
    console.error('Payment summary error:', error);
    res.status(500).json({ message: 'Server error while fetching payment summary' });
  }
});

module.exports = router;
