const { getISdk } = require('../../api-util/sdk');
const { addSecurityPayout } = require('../../controllers/addSecurityPayout');
const { createTransactionData } = require('../../controllers/addTransactionController');
const SecurityPayment = require('../../models/securityPayment');
const { validateInput, handleStripeError } = require('./helper');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const secretKey = 'bFVHsJl0ktlqZkQ';
const jwt = require('jsonwebtoken'); 
const sharetribeSdk = require('sharetribe-flex-sdk');
const { types } = sharetribeSdk;
const { UUID } = types; 
const integrationSdk = getISdk();

const createStripeIntent = async (req, res) => {
  try {
    validateInput(req.body, ['amount', 'currency']);
    const params = { ...req.body };
    const txId = params.metadata['sharetribe-transaction-id'];
    if (!txId) {
      return res.status(400).json({ error: 'Missing transaction ID in metadata' });
    }

    const iSdk = getISdk();
    const tx = await iSdk.transactions.show({ id: txId });
    const protectedData = tx.data.data.attributes.protectedData;
    const providerStripeAccountId =  protectedData?.destination;

    // Add optional transfer_group for tracking
    params.transfer_group = `security_deposit_tx_${txId}`;
      params.on_behalf_of = providerStripeAccountId;
      params.transfer_data = {
        destination: providerStripeAccountId,
      };

    const paymentIntent = await stripe.paymentIntents.create(params);
   
    await SecurityPayment.create({
      customerId: params.customer,
      intentId: paymentIntent.id,
      paymentMethodId: params.payment_method,
      amount: params.amount,
      currency: params.currency,
      txId,
      metadata: params.metadata,
      transferGroup: `security_deposit_tx_${txId}`,
      providerStripeAccountId,
      status: 'active',
      lastAuthorizedAt: new Date(),
    });
 
   return res.status(201).json(paymentIntent);
  } catch (error) {
    console.error('Failed to create Security Deposit PaymentIntent:', error);
    handleStripeError(res, error, 'Failed to create Security Deposit PaymentIntent');
  }
};

