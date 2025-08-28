const { transactionLineItems } = require('../api-util/lineItems');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  fetchCommission,
  serialize,
} = require('../api-util/sdk');
const { createStripePaymentIntent } = require('./stripe-payment-api');
const moment = require('moment');

const makeStripePaymentIntent = (data) => {
  const {
    stripePaymentIntentId,
    stripePaymentIntentClientSecret,
    stripeEncryptedPaymentIntentId,
  } = data
  return {
    stripePaymentIntentId: stripeEncryptedPaymentIntentId,
    stripePaymentIntents: {
      default: {
        stripePaymentIntentClientSecret,
        stripePaymentIntentId
      }
    },
  }
}


const processTransaction = async (body) => { 
  const {
  sdk, 
  item, 
  orderData, 
  bodyParams, 
  queryParams, 
  providerCommission, 
  customerCommission, 
  trustedSdk,
  seenAuthorIds,
  stripePaymentIntentProtectedData
} = body;
  try {
    const [showListingResponse] = await Promise.all([
      sdk.listings.show({ id: item?.listingId }),
    ]); 
    const listing = showListingResponse.data.data;
    const listingId = listing.id.uuid; 
    const {
      price,
      transactionProcessAlias,
      unitType,
      stockCount,  
      deliveryMethod,
      title,
      shippoObjectId,
      productType,   
      ItemDescription,
      ItemOtherEvent,
      shippoRate,
      currency,
      ...rest
    } = item; 
    const newOrderData = {
      stockReservationQuantity:+stockCount,
      deliveryMethod:deliveryMethod,
      selectedShippingOption: shippoRate ? {amount:(+shippoRate), currency} : null
    }; 
    const lineItems = transactionLineItems(
      listing,
      newOrderData,
      providerCommission,
      customerCommission,
      item
    ); 
    const params = {
      listingId: listingId,
      lineItems,
      protectedData:{ 
        fetchdataFromMongo: true,
        deliveryMethod,
        title,
        shippoObjectId,
        productType,
        listingData:{  
        description:ItemDescription,
        otherEvent:ItemOtherEvent,
        price:price?.amount,  
        listingId:listingId
        },
        ...stripePaymentIntentProtectedData
      }
    } 
    if(unitType == 'item'){
      params.stockReservationQuantity = stockCount
    }  
    const body = {
      processAlias: 'default-purchase-cart/release-1',
      transition: "transition/request-payment",
      params: params,
    }; 
    const apiResponse = await trustedSdk.transactions.initiate(body, queryParams); 
    const { data } = apiResponse; 
    return {data};
  } catch (error) {
    console.log(error, '&&& &&& => error');
    throw new Error(error);
  }
};

module.exports = async (req, res) => {
  const { orderData, bodyParams, queryParams } = req.body;
  const sdk = getSdk(req, res);

  try {
    const seenAuthorIds = new Set();
    const trustedSdk = await getTrustedSdk(req);
    const fetchAssetsResponse = await fetchCommission(sdk);
    
    const { paymentIntentData } = orderData ?? {}; 
    console.log(orderData,"orderData inside");
       
    const stripeIntent = await createStripePaymentIntent({
      body: {
        ...paymentIntentData,
        isCallBackFn: true,
      },
    });
    console.log(stripeIntent,"stripeIntent");
    
   const stripePaymentIntentProtectedData =  makeStripePaymentIntent(stripeIntent)
 
    const commissionAsset = fetchAssetsResponse.data.data[0];
    const { providerCommission, customerCommission } =
      commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};


    const listingsPromises = orderData?.cartItems?.map((item) =>
      processTransaction({
        sdk, 
        item, 
        orderData, 
        bodyParams, 
        queryParams, 
        providerCommission, 
        customerCommission, 
        trustedSdk, 
        seenAuthorIds,
        stripePaymentIntentProtectedData
      })
    );
   
    const transactionsResults = await Promise.all(listingsPromises);
    // console.log(res, '&&& &&& => res'); 
    return res.status(200)
    .type('application/transit+json')
    .send(serialize({ data: transactionsResults }));
  } catch (error) {
    handleError(res, error);
  }
};
