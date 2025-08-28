const nodeCron = require('node-cron');
const { deleteAlgoliaListings } = require('./delete-listings');
const { updateAlgoliaListings } = require('./update-listings');
const { updateFreeTransactions } = require('../../api/free-transaction');


const runCronServices = process.env.RUN_ALL_CRON_SERVICES == "true";
const runDeleteListingsCron = process.env.RUN_DELETE_LISTINGS_CRON == "true";
const runUpdateListingsCron = process.env.RUN_UPDATE_LISTINGS_CRON == "true";


const runCron = () => {
 
        //  delete listing from algolia Cron run in 5 min
        nodeCron.schedule('*/5 * * * * *', () => {
                // console.log('&&& delete algolia listing Cron run in every 5 minute &&& => ');
                // deleteAlgoliaListings();
 
        });

        //  update listing in algolia Cron run in 5 min
        nodeCron.schedule('*/5 * * * * *', () => {
                // console.log('&&& update algolia listing Cron run in every  minute &&& => ');
                // updateAlgoliaListings();

        });

        // nodeCron.schedule('*/30 * * * * *', () => {
        nodeCron.schedule('*/5 * * * *', () => {
                // console.log('updateFreeTransactions');
                updateFreeTransactions();
        });

}; 
module.exports = { runCron };




// ] 
// [1] [handleFreeTransaction] Start processing txId: 68af1108-1df0-4c98-9797-ac262555161b
// [1] [handleFreeTransaction] lastTransition=transition/cancel-booking-customer, paymentIntentId=eyJhbGciOiJIUzI1NiJ9.cGlfM1MwazBCRUFra1VQTXhsQjF3OHdZS3FS.XFXHRwt3B0ycI30C8r7nNTJ6LHFbT_ZBBLz1wUoRBqc
// [1] [getTxFromMongoWithId] Looking up transaction: 68af1108-1df0-4c98-9797-ac262555161b
// [1] [getTxFromMongoWithId] Found transaction: 68af1108-1df0-4c98-9797-ac262555161b
// [1] [handleFreeTransaction] Cancellation by customer=true
// [1] [handleFreeTransaction] Reversing transfer for txId=68af1108-1df0-4c98-9797-ac262555161b, providerTransferId=tr_3S0k0BEAkkUPMxlB1CSeLDSa
// [1] [handleFreeTransaction] Got reversal=trr_1S0kAnEAkkUPMxlBZqisNBPe, refund=re_3S0k0BEAkkUPMxlB1a6bX1Aj
// [1] [updateTxWithReversal] Updating txId 68af1108-1df0-4c98-9797-ac262555161b with reversal and refund
// [1] [handleFreeTransaction] Transaction updated successfully for txId=68af1108-1df0-4c98-9797-ac262555161b
// [1] [updateFreeTransactions] Saving last sequenceId=309959996
// [1] [saveLastEventSequenceId] Saving sequenceId=309959996
// [1] [updateFreeTransactions] Completed cycle ✅
// [1] updateFreeTransactions
