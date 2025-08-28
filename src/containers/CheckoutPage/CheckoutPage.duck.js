import pick from 'lodash/pick';
import {
  createShippingLabelAPI,
  getShippingRates,
  initiatePrivileged,
  initiatePrivilegedMultiCheckout,
  confirmPaymentMultiCheckout,
  transitionPrivileged,
  updateMetaDataApi,
  blockCalenderAvailabilityApi,
} from '../../util/api';
import { denormalisedResponseEntities } from '../../util/data';
import { storableError } from '../../util/errors';
import * as log from '../../util/log';
import { fetchCurrentUserHasOrdersSuccess, fetchCurrentUser } from '../../ducks/user.duck';
import { updateProfile } from '../ProfileSettingsPage/ProfileSettingsPage.duck';

// ================ Action types ================ //

export const SET_INITIAL_VALUES = 'app/CheckoutPage/SET_INITIAL_VALUES';

export const INITIATE_ORDER_REQUEST = 'app/CheckoutPage/INITIATE_ORDER_REQUEST';
export const INITIATE_ORDER_SUCCESS = 'app/CheckoutPage/INITIATE_ORDER_SUCCESS';
export const INITIATE_ORDER_ERROR = 'app/CheckoutPage/INITIATE_ORDER_ERROR';

export const CONFIRM_PAYMENT_REQUEST = 'app/CheckoutPage/CONFIRM_PAYMENT_REQUEST';
export const CONFIRM_PAYMENT_SUCCESS = 'app/CheckoutPage/CONFIRM_PAYMENT_SUCCESS';
export const CONFIRM_PAYMENT_ERROR = 'app/CheckoutPage/CONFIRM_PAYMENT_ERROR';

export const SPECULATE_TRANSACTION_REQUEST = 'app/CheckoutPage/SPECULATE_TRANSACTION_REQUEST';
export const SPECULATE_TRANSACTION_SUCCESS = 'app/CheckoutPage/SPECULATE_TRANSACTION_SUCCESS';
export const SPECULATE_TRANSACTION_ERROR = 'app/CheckoutPage/SPECULATE_TRANSACTION_ERROR';

export const STRIPE_CUSTOMER_REQUEST = 'app/CheckoutPage/STRIPE_CUSTOMER_REQUEST';
export const STRIPE_CUSTOMER_SUCCESS = 'app/CheckoutPage/STRIPE_CUSTOMER_SUCCESS';
export const STRIPE_CUSTOMER_ERROR = 'app/CheckoutPage/STRIPE_CUSTOMER_ERROR';

export const INITIATE_INQUIRY_REQUEST = 'app/CheckoutPage/INITIATE_INQUIRY_REQUEST';
export const INITIATE_INQUIRY_SUCCESS = 'app/CheckoutPage/INITIATE_INQUIRY_SUCCESS';
export const INITIATE_INQUIRY_ERROR = 'app/CheckoutPage/INITIATE_INQUIRY_ERROR';

export const FETCH_SHIPPING_RATES_REQUEST = 'app/CheckoutPage/FETCH_SHIPPING_RATES_REQUEST';
export const FETCH_SHIPPING_RATES_SUCCESS = 'app/CheckoutPage/FETCH_SHIPPING_RATES_SUCCESS';
export const FETCH_SHIPPING_RATES_ERROR = 'app/CheckoutPage/FETCH_SHIPPING_RATES_ERROR';

export const FETCH_SHIPPING_LINE_ITEM_REQUEST = 'app/CheckoutPage/FETCH_SHIPPING_LINE_ITEM_REQUEST';

// ================ Reducer ================ //

const initialState = {
  listing: null,
  orderData: null,
  speculateTransactionInProgress: false,
  speculateTransactionError: null,
  speculatedTransaction: null,
  isClockInSync: false,
  transaction: null,
  initiateOrderError: null,
  confirmPaymentError: null,
  stripeCustomerFetched: false,
  initiateInquiryInProgress: false,
  initiateInquiryError: null,
  fetchRatesInProgress: false,
  shippingRates: [],
  fetchRatesError: null,
  shippingLineItemRequest: null,
};

