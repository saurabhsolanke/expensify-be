const express = require('express');
const auth = require('../middleware/auth');
const BorrowedMoney = require('../models/BorrowedMoney');
const Payment = require('../models/Payment');

const router = express.Router();

// @route   POST /api/borrowed-money
// @desc    Create a new borrowed/lent money record
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, amount, type, note } = req.body;

    const borrowedMoney = new BorrowedMoney({
      user_id: req.user._id,
      name,
      phone,
      amount,
      type,
      note
    });

    await borrowedMoney.save();

    res.status(201).json({
      message: `${type === 'borrowed' ? 'Borrowed' : 'Lent'} money recorded successfully`,
      borrowedMoney
    });
  } catch (error) {
    console.error('Borrowed money creation error:', error);
    res.status(500).json({ message: 'Server error while recording borrowed money' });
  }
});

// @route   GET /api/borrowed-money
// @desc    Get all borrowed/lent money records for user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { type, status } = req.query;
    const filter = { user_id: req.user._id };

    if (type) filter.type = type;
    if (status) filter.status = status;

    const borrowedMoney = await BorrowedMoney.find(filter)
      .sort({ createdAt: -1 });

    // Add remaining amount and status info to each record
    const enrichedBorrowedMoney = borrowedMoney.map(record => ({
      ...record.toObject(),
      remaining_amount: record.amount - record.repaid_amount
    }));

    res.json({ borrowedMoney: enrichedBorrowedMoney });
  } catch (error) {
    console.error('Borrowed money fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching borrowed money records' });
  }
});

// @route   GET /api/borrowed-money/:id
// @desc    Get borrowed/lent money record by ID with payment history
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const borrowedMoney = await BorrowedMoney.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!borrowedMoney) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Get payment history
    const payments = await Payment.find({
      user_id: req.user._id,
      type: 'borrowed',
      reference_id: req.params.id
    }).sort({ payment_date: -1 });

    const summary = {
      borrowedMoney: {
        ...borrowedMoney.toObject(),
        remaining_amount: borrowedMoney.amount - borrowedMoney.repaid_amount
      },
      payments,
      total_paid: borrowedMoney.repaid_amount,
      total_remaining: borrowedMoney.amount - borrowedMoney.repaid_amount,
      payment_count: payments.length
    };

    res.json({ summary });
  } catch (error) {
    console.error('Borrowed money fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching borrowed money record' });
  }
});

// @route   PUT /api/borrowed-money/:id
// @desc    Update borrowed/lent money record
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, phone, amount, type, note } = req.body;

    const borrowedMoney = await BorrowedMoney.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { name, phone, amount, type, note },
      { new: true, runValidators: true }
    );

    if (!borrowedMoney) {
      return res.status(404).json({ message: 'Record not found' });
    }

    res.json({
      message: 'Record updated successfully',
      borrowedMoney
    });
  } catch (error) {
    console.error('Borrowed money update error:', error);
    res.status(500).json({ message: 'Server error while updating record' });
  }
});

