const moment = require('moment');
const { getISdk } = require('../api-util/sdk');
const sequence = require('../models/sequence');
const freeTransactionCollection = require('../models/freeTransactionSchema');
const { createReversalForProvider } = require('./Stripe/stripeApi');

const refundFreeTransactionLastTransition = [
  'transition/cancel-booking-customer',
  'transition/cancel-booking-provider',
  'transition/cancel',
  'transition/auto-cancel',
];

const TRANSACTION_UPDATE_TYPE = 'transaction_update';
const TRANSACTION_UPDATE_EVENT = 'transaction/transitioned';

const isCancelledByCustomerTransactions = [
  'transition/cancel-booking-customer',
];

const getTxFromMongoWithId = async txId => {
  try {
    console.log(`[getTxFromMongoWithId] Looking up transaction: ${txId}`);
    const transaction = await freeTransactionCollection.findOne({ tx_id: txId });
    if (!transaction) {
      console.warn(`[getTxFromMongoWithId] No transaction found for txId: ${txId}`);
      return null;
    }
    console.log(`[getTxFromMongoWithId] Found transaction: ${txId}`);
    return transaction;
  } catch (error) {
    console.error(`[getTxFromMongoWithId] Error fetching transaction ${txId}:`, error);
    throw error;
  }
};

const updateTxWithReversal = async (txId, reversal, refund) => {
  try {
    console.log(`[updateTxWithReversal] Updating txId ${txId} with reversal and refund`);
    return await freeTransactionCollection.findOneAndUpdate(
      { tx_id: txId },
      {
        $set: {
          provider_transfer_status: 'reversed',
          reversal_id: reversal.id,
          reversal_status: reversal.status,
          refund_id: refund.id,
          refund_status: refund.status,
        },
      },
      { new: true }
    );
  } catch (error) {
    console.error(`[updateTxWithReversal] Error updating tx ${txId}:`, error);
    throw error;
  }
};

/**
 * Analyzes a transaction and updates transactions in mongo.
 * @param {Object} transaction - The event object from Sharetribe.
 */
const handleFreeTransaction = async transaction => {
  const txId = transaction?.attributes?.resourceId?.uuid;
  try {
    console.log(`\n[handleFreeTransaction] Start processing txId: ${txId}`);
    const attributes = transaction?.attributes?.resource?.attributes;
    const lastTransition = attributes?.lastTransition;
    const protectedData = attributes?.protectedData;
    const paymentIntentId = protectedData?.stripePaymentIntentId;

    console.log(`[handleFreeTransaction] lastTransition=${lastTransition}, paymentIntentId=${paymentIntentId}`);

    if (paymentIntentId && refundFreeTransactionLastTransition.includes(lastTransition)) {
      const txData = await getTxFromMongoWithId(txId);
      if (!txData) {
        console.warn(`[handleFreeTransaction] No mongo tx found for txId=${txId}, skipping`);
        return null;
      }

      if (txData?.refund_id || txData?.reversal_id) {
        console.log(`[handleFreeTransaction] Refund/Reversal already exists for txId=${txId}, skipping`);
        return null;
      }

      const isCancelledByCustomer = isCancelledByCustomerTransactions?.includes(lastTransition);
      console.log(`[handleFreeTransaction] Cancellation by customer=${isCancelledByCustomer}`);

      const { provider_transfer_id, tx_provider_amount, payment_intent_id } = txData;
      console.log(`[handleFreeTransaction] Reversing transfer for txId=${txId}, providerTransferId=${provider_transfer_id}`);

      const { transferReversal, refund } = await createReversalForProvider(
        provider_transfer_id,
        payment_intent_id,
        tx_provider_amount,
        isCancelledByCustomer
      );

      console.log(`[handleFreeTransaction] Got reversal=${transferReversal?.id}, refund=${refund?.id}`);

      const updatedTx = await updateTxWithReversal(txId, transferReversal, refund);
      console.log(`[handleFreeTransaction] Transaction updated successfully for txId=${txId}`);
      return updatedTx;
    } else {
      console.log(`[handleFreeTransaction] No refund needed for txId=${txId}`);
    }
  } catch (error) {
    console.error(`[handleFreeTransaction] Error handling txId=${txId}:`, error);
  }
};

const loadLastEventSequenceId = async () => {
  try {
    console.log('[loadLastEventSequenceId] Loading last sequence...');
    const sequenceRecord = await sequence.findOne({ type: TRANSACTION_UPDATE_TYPE });
    console.log(`[loadLastEventSequenceId] Last ID=${sequenceRecord?.lastId}`);
    return sequenceRecord?.lastId || '';
  } catch (error) {
    console.error('[loadLastEventSequenceId] Failed:', error);
    return '';
  }
};

const saveLastEventSequenceId = async lastSequenceId => {
  try {
    console.log(`[saveLastEventSequenceId] Saving sequenceId=${lastSequenceId}`);
    await sequence.findOneAndUpdate(
      { type: TRANSACTION_UPDATE_TYPE },
      { lastId: lastSequenceId },
      { new: true, upsert: true }
    );
  } catch (error) {
    console.error('[saveLastEventSequenceId] Failed:', error);
  }
};

const updateFreeTransactions = async () => {
  try {
    console.log('\n[updateFreeTransactions] Starting update cycle...');
    const startTime = moment().subtract(5, 'minutes').toDate();
    const sequenceId = await loadLastEventSequenceId();
    const params = sequenceId
      ? { startAfterSequenceId: sequenceId }
      : { createdAtStart: startTime };

    console.log('[updateFreeTransactions] Query params:', params);

    const iSdk = await getISdk();
    console.log('[updateFreeTransactions] Fetching events from Sharetribe...');

    const res = await iSdk.events.query({
      ...params,
      eventTypes: [TRANSACTION_UPDATE_EVENT],
    });

    const events = res.data.data || [];
    console.log(`[updateFreeTransactions] Retrieved ${events.length} events`);

    try {
      const freeTransactions = events.filter(event => {
        const attributes = event?.attributes?.resource?.attributes;
        const processName = attributes?.processName;
        const lastTransition = attributes?.lastTransition;
        const resourceId = event?.attributes?.resourceId?.uuid;

        return processName == 'default-purchase-cart' && lastTransition && resourceId;
      });

      console.log(`[updateFreeTransactions] Found ${freeTransactions.length} free transactions`);

      await Promise.all(freeTransactions.map(handleFreeTransaction));
    } catch (e) {
      console.error('[updateFreeTransactions] Error while processing free transactions:', e);
    }

    // Save last processed event sequence ID
    if (events.length) {
      const lastEvent = events[events.length - 1];
      const lastSeqId = lastEvent.attributes.sequenceId;
      console.log(`[updateFreeTransactions] Saving last sequenceId=${lastSeqId}`);
      await saveLastEventSequenceId(lastSeqId);
    }

    console.log('[updateFreeTransactions] Completed cycle ✅');
  } catch (error) {
    console.error('[updateFreeTransactions] Fatal error:', error);
  }
};

module.exports = { updateFreeTransactions };