export default function checkoutPageReducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case SET_INITIAL_VALUES:
      return { ...initialState, ...payload };

    case SPECULATE_TRANSACTION_REQUEST:
      return {
        ...state,
        speculateTransactionInProgress: true,
        speculateTransactionError: null,
        speculatedTransaction: null,
      };
    case SPECULATE_TRANSACTION_SUCCESS: {
      // Check that the local devices clock is within a minute from the server
      const lastTransitionedAt = payload.transaction?.attributes?.lastTransitionedAt;
      const localTime = new Date();
      const minute = 60000;
      return {
        ...state,
        speculateTransactionInProgress: false,
        speculatedTransaction: payload.transaction,
        isClockInSync: Math.abs(lastTransitionedAt?.getTime() - localTime.getTime()) < minute,
      };
    }
    case SPECULATE_TRANSACTION_ERROR:
      console.error(payload); // eslint-disable-line no-console
      return {
        ...state,
        speculateTransactionInProgress: false,
        speculateTransactionError: payload,
      };

    case INITIATE_ORDER_REQUEST:
      return { ...state, initiateOrderError: null };
    case INITIATE_ORDER_SUCCESS:
      return { ...state, transaction: payload };
    case INITIATE_ORDER_ERROR:
      console.error(payload); // eslint-disable-line no-console
      return { ...state, initiateOrderError: payload };

    case CONFIRM_PAYMENT_REQUEST:
      return { ...state, confirmPaymentError: null };
    case CONFIRM_PAYMENT_SUCCESS:
      return state;
    case CONFIRM_PAYMENT_ERROR:
      console.error(payload); // eslint-disable-line no-console
      return { ...state, confirmPaymentError: payload };

    case STRIPE_CUSTOMER_REQUEST:
      return { ...state, stripeCustomerFetched: false };
    case STRIPE_CUSTOMER_SUCCESS:
      return { ...state, stripeCustomerFetched: true };
    case STRIPE_CUSTOMER_ERROR:
      console.error(payload); // eslint-disable-line no-console
      return { ...state, stripeCustomerFetchError: payload };

    case INITIATE_INQUIRY_REQUEST:
      return { ...state, initiateInquiryInProgress: true, initiateInquiryError: null };
    case INITIATE_INQUIRY_SUCCESS:
      return { ...state, initiateInquiryInProgress: false };
    case INITIATE_INQUIRY_ERROR:
      return { ...state, initiateInquiryInProgress: false, initiateInquiryError: payload };

    case FETCH_SHIPPING_LINE_ITEM_REQUEST:
      return {
        ...state,
        shippingLineItemRequest: true,
      };

    case FETCH_SHIPPING_RATES_REQUEST:
      return { ...state, fetchRatesInProgress: true, fetchRatesError: null, shippingRates: [] };
    case FETCH_SHIPPING_RATES_SUCCESS:
      return {
        ...state,
        fetchRatesInProgress: false,
        fetchRatesError: null,
        shippingRates: payload,
      };
    case FETCH_SHIPPING_RATES_ERROR:
      return { ...state, fetchRatesInProgress: false, fetchRatesError: payload, shippingRates: [] };

    default:
      return state;
  }
}

// ================ Selectors ================ //

// ================ Action creators ================ //

export const setInitialValues = initialValues => ({
  type: SET_INITIAL_VALUES,
  payload: pick(initialValues, Object.keys(initialState)),
});

const initiateOrderRequest = () => ({ type: INITIATE_ORDER_REQUEST });

const initiateOrderSuccess = order => ({
  type: INITIATE_ORDER_SUCCESS,
  payload: order,
});

const initiateOrderError = e => ({
  type: INITIATE_ORDER_ERROR,
  error: true,
  payload: e,
});

const confirmPaymentRequest = () => ({ type: CONFIRM_PAYMENT_REQUEST });

const confirmPaymentSuccess = orderId => ({
  type: CONFIRM_PAYMENT_SUCCESS,
  payload: orderId,
});

const confirmPaymentError = e => ({
  type: CONFIRM_PAYMENT_ERROR,
  error: true,
  payload: e,
});

export const speculateTransactionRequest = () => ({ type: SPECULATE_TRANSACTION_REQUEST });

export const speculateTransactionSuccess = transaction => ({
  type: SPECULATE_TRANSACTION_SUCCESS,
  payload: { transaction },
});

export const speculateTransactionError = e => ({
  type: SPECULATE_TRANSACTION_ERROR,
  error: true,
  payload: e,
});

