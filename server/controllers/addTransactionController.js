 
const FreeTransaction = require("../models/freeTransactionSchema"); 

/**
 * Create a new transaction
 * @route POST /api/transactions
 */
exports.createTransactionData = async (payload) => {
  try {
    // You can generate a unique tx_id if not provided
    const { tx_id } = payload;
    if (!tx_id) {
      return res.status(400).json({ message: "tx_id is required" });
    }

    const newTransaction = new FreeTransaction(payload);
    const savedTransaction = await newTransaction.save();  
    return res.status(201).json({
      message: "Transaction created successfully",
      id: savedTransaction._id, // MongoDB ObjectId
      tx_id: savedTransaction.tx_id, // Business transaction id
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Duplicate tx_id not allowed" });
    }
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Update an existing transaction by MongoDB _id or tx_id
 * @route PUT /api/transactions/:id
 */
exports.updateTransactionData = async (req, res) => {
  try {
    const { id } = req.params; // this could be MongoDB _id or tx_id
    const updateData = req.body;

    // Try finding by tx_id first, fallback to _id
    let transaction = await FreeTransaction.findOneAndUpdate(
      { $or: [{ _id: id }, { tx_id: id }] },
      updateData,
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    return res.status(200).json({
      message: "Transaction updated successfully",
      transaction,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



const getTransactionByTxId = async (req, res) => {
  try {
    const { tx_id } = req.body; // Assuming you use route params or req.body as appropriate
    if (!tx_id) {
      return res.status(400).json({ message: "tx_id is required" });
    }
    const transaction = await FreeTransaction.findOne({ tx_id: tx_id}); 
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    return res.status(200).json(transaction);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
module.exports = {
  getTransactionByTxId
};