// @route   POST /api/borrowed-money/:id/repay
// @desc    Record a repayment for borrowed/lent money
// @access  Private
router.post('/:id/repay', auth, async (req, res) => {
  try {
    const { amount, payment_date, note, payment_method } = req.body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid repayment amount is required' });
    }

    if (!payment_date) {
      return res.status(400).json({ message: 'Payment date is required' });
    }

    // Find the borrowed money record
    const borrowedMoney = await BorrowedMoney.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!borrowedMoney) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Check if repayment amount exceeds remaining amount
    const remainingAmount = borrowedMoney.amount - borrowedMoney.repaid_amount;
    if (amount > remainingAmount) {
      return res.status(400).json({ 
        message: `Repayment amount (${amount}) cannot exceed remaining amount (${remainingAmount})`,
        remaining_amount: remainingAmount
      });
    }

    // Create payment record
    const payment = new Payment({
      user_id: req.user._id,
      type: 'borrowed',
      reference_id: req.params.id,
      amount: amount,
      payment_date: new Date(payment_date),
      note: note || `Repayment for ${borrowedMoney.name}`,
      payment_method: payment_method || 'cash'
    });

    await payment.save();

    // Update the borrowed money record with new repaid amount
    const newRepaidAmount = borrowedMoney.repaid_amount + amount;
    const updatedBorrowedMoney = await BorrowedMoney.findByIdAndUpdate(
      req.params.id,
      { 
        repaid_amount: newRepaidAmount,
        status: newRepaidAmount >= borrowedMoney.amount ? 'repaid' : 'partial'
      },
      { new: true, runValidators: true }
    );

    // Populate payment details for response
    await payment.populate('reference_id', 'name amount type');

    res.status(201).json({
      message: 'Repayment recorded successfully',
      payment,
      borrowedMoney: updatedBorrowedMoney,
      remaining_amount: updatedBorrowedMoney.amount - updatedBorrowedMoney.repaid_amount
    });
  } catch (error) {
    console.error('Repayment recording error:', error);
    res.status(500).json({ message: 'Server error while recording repayment' });
  }
});

// @route   GET /api/borrowed-money/:id/repayments
// @desc    Get repayment history for a specific borrowed/lent money record
// @access  Private
router.get('/:id/repayments', auth, async (req, res) => {
  try {
    // Check if the borrowed money record exists and belongs to user
    const borrowedMoney = await BorrowedMoney.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!borrowedMoney) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Get all payments for this record
    const payments = await Payment.find({
      user_id: req.user._id,
      type: 'borrowed',
      reference_id: req.params.id
    }).sort({ payment_date: -1 });

    const summary = {
      borrowedMoney: {
        _id: borrowedMoney._id,
        name: borrowedMoney.name,
        amount: borrowedMoney.amount,
        type: borrowedMoney.type,
        repaid_amount: borrowedMoney.repaid_amount,
        remaining_amount: borrowedMoney.amount - borrowedMoney.repaid_amount,
        status: borrowedMoney.status
      },
      payments,
      total_paid: borrowedMoney.repaid_amount,
      total_remaining: borrowedMoney.amount - borrowedMoney.repaid_amount
    };

    res.json({ summary });
  } catch (error) {
    console.error('Repayment history fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching repayment history' });
  }
});

// @route   GET /api/borrowed-money/repayments/all
// @desc    Get all repayments across all borrowed/lent money records
// @access  Private
router.get('/repayments/all', auth, async (req, res) => {
  try {
    const { start_date, end_date, type } = req.query;
    const filter = { 
      user_id: req.user._id,
      type: 'borrowed'
    };

    // Date range filter
    if (start_date || end_date) {
      filter.payment_date = {};
      if (start_date) filter.payment_date.$gte = new Date(start_date);
      if (end_date) filter.payment_date.$lte = new Date(end_date);
    }

    // Get all payments with borrowed money details
    const payments = await Payment.find(filter)
      .populate('reference_id', 'name amount type')
      .sort({ payment_date: -1 });

    // Calculate totals
    const totalRepaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalBorrowed = await BorrowedMoney.aggregate([
      { $match: { user_id: req.user._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalAmount = totalBorrowed[0]?.total || 0;
    const totalRemaining = totalAmount - totalRepaid;

    res.json({
      payments,
      summary: {
        total_amount: totalAmount,
        total_repaid: totalRepaid,
        total_remaining: totalRemaining,
        payment_count: payments.length
      }
    });
  } catch (error) {
    console.error('All repayments fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching all repayments' });
  }
});

// @route   GET /api/borrowed-money/repayments/summary
// @desc    Get repayment summary with status breakdown
// @access  Private
router.get('/repayments/summary', auth, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const filter = { user_id: req.user._id };

    if (start_date || end_date) {
      filter.date = {};
      if (start_date) filter.date.$gte = new Date(start_date);
      if (end_date) filter.date.$lte = new Date(end_date);
    }

    // Get summary by status
    const summaryByStatus = await BorrowedMoney.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total_amount: { $sum: '$amount' },
          total_repaid: { $sum: '$repaid_amount' }
        }
      }
    ]);

    // Get total summary
    const totalSummary = await BorrowedMoney.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_count: { $sum: 1 },
          total_amount: { $sum: '$amount' },
          total_repaid: { $sum: '$repaid_amount' }
        }
      }
    ]);

    const summary = {
      by_status: summaryByStatus,
      total: {
        count: totalSummary[0]?.total_count || 0,
        amount: totalSummary[0]?.total_amount || 0,
        repaid: totalSummary[0]?.total_repaid || 0,
        remaining: (totalSummary[0]?.total_amount || 0) - (totalSummary[0]?.total_repaid || 0)
      }
    };

    res.json({ summary });
  } catch (error) {
    console.error('Repayment summary error:', error);
    res.status(500).json({ message: 'Server error while fetching repayment summary' });
  }
});