const createStripeSetupIntent = async (req, res) => {
  try {
    const { customer, payment_method } = req.body;

    if (!customer || !payment_method) {
      return res.status(400).json({
        error: 'Missing required fields: customer, payment_method, or usage',
      });
    }
    const setupIntent = await stripe.setupIntents.create(req.body);
    res.status(201).json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (error) {
    console.log('failed to create setupIntent', error);
    return res.status(500).json({ error: 'Failed to create setupIntents' });
  }
};

const captureStripeIntent = async (req, res) => {
  try {
    validateInput(req.body, ['intentToCapture', 'providerStripeAccountId', 'claimAmountCents']);
    const { intentToCapture, providerStripeAccountId, claimAmountCents, transfer_group, tx_id } =
      req.body || {};
      
    const capturedIntent = await stripe.paymentIntents.capture(intentToCapture, {
      amount_to_capture: claimAmountCents,
    });
    const chargeId = capturedIntent.latest_charge;
    
    const charge = await stripe.charges.retrieve(chargeId);
    const transfer = await stripe.transfers.retrieve(charge.transfer);

    const balanceTx = await stripe.balanceTransactions.retrieve(charge.balance_transaction);

    const netAmount = balanceTx.net;
    const currency = balanceTx.currency;
    const availableOn = balanceTx.available_on;

    await addSecurityPayout({
      txId: capturedIntent.metadata?.['sharetribe-transaction-id'] || tx_id,
      amount: netAmount,
      destination: providerStripeAccountId,
      transferId: transfer.id,
      description: 'Security Deposit Payout',
      currency,
      availableOn,
      status: 'pending',
    });

    await SecurityPayment.findOneAndUpdate(
      { txId: tx_id },
      {
        $set: {
          status: 'captured',
          bookingComplete: true,
        },
      },
      { new: true }
    );
    console.log('Deposit intent updated successfully');
    return res.status(200).json({
      transfer,
      captured: {
        capturedIntentId: capturedIntent.id,
        amountCaptured: capturedIntent.amount_received,
        chargeId,
      },
    });
  } catch (error) {
    console.log('Failed to capture paymentIntent', error);
    handleStripeError(res, error, 'Failed to capture paymentIntent');
  }
};

const cancelStripeIntent = async (req, res) => {
  try {
    validateInput(req.body, ['paymentIntentId']);
    const { paymentIntentId, cancellationReason, tx_id } = req.body;
    // Cancel parameters with optional reason
    const cancelParams = {
      cancellation_reason: cancellationReason || 'requested_by_customer',
    };
    
    const canceledIntent = await stripe.paymentIntents.cancel(paymentIntentId, cancelParams);
    await SecurityPayment.findOneAndUpdate(
      { txId: tx_id },
      {
        $set: {
          status: 'captured',
          bookingComplete: true,
        },
      },
      { new: true } // Return the updated document
    );
    res.status(200).json({ canceledIntent });
  } catch (error) {
    handleStripeError(res, error, 'Failed to cancel PaymentIntent');
  }
};

const initiateStripeRefund = async (req, res) => {
  try {
    validateInput(req.body, ['payment_intent', 'amount']);
    // Refund specific validation
    if (req.body.amount <= 0) {
      throw new Error('Refund amount must be greater than zero');
    }
    const refund = await stripe.refunds.create(req.body);
    res.status(200).json({ refund });
  } catch (error) {
    handleStripeError(res, error, 'Failed to process refund');
  }
};

 const customerCancelRefund = async (req, res) => {
  try {
    const { sharetribePaymentIntent,amount} = req.body;
    // Helper function to fetch transfer details from a PaymentIntent
    const getTransferDetails = async (intentId) => {
      const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
      
      return {
        transferId: charge.transfer,
        destinationAccountId: paymentIntent.transfer_data?.destination || null
      };
    };

    // Step 1: Get transfer details
    const { transferId } = await getTransferDetails(sharetribePaymentIntent);
    // Step 2: Reverse the transfer to the connected account
    const transferReversal = await stripe.transfers.createReversal(transferId, {
      amount: Math.round(amount), // Ensure integer cents
    });

    // Step 3: Refund the customer (84% of the amount)
    const REFUND_PERCENTAGE = 0.84;
    const refundAmount = Math.round(amount * REFUND_PERCENTAGE);

    const refund = await stripe.refunds.create({
      payment_intent: sharetribePaymentIntent,
      amount: amount,
    });

    return res.status(200).json({
      success: true,
      refund,
      transferReversal,
    });

  } catch (error) {
    console.error('Error during refund and transfer reversal:', error);
    return res.status(500).json({
      error: error?.message || 'Internal Server Error',
      details: error
    });
  }
};

 
const transferFundsAfterPayPayment = async tx => {
  const attributes = tx.attributes || {};
  const protectedData = attributes.protectedData || {};
  const stripeIntent = protectedData?.stripePaymentIntents?.default?.stripePaymentIntentId;
  const relationships = tx.relationships || {};
  const provider = relationships.provider?.data || {};
  const customer = relationships.customer?.data || {};
  const listing = relationships.listing?.data || {};
  const txId = tx.id?.uuid;

  const tx_currency = attributes.payinTotal?.currency || 'USD';
  const amount = attributes.payoutTotal?.amount || 0;
  const providerId = provider?.id?.uuid;
  const customerId = customer?.id?.uuid;
  const listingId= listing?.id?.uuid; 
  try {
    const authorStripeIdQuery = await integrationSdk.users.show({
      id: providerId,
      include: ['stripeAccount'],
    });
    const destinationAccountId = authorStripeIdQuery.data.included[0].attributes.stripeAccountId;
    const paymentIntent = await stripe.paymentIntents.retrieve(stripeIntent);
    const chargeId = paymentIntent.latest_charge;
    const transfer = await stripe.transfers.create({
      amount: amount,
      currency: tx_currency || 'USD',
      destination: destinationAccountId,
      source_transaction: chargeId,
    });
    const { balance_transaction, id } = transfer;
    const balanceTransaction = await stripe.balanceTransactions.retrieve(balance_transaction);
    const { available_on } = balanceTransaction;
    if(available_on && id){ 
    const payloadSaveData = {
      tx_id: txId,
      tx_status: attributes.state,
      tx_process_name: attributes.processName,
      tx_process_version: attributes.processVersion || 1,
      tx_delivery_type: protectedData.deliveryMethod,
      tx_amount: attributes.payinTotal?.amount || 0,
      tx_currency: attributes.payinTotal?.currency || 'USD',
      tx_provider_amount: attributes.payoutTotal?.amount || 0,
      tx_settled_outside: false,
      provider_id: provider.id?.uuid || 'test-provider-id',
      customer_id: customerId,
      listing_id: listingId,
      listing_title: protectedData.title,
      payment_intent_id: stripeIntent,
      provider_transfer_id: id,
      provider_transfer_status: 'transfered',
      provider_transfer_amount: amount,
      provider_transfer_currency: tx_currency || 'USD', 
      provider_transfer_available_on: available_on, 
      // provider_payout_id: "test-payout-id", // not in payload
      // provider_payout_status: "test-payout-status", // not in payload
      // provider_payout_amount: attributes.payoutTotal?.amount || 0,
      // provider_payout_currency: attributes.payoutTotal?.currency || 'USD',
      // provider_payout_arrival_date: Date.now(), // fake
      // NEW Shippo fields - placeholders for now
      // shipping_label_url: "test-label-url",
      // tracking_number: "test-tracking",
      // tracking_url_provider: "test-tracking-url",
      // carrier: "test-carrier",
    }; 
    const res= await createTransactionData(payloadSaveData) 
  }
 
  } catch (error) {
    console.log(error, ' checking Error');
  }
};

const createReversalForProvider = async (
  transferId,
  sharetribePaymentIntent,
  amount,
  isCustomerCancelled = false
) => {
  try {
    // 1. Reverse the transfer to vendor
    const transferReversal = await stripe.transfers.createReversal(transferId, {
      amount: Math.round(amount),
    });

    let refundAmount = Math.round(amount);

    // 2. If customer cancelled → deduct 3.2% fee from refund
    if (isCustomerCancelled) {
      const stripeFee = Math.round(amount * 0.032); // 3.2% fee
      refundAmount = amount - stripeFee;

      // Make sure refund is not negative
      if (refundAmount < 0) {
        refundAmount = 0;
      }
    }

    // 3. Refund to customer (full or net of fees)
    const refund = await stripe.refunds.create({
      payment_intent: sharetribePaymentIntent,
      amount: refundAmount,
    });

  return { transferReversal, refund };
  } catch (error) {
    console.error('Error creating reversal/refund:', error);
    throw error;
  }
};



// (async ()=>{
// const paymentIntentId = "pi_3RvenuEAkkUPMxlB0TfzXSUI";
// const amount = 23400;

// // 1. Retrieve the Payment Intent
//     const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
//     console.log("Payment Intent:", paymentIntent);

//     // 2. Retrieve the Charge from the Payment Intent
//     const chargeId = paymentIntent.latest_charge;

//     if (!chargeId) {
//       console.log("No charge associated with this Payment Intent.");
//       return;
//     }

//     const charge = await stripe.charges.retrieve(chargeId);
//     console.log("Charge:", charge);

//     // 3. Retrieve the Transfer (if one exists)
//     const transferId = charge.transfer;

//     if (transferId) {
//       const transfer = await stripe.transfers.retrieve(transferId);
//       console.log("Transfer:", transfer);
//     } else {
//       console.log("No transfer associated with this charge.");
//     }
// })

module.exports = {
  createStripeIntent,
  initiateStripeRefund,
  captureStripeIntent,
  cancelStripeIntent,
  createStripeSetupIntent,
  customerCancelRefund,
  transferFundsAfterPayPayment,
  createReversalForProvider
};