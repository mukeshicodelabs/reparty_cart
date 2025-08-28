const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { types } = require('sharetribe-flex-integration-sdk');
const { getISdk, handleError } = require('../api-util/sdk');
const { UUID } = types;
const secretKey = process.env.JWT_SECRET_KEY || 'your_dummy_secret_key_1234567890';
const jwt = require('jsonwebtoken');


const isCompleted = [
  "transition/confirm-payment",
  "transition/auto-complete",
  "transition/review-1-by-customer",
  "transition/review-1-by-provider",
  "transition/review-2-by-provider",
  "transition/review-2-by-customer",  
  "transition/expire-review-period",
  "transition/expire-customer-review-period",
  "transition/expire-provider-review-period",
];


const createStripePaymentIntent = async (req, res) => {  
  try {
    const { isCallBackFn, ...rest } = req.body;
    // console.log('Creating Stripe Payment Intent with data >>> :', isCallBackFn);
    const paymentIntent = await stripe.paymentIntents.create({ ...rest });
     
    const stripeIntent = {
      stripePaymentIntentId: paymentIntent.id,
      stripePaymentIntentClientSecret: paymentIntent.client_secret,
      stripeEncryptedPaymentIntentId: jwt.sign(paymentIntent.id, secretKey),
    }; 
    if (isCallBackFn) {
      return stripeIntent;
    }
    return res.status(200).json(stripeIntent);
  } catch (error) {
    return handleError(res, error);
  }
};


const refundStripePayment = async (req, res) => {
  try {
    const { paymentIntentId, amount } = req.body;
    // Retrieve the payment intent to get the charge ID
    const decryptPaymentIntentId = jwt.verify(paymentIntentId, secretKey);
    // Create a refund for the charge
    const refund = await stripe.refunds.create({
      payment_intent: decryptPaymentIntentId,
      ...(amount && { amount }),
    });
    return res.status(200).send({ refund });
  } catch (error) {
    return handleError(res, error);
  }
};

const createStripeTransfer = async (req, res) => {
  const {
    _id,
    tx_id,
    tx_status,
    tx_amount,
    tx_currency,
    tx_delivery_type,
    tx_provider_amount,
    provider_id,
    payment_intent_id,
    provider_name,
    customer_id,
    customer_name,
    listing_id,
    listing_title,
    provider_transfer_status,
    provider_transfer_available_on,
    provider_payout_status,
    provider_payout_arrival_date,

    // for callback api
    isCallBackFn = false
  } = req.body;
  try {
    const isdk = getISdk();
    const authorStripeIdQuery = await isdk.users.show({ id: new UUID(provider_id), include: ['stripeAccount'] });
    const destinationAccountId = Array.isArray(authorStripeIdQuery?.data?.included) && authorStripeIdQuery?.data?.included[0]?.attributes?.stripeAccountId;

    if (!destinationAccountId) {
      const sendResponse = {
        status: 400,
        message: "Stripe account is not linked",
      };
      return isCallBackFn ? sendResponse : res.status(400).send(sendResponse);
    };

    // Check Transaction is refunded or not
    const isRefundedTransaction = await isdk.transactions.show({ id: tx_id });    
    const lastTransition = isRefundedTransaction.data.data.attributes.lastTransition;
    const payoutAmount = isRefundedTransaction.data.data.attributes.payoutTotal;
    if (!isCompleted.includes(lastTransition)) {
      const sendResponse = {
        status: 400,
        message: "This transaction is not yet completed",
      };
      return isCallBackFn ? sendResponse : res.status(400).send(sendResponse);
    }

    // Retrieve the payment intent and check the payment status
    const decryptPaymentIntentId = jwt.verify(payment_intent_id, secretKey);
    const paymentIntent = await stripe.paymentIntents.retrieve(decryptPaymentIntentId);
    if (paymentIntent?.status != 'succeeded') {
      const sendResponse = {
        status: 400,
        message: "This payment is refunded to customer",
      };
      return isCallBackFn ? sendResponse : res.status(400).send(sendResponse);
    }

    // Manually filter Stripe transfers by metadata.tx_id
    // transfer_group:tx_id
    const existingTransfers = await stripe.transfers.list({
      limit: 100,
      destination: destinationAccountId,
    });
    const alreadyTransferred = existingTransfers.data.find(t => t.metadata?.tx_id === tx_id);
    if (alreadyTransferred) {
      // console.log(`:repeat: Transfer already exists for tx_id ${tx_id}: ${alreadyTransferred.id}`);
      const sendResponse = {
        status: 400,
        message: "The payemnt is already transfered to your bank account",
      };
      return isCallBackFn ? sendResponse : res.status(400).send(sendResponse);
    }

    // Proceed with new transfer
      const transfer = await stripe.transfers.create({
        amount: payoutAmount.amount,
        currency: payoutAmount.currency,
        destination: destinationAccountId,
        metadata: { tx_id },
        source_transaction:paymentIntent.latest_charge
        // transfer_group: tx_id,
      });
    
    const { balance_transaction, id: stripeTransferId } = transfer;
    const balanceTransaction = await stripe.balanceTransactions.retrieve(balance_transaction);

    const { available_on } = balanceTransaction;

    return isCallBackFn
      ? { transferId: transfer.id, availableOn: available_on }
      : res.status(200).send({
        status: 200,
        message: "Transfer successful",
        transferId: transfer.id,
        availableOn: available_on
      });
    
  } catch (error) {
    const sendResponse = error?.raw?.message ? {
      status: 400,
      message: error?.raw?.message,
    } : null;

    if (sendResponse) {
      return isCallBackFn ? sendResponse : res.status(400).send(sendResponse);
    }
    return handleError(res, error);
  }
};

module.exports = {
  createStripePaymentIntent,
  refundStripePayment,
  createStripeTransfer
};