export const stripeCustomerRequest = () => ({ type: STRIPE_CUSTOMER_REQUEST });
export const stripeCustomerSuccess = () => ({ type: STRIPE_CUSTOMER_SUCCESS });
export const stripeCustomerError = e => ({
  type: STRIPE_CUSTOMER_ERROR,
  error: true,
  payload: e,
});

export const initiateInquiryRequest = () => ({ type: INITIATE_INQUIRY_REQUEST });
export const initiateInquirySuccess = () => ({ type: INITIATE_INQUIRY_SUCCESS });
export const initiateInquiryError = e => ({
  type: INITIATE_INQUIRY_ERROR,
  error: true,
  payload: e,
});

export const fetchRatesRequest = () => ({ type: FETCH_SHIPPING_RATES_REQUEST });
export const fetchRatesSuccess = response => ({
  type: FETCH_SHIPPING_RATES_SUCCESS,
  payload: response,
});
export const fetchRatesError = e => ({
  type: FETCH_SHIPPING_RATES_ERROR,
  error: true,
  payload: e,
});

export const fetchShippingLineItemRequest = () => ({ type: FETCH_SHIPPING_LINE_ITEM_REQUEST });

/* ================ Thunks ================ */

export const initiateOrder = (
  orderParams,
  processAlias,
  transactionId,
  transitionName,
  isPrivilegedTransition
) => (dispatch, getState, sdk) => {
  dispatch(initiateOrderRequest());
  // If we already have a transaction ID, we should transition, not
  // initiate.
  const isTransition = !!transactionId;
  const isCart = Array.isArray(orderParams?.cartItems) && orderParams?.cartItems?.length && !orderParams?.cartItems?.[0]?.isRental; 
  console.log("isCart value in initiateOrder:", isCart);
  const {
    deliveryMethod,
    quantity,
    bookingDates,
    deliveryfee,
    productType,
    selectedPricingOption,
    setupPrice,
    selectedShippingOption,
    paymentIntentData,
    cartItems,
    ...otherOrderParams
  } = orderParams; 
  
  const quantityMaybe = quantity ? { stockReservationQuantity: quantity } : {};
  // const bookingParamsMaybe = bookingDates[0] || {};
  const bookingParamsMaybe =  Array.isArray(cartItems) && cartItems.length > 1
  ? bookingDates?.[0] ?? {}
  : Array.isArray(bookingDates)
  ? bookingDates[0] ?? {}
  : bookingDates || {};;
 


  // Parameters only for client app's server
  const orderData = deliveryMethod
    ? {
      deliveryMethod,
      deliveryfee,
      productType,
      selectedPricingOption,
      setupPrice,
      selectedShippingOption,
      cartItems,
      paymentIntentData
    }
    : { selectedShippingOption, deliveryfee, productType, selectedPricingOption, setupPrice, cartItems, paymentIntentData };
 

  // Parameters for Marketplace API
  const transitionParams = {
    ...quantityMaybe,
    ...bookingParamsMaybe,
    ...otherOrderParams,
  };  
  const bodyParams = isTransition
    ? {
      id: transactionId,
      transition: transitionName,
      params: transitionParams,
    }
    : {
      processAlias,
      transition: transitionName,
      params: transitionParams,
    };
 
    
  const queryParams = {
    include: ['booking', 'provider'],
    expand: true,
  };

  const handleSuccess = response => {
    const entities = denormalisedResponseEntities(response);
    const order = entities[0];
    dispatch(initiateOrderSuccess(order));
    dispatch(fetchCurrentUserHasOrdersSuccess(true));
    return order;
  };

  const handleError = e => {
    dispatch(initiateOrderError(storableError(e)));
    const transactionIdMaybe = transactionId ? { transactionId: transactionId.uuid } : {};
    log.error(e, 'initiate-order-failed', {
      ...transactionIdMaybe,
      listingId: orderParams.listingId.uuid,
      ...quantityMaybe,
      ...bookingParamsMaybe,
      ...orderData,
    });
    throw e;
  };

  if (isTransition && isPrivilegedTransition) {
    // transition privileged
    return transitionPrivileged({ isSpeculative: false, orderData, bodyParams, queryParams })
      .then(handleSuccess)
      .catch(handleError);
  } else if (isTransition) {
    // transition non-privileged
    return sdk.transactions
      .transition(bodyParams, queryParams)
      .then(handleSuccess)
      .catch(handleError);
  } else if (isPrivilegedTransition) {
    if (!!isCart) { 
      console.log("isCart is true in initiateOrder");
      return initiatePrivilegedMultiCheckout({ orderData, bodyParams, queryParams })
        .then((response) => {
          const txIds = response?.data?.map(data => data.data.data.id.uuid);
          localStorage.setItem('txIds', JSON.stringify(txIds));
          const entities = denormalisedResponseEntities(response.data[0]);
          const order = entities[0];
          dispatch(initiateOrderSuccess(order));
          dispatch(fetchCurrentUserHasOrdersSuccess(true));
          return order;
        })
        .catch(handleError)
    } else {
      // initiate privileged
      return initiatePrivileged({ isSpeculative: false, orderData, bodyParams, queryParams })
        .then(handleSuccess)
        .catch(handleError);
    }
  } else {
    // initiate non-privileged
    return sdk.transactions
      .initiate(bodyParams, queryParams)
      .then(handleSuccess)
      .catch(handleError);
  }
};

