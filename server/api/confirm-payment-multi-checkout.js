const { handleError, getSdk, serialize } = require('../api-util/sdk');
const { types } = require('sharetribe-flex-sdk');
const { transferFundsAfterPayPayment } = require('./Stripe/stripeApi');
const { UUID } = types;

module.exports = async (req, res) => {
  try {
    const { txIds, transitionName } = req.body;
    const sdk = await getSdk(req, res);
    const results = [];

    // Build the metadata array once
    const txDataArray = txIds.map(id => ({
      id,
      cancel: false,
    }));

    for (const txIdStr of txIds || []) {
      try {
        const txId = new UUID(txIdStr);
        const queryParams = {
          include: ['customer', 'provider', 'listing'],
          expand: true,
        };

        // Transition the transaction with the whole txDataArray in metadata
        // const queryParams = {
        //   include: ['provider', 'provider.publicData'],
        //   expand: true,
        // };

        const result = await sdk.transactions.transition(
          {
            id: txId,
            transition: transitionName,
            params: {
              metadata: {
                txIds: txDataArray,
              },
            },
          },
          queryParams
        );
        const tx = result && result?.data ?  result?.data?.data : null; 

        const updateTxMogoData = tx ? transferFundsAfterPayPayment(tx) : null;  
        results.push(result.data.data); 
      } catch (error) {
        console.error('🛑 Transaction Processing Error:\n', JSON.stringify({
          txId: txIdStr,
          message: error?.message,
          status: error?.status,
          statusText: error?.statusText,
          data: error?.data,
          stack: error?.stack,
        }, null, 2));
        throw new Error(`Failed to process transaction ${txIdStr}: ${error.message}`);
      }
    }

    return res
      .status(200)
      .set('Content-Type', 'application/transit+json')
      .send(serialize(results))
      .end();

  } catch (error) {
    return handleError(res, error);
  }
};
