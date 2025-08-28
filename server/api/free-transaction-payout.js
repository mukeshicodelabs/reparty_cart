const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const moment = require('moment');
const { types } = require('sharetribe-flex-integration-sdk');
const { getISdk } = require('../../api-util/sdk');
const { freeTransactionFind, freeTransactionFindOneAndUpdate } = require('../mongooseCollection/freeTransactionCollection');
const { errorRecordCreate } = require('../mongooseCollection/errorRecordCollection');
const { UUID } = types;
const external_accounts_valid_status = ['new', 'validated', 'verified'];
// a function which gives provider account id based on valid status and gives first valid account
const getExtenalBankAccountId = account => {
  const { external_accounts } = account;
  const { data } = external_accounts;
  const filterdBankAccounts = data.filter(st => external_accounts_valid_status.includes(st.status));
  return filterdBankAccounts[0].id;
};
const logErrorInMongo = (payload) => {
  return errorRecordCreate({
    body: {
      payload,
      isCallBackFn: true
    }
  })
};
const payoutFreeTransactions = async () => {
  console.log('🔁 Running referral payout cron job...');
  try {
    const currentTimestamp = moment().unix();
    const freeTxdata = await freeTransactionFind({
      body: {
        payload: {
          provider_transfer_status: 'created',
          provider_transfer_available_on: { $lt: currentTimestamp },
          provider_payout_status: "transfer"
        },
        isCallBackFn: true
      }
    });
    const txdata = freeTxdata.data || [];
    if (!txdata.length) {
      console.log("✅ No transactions eligible for payout.");
      return;
    };
    console.log(`📦 Found ${txdata.length} transaction(s) eligible for payout.`);
    for (const tx of txdata) {
      const { tx_id, provider_transfer_amount, provider_transfer_currency, provider_id } = tx;
      try {
        const isdk = await getISdk();
        const userDetails = await isdk.users.show({
          id: new UUID(provider_id),
          include: ['stripeAccount'],
        });
        const destinationAccountId = userDetails.data.included[0]?.attributes?.stripeAccountId;
        // if (!destinationAccountId) {
        //   console.warn(`⚠️ No Stripe account found for user ${provider_id}`);
        //   continue;
        // }
        console.log(`💳 Retrieved Stripe account: ${destinationAccountId}`);
        // Get external bank account ID attached to the connected account
        const account = await stripe.accounts.retrieve(destinationAccountId);
        const externalBankAccountId = getExtenalBankAccountId(account);
        if (!externalBankAccountId) {
          console.warn(`⚠️ No external bank account found for user ${provider_id}`);
          return;
        }
        console.log(
          `🏦 Preparing payout of ${(provider_transfer_amount / 100).toFixed(
            2
          )} ${provider_transfer_currency.toUpperCase()} to bank account ${externalBankAccountId}`
        );
        // Create payout to user's external bank account
        const payout = await stripe.payouts.create(
          {
            amount: provider_transfer_amount, // in cents
            currency: provider_transfer_currency,
            destination: externalBankAccountId,
            metadata: { tx_id },
          },
          {
            stripeAccount: destinationAccountId, // connected account
          }
        );
        const { id: payoutId, status: payoutStatus, arrival_date } = payout;
        console.log(
          `✅ Payout ${payoutId} created for tx_id ${tx_id}, expected arrival: ${moment
            .unix(arrival_date)
            .format()}`
        );
        // Update MongoDB transaction record
        const mongoPayoutData = {
          // stripe payout
          provider_payout_id: payoutId,
          provider_payout_status: payoutStatus,
          provider_payout_amount: provider_transfer_amount,
          provider_payout_currency: provider_transfer_currency,
          provider_payout_arrival_date: arrival_date,
        };
        await freeTransactionFindOneAndUpdate({
          body: {
            filter: { tx_id },
            payload: mongoPayoutData,
            isCallBackFn: true
          }
        });
        console.log(`📦 Transaction ${tx_id} updated with payout info in database.`);
      } catch (error) {
        console.error(`❌ Error processing payout for tx_id ${tx_id}:`, error);
        // add error log to the database
        const uploadError = {
          error_type: 'payoutFreeTransactions',
          error_id: tx_id,
          error_unix_timestamp: moment().unix(),
          error_data: {
            error_message: error?.raw?.message || error?.message || '',
            error_id: 'tx_id',
          },
        };
        logErrorInMongo(uploadError);
      }
    }
  } catch (error) {
    console.error('❌ Error during referral payout job execution:', error.raw);
    // add error log to the database
    const uploadError = {
      error_type: 'payoutFreeTransactions',
      error_id: '',
      error_unix_timestamp: moment().unix(),
      error_data: {
        error_message: error?.raw?.message || error?.message || '',
        error_id: 'tx_id',
      },
    };
    logErrorInMongo(uploadError);
  } finally {
    // releaseLock();
    console.log('🔓 Lock released.');
  }
};
module.exports = {
  payoutFreeTransactions,
};