export const confirmPaymentMultiTransactionCheckout = (
  transactionId,
  transitionName,
  transitionParams = {}
) => (dispatch, getState, sdk) => {
  const txIds = JSON.parse(localStorage.getItem('txIds'));
  const data = {
    id: transactionId,
    txIds,
    transitionName: 'transition/confirm-payment',
    params: transitionParams,
  }; 
  const txDataArray = txIds?.map(id => ({
    id,
    cancel: false,
  })); 
  dispatch(confirmPaymentRequest());
  return confirmPaymentMultiCheckout(data)
    .then(async response => {
      dispatch(confirmPaymentSuccess(response[0]?.id)); 
      const currentUser = getState().user.currentUser;
      const bookmarks = currentUser?.attributes?.profile?.protectedData?.bookmarks;
      const purchasedListingIds = response.map(
        t => t.attributes.protectedData.listingData.listingId
      ); 
      // Filter bookmarks - only keep those NOT purchased
      const filteredBookmarks = bookmarks.filter(b => !purchasedListingIds.includes(b.id));
      const profile = {
        protectedData: { bookmarks: filteredBookmarks },
      };
      //Update bookmarks in user profile
      dispatch(updateProfile(profile)); 
      return response[0];
    })
    .catch(e => {
      dispatch(confirmPaymentError(storableError(e)));
      const transactionIdMaybe = transactionId ? { transactionId: transactionId.uuid } : {};
      log.error(e, 'initiate-order-failed', {
        ...transactionIdMaybe,
      });
      throw e;
    });
}; 

export const confirmPayment = (transactionId, transitionName, transitionParams = {}) => (
  dispatch,
  getState,
  sdk
) => {
  dispatch(confirmPaymentRequest());

  const bodyParams = {
    id: transactionId,
    transition: transitionName,
    params: transitionParams,
  };

  const queryParams = {
    include: ['booking', 'provider', 'listing'],
    expand: true,
  };
  return sdk.transactions
    .transition(bodyParams, queryParams)
    .then(async response => {
      const order = response.data.data;
      
      dispatch(confirmPaymentSuccess(order.id));  
      // Update listing availability 
      blockCalenderAvailabilityApi({txId : order.id}) 
      // Remove items from cart 
      const currentUser = getState().user.currentUser;
      const bookmarks = currentUser?.attributes?.profile?.protectedData?.bookmarks;
      const cartItems = order?.attributes?.protectedData?.cartItems || [];
      const listingId = order?.relationships?.listing?.data?.id?.uuid 
      const orderedIds = Array.isArray(cartItems) && cartItems?.length ?  cartItems.map(
        (item) => item.listingId
      ) : [] 
      // Include current listing ID along with cart item IDs for removal
      const idsToRemove = orderedIds.length > 0 ? orderedIds : listingId; 
      if(idsToRemove.length > 0){
        const UpdatedBookMarks = bookmarks.filter((bookmark) => !idsToRemove.includes(bookmark.id));
        const profile = {
          protectedData: { bookmarks: UpdatedBookMarks },
        }
        //Update bookmarks in user profile
        dispatch(updateProfile(profile))
      }
      console.log("Current User Bookmarks:", bookmarks ,order);  
      return order;
    })
    .catch(e => {
      dispatch(confirmPaymentError(storableError(e)));
      const transactionIdMaybe = transactionId ? { transactionId: transactionId.uuid } : {};
      log.error(e, 'initiate-order-failed', {
        ...transactionIdMaybe,
      });
      throw e;
    });
};