// @route   GET /api/borrowed-money/overdue
// @desc    Get overdue borrowed money records (not fully repaid)
// @access  Private
router.get('/overdue', auth, async (req, res) => {
  try {
    const overdueRecords = await BorrowedMoney.find({
      user_id: req.user._id,
      status: { $in: ['pending', 'partial'] }
    }).sort({ createdAt: -1 });

    const summary = overdueRecords.map(record => ({
      _id: record._id,
      name: record.name,
      amount: record.amount,
      type: record.type,
      repaid_amount: record.repaid_amount,
      remaining_amount: record.amount - record.repaid_amount,
      status: record.status,
      created_at: record.createdAt,
      days_since_created: Math.floor((new Date() - record.createdAt) / (1000 * 60 * 60 * 24))
    }));

    res.json({ 
      overdue_records: summary,
      count: summary.length,
      total_remaining: summary.reduce((sum, record) => sum + record.remaining_amount, 0)
    });
  } catch (error) {
    console.error('Overdue records fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching overdue records' });
  }
});

// @route   DELETE /api/borrowed-money/:id
// @desc    Delete borrowed/lent money record
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const borrowedMoney = await BorrowedMoney.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!borrowedMoney) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Check if there are any payments
    const hasPayments = await Payment.exists({
      type: 'borrowed',
      reference_id: req.params.id,
      user_id: req.user._id
    });

    if (hasPayments) {
      return res.status(400).json({ 
        message: 'Cannot delete record with payment history. Please delete payments first.' 
      });
    }

    await BorrowedMoney.findByIdAndDelete(req.params.id);

    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Borrowed money deletion error:', error);
    res.status(500).json({ message: 'Server error while deleting record' });
  }
});

// @route   GET /api/borrowed-money/summary/totals
// @desc    Get summary totals for borrowed/lent money
// @access  Private
router.get('/summary/totals', auth, async (req, res) => {
  try {
    const summary = await BorrowedMoney.aggregate([
      { $match: { user_id: req.user._id } },
      {
        $group: {
          _id: '$type',
          total_amount: { $sum: '$amount' },
          total_repaid: { $sum: '$repaid_amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totals = {
      borrowed: { amount: 0, repaid: 0, remaining: 0, count: 0 },
      lent: { amount: 0, repaid: 0, remaining: 0, count: 0 }
    };

    summary.forEach(item => {
      if (item._id === 'borrowed') {
        totals.borrowed = {
          amount: item.total_amount,
          repaid: item.total_repaid,
          remaining: item.total_amount - item.total_repaid,
          count: item.count
        };
      } else if (item._id === 'lent') {
        totals.lent = {
          amount: item.total_amount,
          repaid: item.total_repaid,
          remaining: item.total_amount - item.total_repaid,
          count: item.count
        };
      }
    });

    res.json({ totals });
  } catch (error) {
    console.error('Borrowed money summary error:', error);
    res.status(500).json({ message: 'Server error while fetching summary' });
  }
});

module.exports = router;
