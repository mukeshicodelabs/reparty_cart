const moment = require('moment');
const { getISdk } = require('../api-util/sdk');
const integrationSdk = getISdk();
const sharetribeSdk = require('sharetribe-flex-sdk');
const { types } = sharetribeSdk;
const { UUID } = types;

const blockCalenderAvailability = async (req, res) => {
  try {
    const { txId } = req.body;
    console.log('Received txId: >> ', txId);

    const txData = await integrationSdk.transactions.show({
      id: txId?.uuid,
      include: ['listing'],
    });

    const {
      data: {
        data: {
          relationships: {
            listing: {
              data: {
                id: { uuid: listingId },
              },
            },
          },
        },
      },
    } = txData;

    const cartItems = txData?.data?.data?.attributes?.protectedData?.cartItems || [];
    const needToblockAvilability = Array.isArray(cartItems) && cartItems?.length > 0;

    // filter out the "main" listingId since you only want to block for other items
    const filterListingData = needToblockAvilability
      ? cartItems.filter(item => item.listingId !== listingId)
      : [];

    console.log('Filtered Cart Items:', filterListingData);

    if (filterListingData.length === 0) {
      return res.status(200).send({
        message: 'No other listings found to block availability',
        data: [],
      });
    }
    const results = [];
    const exceptionIds = [];
    // loop through cart items and block their availability
    for (const item of filterListingData) {
      try {
        const exceptionListingId = new UUID(item.listingId); 
        // bookingStartDate & bookingEndDate are already in ms (not seconds)
        const start = moment(item.bookingStartDate).toDate();
        const end = moment(item.bookingEndDate).toDate(); 
        const exceptionPayload = {
          listingId: exceptionListingId,
          start,
          end,
          seats: item.seats || 1, // default to 1 if seats not specified
        }; 
        const response = await integrationSdk.availabilityExceptions.create(exceptionPayload, {
          expand: true,
        });

        exceptionIds.push(response.data.data.id.uuid);
        console.log(`✅ Availability exception created for listing ${item.listingId}`);
        results.push(response.data.data);
      } catch (err) {
        console.error(`❌ Failed to create exception for listing ${item.listingId}:`, err);
      }
    }
    console.log('Need Updated transaction metadata with exception IDs:', exceptionIds);
    if (exceptionIds?.length) {
      await integrationSdk.transactions.updateMetadata({
        id:txId.uuid,
        metadata: {
          exceptionId: [...exceptionIds],
        },
      });
      console.log('Updated transaction metadata with exception IDs:', exceptionIds);
    }

    return res.status(200).send({
      message: 'Availability exceptions created successfully',
      data: results,
    });
  } catch (e) {
    console.error('Error creating calendar exception:', e);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};

// ======================
// IIF TEST RUN
// ======================
// (async () => {
//   console.log("Testing blockCalenderAvailability function...");
//   const fakeReq = {
//     body: {
//       txId: { _sdkType: 'UUID', uuid: '68a84c43-5d7c-4652-937a-226eac8b86cc' }
//     }
//   };

//   const fakeRes = {
//     status: (code) => ({
//       send: (payload) => console.log("Response:", code, JSON.stringify(payload, null, 2))
//     })
//   };

//   await blockCalenderAvailability(fakeReq, fakeRes);
// })();

module.exports = { blockCalenderAvailability };