export const sendMessage = params => (dispatch, getState, sdk) => {
  const message = params.message;
  const orderId = params.id; 
  if (message) {
    return sdk.messages
      .send({ transactionId: orderId, content: message })
      .then(() => {
        return { orderId, messageSuccess: true };
      })
      .catch(e => {
        log.error(e, 'initial-message-send-failed', { txId: orderId });
        return { orderId, messageSuccess: false };
      });
  } else {
    return Promise.resolve({ orderId, messageSuccess: true });
  }
};

/**
 * Initiate transaction against default-inquiry process
 * Note: At this point inquiry transition is made directly against Marketplace API.
 *       So, client app's server is not involved here unlike with transitions including payments.
 *
 * @param {*} inquiryParams contains listingId and protectedData
 * @param {*} processAlias 'default-inquiry/release-1'
 * @param {*} transitionName 'transition/inquire-without-payment'
 * @returns
 */
export const initiateInquiryWithoutPayment = (inquiryParams, processAlias, transitionName) => (
  dispatch,
  getState,
  sdk
) => {
  dispatch(initiateInquiryRequest());

  if (!processAlias) {
    const error = new Error('No transaction process attached to listing');
    log.error(error, 'listing-process-missing', {
      listingId: listing?.id?.uuid,
    });
    dispatch(initiateInquiryError(storableError(error)));
    return Promise.reject(error);
  }

  const bodyParams = {
    transition: transitionName,
    processAlias,
    params: inquiryParams,
  };
  const queryParams = {
    include: ['provider'],
    expand: true,
  };

  return sdk.transactions
    .initiate(bodyParams, queryParams)
    .then(response => {
      const transactionId = response.data.data.id;
      dispatch(initiateInquirySuccess());
      return transactionId;
    })
    .catch(e => {
      dispatch(initiateInquiryError(storableError(e)));
      throw e;
    });
};

/**
 * Initiate or transition the speculative transaction with the given
 * booking details
 *
 * The API allows us to do speculative transaction initiation and
 * transitions. This way we can create a test transaction and get the
 * actual pricing information as if the transaction had been started,
 * without affecting the actual data.
 *
 * We store this speculative transaction in the page store and use the
 * pricing info for the booking breakdown to get a proper estimate for
 * the price with the chosen information.
 */

export const fetchShippingRates = params => (dispatch, getState, sdk) => {
  dispatch(fetchRatesRequest());
  return getShippingRates(params)
    .then(response => {
      if (response) {
        dispatch(fetchRatesSuccess(response));
        return response;
      }
    })
    .catch(e => {
      dispatch(fetchRatesError(storableError(e)));
    });
};

export const fetchShppingLineItem = (orderParams, processAlias, transitionName) => (
  dispatch,
  getState,
  sdk
) => {
  console.log("fetchShppingLineItem called");
  dispatch(fetchShippingLineItemRequest());
  const {
    deliveryMethod,
    quantity,
    bookingDates,
    cart,
    shippoShippingDetails,
    selectedShippingOption,
    ...otherOrderParams
  } = orderParams;
  const quantityMaybe = quantity ? { stockReservationQuantity: quantity } : {};
  const bookingParamsMaybe = bookingDates || {};
  // Parameters only for client app's server
  const orderData = deliveryMethod
    ? { cart, deliveryMethod, selectedShippingOption }
    : { cart, selectedShippingOption };

  // Parameters for Marketplace API
  const transitionParams = {
    ...quantityMaybe,
    ...bookingParamsMaybe,
    ...otherOrderParams,
    cardToken: 'CheckoutPage_speculative_card_token',
  };

  const bodyParams = {
    processAlias,
    transition: transitionName,
    params: transitionParams,
  };

  const queryParams = {
    include: ['booking', 'provider'],
    expand: true,
  };

  const handleSuccess = response => {
    const entities = denormalisedResponseEntities(response);
    if (entities.length !== 1) {
      throw new Error('Expected a resource in the speculate response');
    }
    const tx = entities[0];
    dispatch(speculateTransactionSuccess(tx));
  };

  const handleError = e => {
    log.error(e, 'speculate-transaction-failed', {
      listingId: transitionParams.listingId.uuid,
      ...quantityMaybe,
      ...bookingParamsMaybe,
      ...orderData,
    });
    return dispatch(speculateTransactionError(storableError(e)));
  };
  console.log("fetchShppingLineItem called 595"); 
  return initiatePrivileged({ isSpeculative: true, orderData, bodyParams, queryParams })
    .then(handleSuccess)
    .catch(handleError);
};

export const speculateTransaction = (
  orderParams,
  processAlias,
  transactionId,
  transitionName,
  isPrivilegedTransition
) => (dispatch, getState, sdk) => {
  console.log("speculateTransaction called", orderParams);
  dispatch(speculateTransactionRequest());
  // If we already have a transaction ID, we should transition, not
  // initiate.
  const isTransition = !!transactionId;

  const {
    deliveryMethod,
    priceVariantName,
    quantity,
    bookingDates,
    deliveryfee,
    productType,
    selectedPricingOption,
    setupPrice,
    cartItems,
    ...otherOrderParams
  } = orderParams;
  const quantityMaybe = quantity ? { stockReservationQuantity: quantity } : {};
  const bookingParamsMaybe =
    Array.isArray(cartItems) && cartItems.length > 1
      ? bookingDates?.[0] ?? {}
      : Array.isArray(bookingDates)
      ? bookingDates[0] ?? {}
      : bookingDates || {};

  // Parameters only for client app's server
  const orderData = {
    ...(deliveryMethod
      ? { deliveryMethod, deliveryfee, productType, selectedPricingOption, setupPrice, cartItems }
      : { deliveryfee, productType, selectedPricingOption, setupPrice, cartItems }),
    ...(priceVariantName ? { priceVariantName } : {}),
  };
  console.log(orderData, "orderData in speculateTransaction");
  // Parameters for Marketplace API
  const transitionParams = {
    ...quantityMaybe,
    ...bookingParamsMaybe,
    ...otherOrderParams,
    cardToken: 'CheckoutPage_speculative_card_token',
  };

  const bodyParams = isTransition
    ? {
      id: transactionId,
      transition: transitionName,
      params: transitionParams,
    }
    : {
      processAlias,
      transition: transitionName,
      params: transitionParams,
    };

  const queryParams = {
    include: ['booking', 'provider'],
    expand: true,
  };

  const handleSuccess = response => {
    const entities = denormalisedResponseEntities(response);
    if (entities.length !== 1) {
      throw new Error('Expected a resource in the speculate response');
    }
    const tx = entities[0];
    dispatch(speculateTransactionSuccess(tx));
  };

  const handleError = e => {
    log.error(e, 'speculate-transaction-failed', {
      listingId: transitionParams.listingId.uuid,
      ...quantityMaybe,
      ...bookingParamsMaybe,
      ...orderData,
    });
    return dispatch(speculateTransactionError(storableError(e)));
  };
  console.log("speculateTransaction called 595",isTransition , isPrivilegedTransition);
  if (isTransition && isPrivilegedTransition) { 
    // transition privileged
    return transitionPrivileged({ isSpeculative: true, orderData, bodyParams, queryParams })
      .then(handleSuccess)
      .catch(handleError);
  } else if (isTransition) {
    // transition non-privileged
    return sdk.transactions
      .transitionSpeculative(bodyParams, queryParams)
      .then(handleSuccess)
      .catch(handleError);
  }
  else if (isPrivilegedTransition) {
    // initiate privileged
    return initiatePrivileged({ isSpeculative: true, orderData, bodyParams, queryParams })
      .then(handleSuccess)
      .catch(handleError);
  } else {
    // initiate non-privileged
    return sdk.transactions
      .initiateSpeculative(bodyParams, queryParams)
      .then(handleSuccess)
      .catch(handleError);
  }
};

// StripeCustomer is a relantionship to currentUser
// We need to fetch currentUser with correct params to include relationship
export const stripeCustomer = () => (dispatch, getState, sdk) => {
  dispatch(stripeCustomerRequest());
  const fetchCurrentUserOptions = {
    callParams: { include: ['stripeCustomer.defaultPaymentMethod'] },
    updateHasListings: false,
    updateNotifications: false,
    enforce: true,
  };

  return dispatch(fetchCurrentUser(fetchCurrentUserOptions))
    .then(response => {
      dispatch(stripeCustomerSuccess());
    })
    .catch(e => {
      dispatch(stripeCustomerError(storableError(e)));
    });
};
