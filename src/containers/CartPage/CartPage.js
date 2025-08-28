import React, { Component } from 'react';
import { array, arrayOf, func, object, shape, string } from 'prop-types';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { useHistory, useLocation } from 'react-router-dom';
import classNames from 'classnames';
import { useIntl, intlShape, FormattedMessage } from '../../util/reactIntl';
import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { createResourceLocatorString, findRouteByRouteName } from '../../util/routes';
import { isOriginInUse } from '../../util/search';
import { createSlug } from '../../util/urlHelpers';
import { propTypes } from '../../util/types';
import { getListingsById, getMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { manageDisableScrolling, isScrollingDisabled } from '../../ducks/ui.duck';

import { Button, LayoutSideNavigation, Modal, Page } from '../../components';
import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';
import { setActiveListing } from '../../containers/SearchPage/SearchPage.duck';
import CartPanel from '../../components/CartPanel/CartPanel';
import css from './CartPage.module.css';
import { initializeCardPaymentData } from '../../ducks/stripe.duck';
import { fetchTransactionLineItems } from '../ListingPage/ListingPage.duck';
import { updateProfile } from '../ProfileSettingsPage/ProfileSettingsPage.duck';
import { types as sdkTypes } from '../../util/sdkLoader';
import { ADD_DELIVERY_LOCATION, deliveryPickupMethodOptions, getValidAvailabilityDates, isDateAvailable, SELECT_DELIVERY, SELECT_PACKAGE } from '../../util/data';
import Addaddress from '../ListingPage/Addaddress/Addaddress';
import { checkDeliveryLocation } from '../../ducks/paymentMethods.duck';
import { fetchShippingRates } from '../CheckoutPage/CheckoutPage.duck';

const { UUID } = sdkTypes;

export class CartPageComponent extends Component {
  constructor(props) {
    super(props);

    this.state = {
      isSearchMapOpenOnMobile: props.tab === 'map',
      isMobileModalOpen: false,
      isSecondaryFiltersOpen: false,
      bookmarks: props && props.bookmarks && props.bookmarks.length ? props.bookmarks : [],
      stockCount: 1,
      stockListing: null,
      stockDetails: [],
      buttonIndex: -1,
      resetState: false,
      sd: [],
      selectedItems: [],
      selectedSellCheckout: {}, // listingId: { ...listing, deliveryMethod, shippoRate, shippoObjectId, shippingPrice } 
      shippingPrices: {}, // Add this
      cartSelectedItems: [],
      selectedRentItems: [],
      cartSelectedItemsForRent: [],
      cartSelectedItemModalOpen: false, // here we will fetch all items selected during cart for buy 
      isShippingDropdownOpen: false, // through this state modal will open 
      trackStep: null,
    };
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleWishlist = this.handleWishlist.bind(this);
    this.removeFromState = this.removeFromState.bind(this);
    this.handleSelectSellItem = this.handleSelectSellItem.bind(this);
    this.handleSelectRentItem = this.handleSelectRentItem.bind(this);
    this.handleSellDeliveryMethodChange = this.handleSellDeliveryMethodChange.bind(this);
  }

 

  componentDidUpdate(prevProps, prevState) {
    if (prevState.buttonIndex !== this.state.buttonIndex) {
      this.setState({ resetState: true });
    }
    const { isAuthenticated, getListing, currentUser } = this.props;
    const bookmarks = currentUser?.attributes?.profile?.protectedData?.bookmarks;

    if (
      isAuthenticated &&
      this.state.stockDetails &&
      this.state.stockDetails.length <= 0 &&
      currentUser &&
      currentUser.id
    ) {
      bookmarks &&
        bookmarks.map(item => {
          const listingId = new UUID(item.id);
          const listing = getListing(listingId);
        });
    } else if (this.state.stockDetails && this.state.stockDetails.length <= 0) {
      let localBookmarks =
        typeof window !== 'undefined' &&
          window.localStorage.getItem('localBookmarks') &&
          window.localStorage.getItem('localBookmarks').length > 0
          ? window.localStorage.getItem('localBookmarks')
          : [];

      if (typeof localBookmarks === 'string') {
        localBookmarks =
          typeof window !== 'undefined' &&
          window.localStorage &&
          JSON.parse(window.localStorage.getItem('localBookmarks'));
      }

      localBookmarks &&
        localBookmarks.forEach(item => {
          const listingId = new UUID(item.id);
          const listing = getListing(listingId);
          if (listing) {
            return this.handleAdd({ ...listing, quantity: Number(item.quantity) });
          }
        });
    }
  }

  handleSubmit(cartListings, ind) {
    const {
      history,
      callSetInitialValues,
      onInitializeCardPaymentData,
      routeConfiguration,
      currentUser,
    } = this.props;
    const bookmarks = currentUser?.attributes?.profile?.protectedData?.bookmarks || [];
  
  
    if (!Array.isArray(cartListings) || cartListings.length === 0) {
      console.warn('Cart listings are empty or invalid');
      return;
    }

    const cartListingsIds = Array.isArray(cartListings)
      ? cartListings.map(item => item?.id?.uuid)
      : [];

    const vendorListing = cartListings && cartListings[0];
    const listing = vendorListing;

    const matchedBookmarks = bookmarks.filter(b => cartListingsIds.includes(b?.id));
    if (matchedBookmarks.length === 0) {
      console.warn('No bookmarks matched with cart listings');
      return;
    }
    const bookingDates = matchedBookmarks.map(attr => ({
      bookingStart: attr.startDate ? new Date(attr.startDate) : null,
      bookingEnd: attr.endDate ? new Date(attr.endDate) : null,
    }));
    const sd = matchedBookmarks.reduce((acc, bookmark) => { 
      const {
        id,
        selectedDays,
        startDate,
        endDate,
        quantity,
        productType,
        seats, 
      } = bookmark;

      const matchedItem = cartListings.find(item => item?.id?.uuid === id);
      if (!matchedItem) {
        console.warn(`No matching listing found for bookmark id: ${id}`);
        return acc;
      } 
      const {
        attributes = {},
        images,
        currentStock,
        shippingPrice,
        shippoObjectId,
        deliveryMethod,
        deliveryfee,
        selectedSetUpFee,  
        SecurityDepositAmount
      } = matchedItem; 
      const { title, price, description, publicData = {} } = attributes;
      const {
        listingCategory,
        otherEventType,
        transactionProcessAlias,
        unitType,
        setupPrice
      } = publicData || {};

      const productQuantity = currentStock?.attributes?.quantity; 
      acc.push({
        listingId: matchedItem.id.uuid,
        productType,
        price,
        isRental: productType == 'rent'? true : false,
        currency: price?.currency,
        title,
        selectedDays,
        bookingStartDate: startDate,
        bookingEndDate: endDate,
        images,
        oldStock: productQuantity,
        stockCount: parseInt(quantity, 10),
        shippoRate: shippingPrice,
        shippoObjectId,
        deliveryMethod: deliveryMethod || null,
        transactionProcessAlias,
        seats: seats ? parseInt(seats, 10) : null,
        unitType,
        deliveryfee:  deliveryfee || null,
        setupPrice: setupPrice || null,
        selectedSetUpFee: selectedSetUpFee || null,
        SecurityDepositAmount: SecurityDepositAmount || null
      }); 
      return acc;
    }, []); 
    if (sd.length === 0) {
      console.warn('No valid checkout items (sd) were prepared.');
      return;
    }   
 
    const globalProductType = sd[0]?.productType;
    const baseQuantity =
      globalProductType === 'rent'
        ? 1
        : Number.parseInt(sd[0]?.stockCount || 0, 10); 
    const initialValues = {
      listing: vendorListing,
      orderData: {
        bookingDates,
        quantity: baseQuantity,
        otherOrderData: {
          cartItems: sd,
        },
      },
      confirmPaymentError: null,
    }; 
    const saveToSessionStorage = !this.props.currentUser;
    const routes = routeConfiguration;
    const { setInitialValues } = findRouteByRouteName('CheckoutPage', routes);
    callSetInitialValues(setInitialValues, initialValues, saveToSessionStorage);
    onInitializeCardPaymentData();
    history.push(
      createResourceLocatorString(
        'CheckoutPage',
        routes,
        {
          id: listing?.id?.uuid,
          slug: createSlug(listing?.attributes?.title),
        },
        {}
      )
    );
  }

  removeFromState(id) {
    const index = this.state.stockDetails.findIndex(item => item.listingId == id);
    this.state.stockDetails && this.state.stockDetails.splice(index, 1);
  }

  handleWishlist(id, e) {
    const { onUpdateProfile, currentUser, isAuthenticated } = this.props;
    const bookmarks = currentUser?.attributes?.profile?.protectedData?.bookmarks;

    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated && e && id) {
      let localBookmarks =
        typeof window !== 'undefined' &&
          window.localStorage.getItem('localBookmarks') &&
          window.localStorage.getItem('localBookmarks').length > 0
          ? window.localStorage.getItem('localBookmarks')
          : [];

      if (typeof localBookmarks === 'string') {
        localBookmarks =
          typeof window !== 'undefined' &&
          window.localStorage &&
          JSON.parse(window.localStorage.getItem('localBookmarks'));
      }

      const localIndex = localBookmarks && localBookmarks.findIndex(b => b.id == id);

      if (localIndex > -1) {
        let bookmarks = localBookmarks.filter(e => e.id != id);
        localBookmarks && localBookmarks.splice(localIndex, 1);
        const removedBookmarks = Array.from(new Set(bookmarks));
        typeof window !== 'undefined' &&
          window.localStorage.setItem('localBookmarks', JSON.stringify(removedBookmarks));
      } else {
        localBookmarks.push(id);
        const addedBookmarks = Array.from(new Set(localBookmarks));
        typeof window !== 'undefined' &&
          window.localStorage.setItem('localBookmarks', JSON.stringify(addedBookmarks));
      }
    }

    const index = bookmarks && bookmarks.findIndex(b => b.id == id);

    if (isAuthenticated) {
      typeof window !== 'undefined' && window.localStorage.removeItem('localBookmarks');
    }

    if (id) {
      if (index > -1) {
        bookmarks && bookmarks.splice(index, 1);
        const removedBookmarks = Array.from(new Set(bookmarks));
        const profile = {
          protectedData: {
            bookmarks: removedBookmarks,
          },
        };
        onUpdateProfile(profile);
      } else {
        bookmarks && bookmarks.push(id);
        const addedBookmarks = Array.from(new Set(this.state.bookmarks));
        const profile = {
          protectedData: {
            bookmarks: addedBookmarks,
          },
        };
        onUpdateProfile(profile);
      }
    }
  }


  handleSellDeliveryMethodChange = (listing, deliveryMethod) => {
    const listingId = listing.id.uuid;
    // Update the selected delivery methods state
    this.setState(prevState => ({
      selectedSellCheckout: {
        ...prevState.selectedSellCheckout,
        [listingId]: { ...prevState.selectedSellCheckout[listingId], deliveryMethod },
      },
    }));
  };

  handleSelectSellItem(listing, checked) {
    const listingId = listing.id.uuid;
    const sellDeliveryOptions = listing?.attributes?.publicData?.sellDeliveryOptions;

    this.setState(prevState => {
      let deliveryMethod = prevState.selectedSellCheckout[listingId]?.deliveryMethod;

      // Auto-select delivery method if only one option exists
      if (!deliveryMethod && Array.isArray(sellDeliveryOptions) && sellDeliveryOptions.length === 1) {
        deliveryMethod = sellDeliveryOptions[0];
      }

      const updatedCheckout = { ...prevState.selectedSellCheckout };
      let updatedCartSelectedItems = [...prevState.cartSelectedItems];

      if (checked) {
        // if (!deliveryMethod && Array.isArray(sellDeliveryOptions) && sellDeliveryOptions.length > 1) {
        //   alert('Please select a delivery method first');
        //   return prevState; // no state update
        // }

        // ✅ Add to checkout
        updatedCheckout[listingId] = { ...listing, deliveryMethod };

        // ✅ Add to cartSelectedItems if not already present
        if (!updatedCartSelectedItems.some(item => item.id.uuid === listingId)) {
          updatedCartSelectedItems.push(listing);
        }
      } else {
        // ✅ Remove from checkout
        delete updatedCheckout[listingId];

        // ✅ Remove from cartSelectedItems
        updatedCartSelectedItems = updatedCartSelectedItems.filter(
          item => item.id.uuid !== listingId
        );
      }  
      return {
        selectedSellCheckout: updatedCheckout,
        cartSelectedItems: updatedCartSelectedItems
      };
    });
  }
handleSelectRentItem = (listing, checked) => {
  this.setState(prevState => {
    let updated = [...prevState.selectedRentItems]; 
    if (checked) {
      // Add listing if not already included
      if (!updated.some(item => item.id.uuid === listing.id.uuid)) {
        updated.push({ ...listing, isRental: true });
      }
    } else {
      // Remove listing if unchecked
      updated = updated.filter(item => item.id.uuid !== listing.id.uuid);
    } 
    return { selectedRentItems: updated };
  });
};

 

  // After fetching shipping prices, let user select a rate and update checkout object
  handleSelectShippingRate = (listingId, selectedRate) => {
    this.setState(prevState => {
      const updatedCheckout = { ...prevState.selectedSellCheckout };
      if (updatedCheckout[listingId]) {
        updatedCheckout[listingId] = {
          ...updatedCheckout[listingId],
          shippoRate: selectedRate,
          shippoObjectId: selectedRate.object_id,
          shippingPrice: selectedRate.amount,
        };
      }
      return { selectedSellCheckout: updatedCheckout };
    });
  };

  // Update fetchShippingPricesForSelectedItems to use selectedSellCheckout
  fetchShippingPricesForSelectedItems = (addressParams) => {
    const { selectedSellCheckout } = this.state;
    const recipientAddressLine1 = addressParams?.Street_address || '';
    const recipientAddressLine2 = addressParams?.Postal_code || '';
    const recipientStreet = `${recipientAddressLine1} ${recipientAddressLine2 || ''}`.trim();
    const itemsNeedingShipping = Object.values(selectedSellCheckout).filter(listing => {
      const deliveryMethod = listing.deliveryMethod;
      return deliveryMethod === 'delivery' || deliveryMethod === 'shipping';
    });
    const shippingPricesPromises = itemsNeedingShipping.map(listing => {
      const listingId = listing.id.uuid;
      const {
        deliveryAddressSell,
        autherEmail,
        autherPhoneNumber,
        sellPackageLength,
        sellPackageWidth,
        sellPackageHeight,
        sellPackageWeight
      } = listing.attributes?.publicData || {};
      const payload = {
        address_from: {
          name: listing.author?.attributes?.profile?.displayName || 'Sender',
          street1: deliveryAddressSell?.sellShippingAddress,
          city: deliveryAddressSell?.sellShippingCity,
          state: deliveryAddressSell?.sellShippingState,
          zip: deliveryAddressSell?.sellShippingZipCode,
          country: 'US',
          email: autherEmail || 'sender@yopmail.com',
          phone: autherPhoneNumber || '555-123-4567',
        },
        address_to: {
          name: addressParams?.name || 'Customer',
          organization: 'Shippo',
          street1: recipientStreet,
          city: addressParams?.city,
          state: addressParams?.state,
          zip: addressParams?.Postal_code,
          country: addressParams?.country || 'US',
        },
        parcels: [
          {
            length: sellPackageLength || '10',
            width: sellPackageWidth || '10',
            height: sellPackageHeight || '10',
            distance_unit: 'in',
            weight: sellPackageWeight || '1',
            mass_unit: 'lb',
          },
        ],
      };
      return this.props.onfetchPriceFromShipo(payload)
        .then(shippingResult => ({ listingId, shippingResult, success: true }))
        .catch(error => ({ listingId, error, success: false }));
    });
    Promise.allSettled(shippingPricesPromises)
      .then(results => {
        const shippingPrices = {};
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            const { listingId, shippingResult } = result.value;
            shippingPrices[listingId] = shippingResult;
          }
        });
        // Store shipping prices in checkout object for each listing
        this.setState(prevState => {
          const updatedCheckout = { ...prevState.selectedSellCheckout };
          Object.keys(shippingPrices).forEach(listingId => {
            if (updatedCheckout[listingId]) {
              updatedCheckout[listingId] = {
                ...updatedCheckout[listingId],
                shippingRates: shippingPrices[listingId].rates || [],
              };
            }
          });
          return { selectedSellCheckout: updatedCheckout };
        });
      });
  };
  // Use this object for checkout
  handleSubmitSellCheckout = () => {
    const checkoutItems = this.state.cartSelectedItems;
    this.handleSubmit(checkoutItems, 'sell-all');
  }
  // update cartSelectedItem deliveryMethod
  updateCartSelectedItemDeliveryMethod = (listingId, method) => {
    this.setState(prevState => {
      const updatedItems = prevState.cartSelectedItems.map(item => {
        if (item.id.uuid === listingId) {
          return {
            ...item,
            deliveryMethod: method
          };
        }
        return item;
      });
      return { cartSelectedItems: updatedItems };
    });
  };
  //start - handle shipping rates in cartItems 

  toggleShippingDropdown = (listingId) => {
    this.setState(prevState => ({
      openShippingDropdownId:
        prevState.openShippingDropdownId === listingId ? null : listingId
    }));
  };

  // Handle selecting a shipping rate
  handleShippingDropDown = (listingId, rate) => {
    this.setState(prevState => {
      const updatedCart = prevState.cartSelectedItems.map(item => {
        if (item.id.uuid === listingId) {
          return {
            ...item,
            selectedShippingOption: rate, // store full rate object for easy UI rendering
            shippingPrice: rate.amount,
            shippoObjectId: rate.object_id
          };
        }
        return item;
      });

      return {
        cartSelectedItems: updatedCart,
        openShippingDropdownId: null // close dropdown
      };
    });
  };
  //end- handle shipping rates in cartItems 
  render() {
    const {
      listings,
      scrollingDisabled,
      config,
      currentUser,
      isAuthenticated,
      pagination,
      queryInProgress,
      queryParams,
      bookmarks,
      checkAvailabilty,
      checkDeliveryLocationInProgress,
      checkDeliveryLocationError,
      deliveryLocationResponse,
      oncheckDeliveryLocation,
      onfetchPriceFromShipo
    } = this.props;



    const validateCartSelectedItems = (cartSelectedItems) => {
      if (!Array.isArray(cartSelectedItems) || cartSelectedItems.length === 0) {
        return false;
      }
      return cartSelectedItems.every(item => item.deliveryMethod && item.deliveryMethod.trim() !== '');
    };


    const modifyListing = listings?.map((listing, index) => {
      const bookmarks = currentUser?.attributes?.profile?.protectedData?.bookmarks;
      if (bookmarks && bookmarks.length > 0) {
        const bookmarkIndex = index % bookmarks.length;
        const bookmark = bookmarks[bookmarkIndex];
        return {
          ...listing,
          startDate: bookmark.startDate,
          endDate: bookmark.endDate,
          productType: bookmark.productType,
          purchaseQuantity: bookmark.quantity,
          selectedPrice: bookmark.selectedPrice,
          selectedSetUpFee: bookmark.selectedSetUpFee,
          deliveryMethod: bookmark.deliveryMethod,
          deliveryfee: bookmark.deliveryfee,
          selectedSetUpFee: bookmark.selectedSetUpFee,
          SecurityDepositAmount : listing?.attributes?.publicData?.depositFee || (listing?.attributes?.price?.amount || 0) * 0.1, // Default to 10% of price if no deposit fee  
        };
      } else {
        return listing;
      }
    });

    const topbarClasses = this.state.isMobileModalOpen
      ? classNames(css.topbarBehindModal, css.topbar)
      : css.topbar;

    const cardRenderSizes = isMapVariant => {
      if (isMapVariant) {
        const panelMediumWidth = 50;
        const panelLargeWidth = 62.5;
        return [
          '(max-width: 767px) 100vw',
          `(max-width: 1023px) ${panelMediumWidth}vw`,
          `(max-width: 1920px) ${panelLargeWidth / 2}vw`,
          `${panelLargeWidth / 3}vw`,
        ].join(', ');
      } else {
        const panelMediumWidth = 50;
        const panelLargeWidth = 62.5;
        return [
          '(max-width: 549px) 100vw',
          '(max-width: 767px) 50vw',
          `(max-width: 1439px) 26vw`,
          `(max-width: 1920px) 18vw`,
          `14vw`,
        ].join(', ');
      }
    };

    const arrKeys = modifyListing &&
      modifyListing.length && [...new Set(modifyListing.map(st => st.author.id.uuid))];
    const combinedListings =
      arrKeys &&
      arrKeys.length &&
      arrKeys.map(item =>
        modifyListing.reduce(
          (acc, curr) => (curr.author?.id?.uuid == item ? [...acc, curr] : [...acc]),
          []
        )
      );

    // Defensive getTotalPrice
    const getTotalPrice = (cl, currentUser) => {
      if (!Array.isArray(cl)) return 0;
      const clUuids = cl
        .filter(listing => listing && listing.id && listing.id.uuid)
        .map(listing => listing.id.uuid);
      const matchedListingsArr = cl?.filter(listing => listing && listing.id && clUuids.includes(listing.id.uuid));
      const matchedListings = matchedListingsArr?.filter(item => item);

      const linePrices = matchedListings?.map((item, index) => {
        const { productType, startDate, endDate, purchaseQuantity, shippingPrice } = item;

        if (productType === 'rent' && startDate && endDate) {
          const price = item?.attributes ? item.attributes?.price?.amount / 100 : 0;
          const setupFee = item?.selectedSetUpFee ? item.selectedSetUpFee / 100 : 0;
          const start = new Date(startDate);
          const end = new Date(endDate);
          const daysDifference = (end - start) / (1000 * 60 * 60 * 24); // Convert ms to days
          return price * daysDifference + setupFee;
        }
        if (productType === 'sell') {
          // Use shippingPrice if present, else fallback to old logic
          const salePrice = item?.attributes?.price?.amount
            ? item.attributes.price.amount / 100
            : 0;
          const quantity = purchaseQuantity ? Number(purchaseQuantity) : 0;
          const shipping = shippingPrice ? Number(shippingPrice) : 0;
          return salePrice * quantity + shipping;
        }

        return 0;
      });

      const sum = linePrices.reduce((partialSum, price) => partialSum + price, 0);
      return sum.toFixed(2);
    };
    const lb =
      typeof window !== 'undefined' &&
      window.localStorage &&
      typeof window.localStorage.getItem('localBookmarks') === 'string' &&
      JSON.parse(window.localStorage.getItem('localBookmarks'));

    const localBookmarks =
      typeof window !== 'undefined' &&
      window.localStorage &&
      typeof window.localStorage.getItem('localBookmarks') === 'string' &&
      JSON.parse(window.localStorage.getItem('localBookmarks')).map(e => e.id);

    const flatListings = [].concat(...(combinedListings || []));
    const forSaleListings = flatListings.filter(
      item => (item?.productType || item?.attributes?.publicData?.productType) === 'sell'
    );
   
    const forRentListings = flatListings.filter(
      item => (item?.productType || item?.attributes?.publicData?.productType) === 'rent'
    ); 
 

    // New method to fetch shipping prices for selected sell items
    const fetchShippingPricesForSelectedItems = (addressParams) => {
      const recipientAddressLine1 = addressParams?.Street_address || '';
      const recipientAddressLine2 = addressParams?.Postal_code || '';
      const recipientStreet = `${recipientAddressLine1} ${recipientAddressLine2 || ''}`.trim();

      // Filter items that need shipping price calculation
      const itemsNeedingShipping = this.state.cartSelectedItems?.filter(listing => {
        const deliveryMethod = listing.deliveryMethod;
        return deliveryMethod === 'delivery' || deliveryMethod === 'shipping';
      });


      // Object to store shipping prices by listing ID
      const shippingPricesPromises = itemsNeedingShipping?.map(listing => {
        const listingId = listing.id.uuid;
        const {
          deliveryAddressSell,
          autherEmail,
          autherPhoneNumber,
          sellPackageLength,
          sellPackageWidth,
          sellPackageHeight,
          sellPackageWeight
        } = listing.attributes?.publicData || {};

        const payload = {
          address_from: {
            name: listing.author?.attributes?.profile?.displayName || 'Sender',
            street1: deliveryAddressSell?.sellShippingAddress,
            city: deliveryAddressSell?.sellShippingCity,
            state: deliveryAddressSell?.sellShippingState,
            zip: deliveryAddressSell?.sellShippingZipCode,
            country: 'US',
            email: autherEmail || 'sender@yopmail.com',
            phone: autherPhoneNumber || '555-123-4567',
          },
          address_to: {
            name: addressParams?.name || 'Customer',
            organization: 'Shippo',
            street1: recipientStreet,
            city: addressParams?.city,
            state: addressParams?.state,
            zip: addressParams?.Postal_code,
            country: addressParams?.country || 'US',
          },
          parcels: [
            {
              length: sellPackageLength || '10',
              width: sellPackageWidth || '10',
              height: sellPackageHeight || '10',
              distance_unit: 'in',
              weight: sellPackageWeight || '1',
              mass_unit: 'lb',
            },
          ],
        };

        // Return promise with listing ID attached
        return onfetchPriceFromShipo(payload)
          .then(shippingResult => ({
            listingId,
            shippingResult,
            success: true
          }))
          .catch(error => ({
            listingId,
            error,
            success: false
          }));
      });

      // Execute all shipping price requests
      Promise.allSettled(shippingPricesPromises)
        .then(results => {
          const shippingPrices = {};
          const errors = [];

          results.forEach(result => {
            if (result.status === 'fulfilled') {
              const { listingId, shippingResult, success, error } = result.value;
              if (success) {
                shippingPrices[listingId] = shippingResult; 
              } else {
                errors.push({ listingId, error });
                console.error(`Failed to fetch shipping price for listing ${listingId}:`, error);
              }
            } else {
              console.error('Promise rejected:', result.reason);
            }
          });

          // Update state with shipping prices
          if (Object.keys(shippingPrices).length > 0) {
            this.setState(prevState => ({
              shippingPrices: {
                ...prevState.shippingPrices,
                ...shippingPrices
              }
            }));
    
          }

          // Handle errors if any
          if (errors.length > 0) {
            console.warn(`Failed to fetch shipping prices for ${errors.length} items:`, errors);
            // You might want to show a notification to the user here
          }
        })
        .catch(error => {
          console.error('Error in Promise.allSettled:', error);
        });
    };
    const handleAddAddressform = params => {
      const recipientAddressLine1 = params?.Street_address || '';
      const recipientAddressLine2 = params?.Postal_code || '';
      const recipientStreet = `${recipientAddressLine1} ${recipientAddressLine2 || ''}`.trim();
      const payload = {
        address_from: {
        },
        address_to: {
          name: params?.name || 'Customer',
          organization: 'Shippo',
          street1: recipientStreet,
          city: params?.city,
          state: params?.state,
          zip: params?.Postal_code,
          country: params?.country || 'US',
        },
        parcels: [
          {
          },
        ],
      };
      oncheckDeliveryLocation(payload)
        .then(async res => {
          const { is_valid } = res.validation_results || false;
          if (is_valid) {
            this.setState({
              trackStep: SELECT_PACKAGE,
            });
            fetchShippingPricesForSelectedItems(params); 
          }
        })
        .catch(e => { 
        });
    };
    return (
      <Page scrollingDisabled={scrollingDisabled}>
        <LayoutSideNavigation
          className={css.LayoutSideNavigation}
          sideNavClassName={css.navigation}
          topbar={
            <>
              <TopbarContainer className={topbarClasses} currentPage="CartPage" />
            </>
          }
          footer={<FooterContainer />}
          profilePageTab={true}
          sideBarButtons
          isAccountSettingTab={true}
          currentPage="CartPage"
        >
          <div className={css.listingCards}>
            {(isAuthenticated && bookmarks && bookmarks?.length > 0) ||
              (!isAuthenticated && lb && lb?.length > 0) ? (
              <>
                {/* ----- FOR-RENT LISTINGS (GROUPED TOGETHER) ----- */}
                {forRentListings.length > 0 && (
                  <div className={css.vendor} key="rent-all">
                    <div className={css.cardHeader}>
                      <div className={css.AutorImgWrapper}>
                        <FormattedMessage id="CartPage.rentalListingsheading" />
                      </div>
                      <div className={css.checkoutButton}>
                        <p className={css.priceWrapper}>
                          Total: <span>${getTotalPrice(forRentListings, currentUser)}</span>
                        </p>
                        <Button
                          onClick={() => this.handleSubmit(this.state.selectedRentItems, 'rent-all')}
                          // onClick={() => console.log(this.state.selectedRentItems, "selectedRentItems")
                          // }
                        // disabled={
                        //   !forRentListings.every(listing => {
                        //     const endDate = listing?.endDate;
                        //     const availabilityDates = getValidAvailabilityDates(checkAvailabilty);
                        //     return endDate && isDateAvailable(endDate, availabilityDates);
                        //   })
                        // }
                        // disabled={true}
                        >
                          <FormattedMessage id="CartPage.CheckoutListingsheading" />
                        </Button>
                      </div>
                    </div>

                    <div className={css.venderCards}>
                      {forRentListings.map((listing, i) => {
                        const isChecked = this.state.selectedRentItems.some(item => item.id.uuid === listing.id.uuid);                      
                          return (
                          <CartPanel
                            className={css.listingCard}
                            key={`rent-${listing.id.uuid}`}
                            listing={listing}
                            renderSizes={cardRenderSizes(false)}
                            setActiveListing={() => { }}
                            handleWishlist={this.handleWishlist}
                            bookmarks={!isAuthenticated ? localBookmarks : bookmarks}
                            handleRemoveFromState={this.removeFromState}
                            currentUser={currentUser}
                            checkAvailabilty={checkAvailabilty}
                            onSelectRent={checked => this.handleSelectRentItem(listing, checked)}
                            onSelectSell={checked => this.handleSelectSellItem(listing, checked)}
                            checked={isChecked}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ----- FOR-SALE LISTINGS (GROUPED TOGETHER) ----- */}
                {forSaleListings.length > 0 && (
                  <div className={css.vendor} key="sell-all">
                    <div className={css.cardHeader}>
                      <div className={css.AutorImgWrapper}>
                        <FormattedMessage id="CartPage.CheckoutSaleListingsheading" />
                      </div>
                      <div className={css.checkoutButton}>
                        <p className={css.priceWrapper}>
                          Total:{' '}
                          <span>${getTotalPrice(this.state.cartSelectedItems, currentUser)}</span>
                        </p>
                        <Button
                          type="button"
                          onClick={() => {
                            // const { selectedSellCheckout } = this.state;
                            // Check if all selected items have a delivery method and all are "delivery"
                            // const allDelivery = Object.values(selectedSellCheckout).length > 0 && Object.values(selectedSellCheckout).some(
                            //   item => item.deliveryMethod == "delivery" || item.deliveryMethod == "shipping"
                            // ); 
                            this.setState({
                              trackStep: SELECT_DELIVERY,
                            });
                            this.setState({ cartSelectedItemModalOpen: true });
                            // if (!allDelivery) {
                            //   this.handleSubmitSellCheckout();
                            // } else {
                            //   this.showAddAddressModal();
                            // }
                          }}
                          disabled={this.state.cartSelectedItems?.length == 0}
                        >
                          Next
                        </Button>
                      </div>
                    </div>

                    <div className={css.venderCards}>
                      {forSaleListings?.map((listing, i) => {
                        const checked = !!Object.values(this.state.selectedSellCheckout).find(
                          item => item?.id?.uuid == listing?.id?.uuid
                        );
                        const deliveryMethod =
                          this.state.selectedSellCheckout[listing.id.uuid]?.deliveryMethod || '';
                        const listingId = listing.id.uuid;
                        const shippingPrice = this.state.shippingPrices?.[listingId] || null;
                        return (
                          <CartPanel
                            className={css.listingCard}
                            key={`sell-${listing.id.uuid}`}
                            listing={listing}
                            renderSizes={cardRenderSizes(false)}
                            setActiveListing={() => { }}
                            handleWishlist={this.handleWishlist}
                            bookmarks={!isAuthenticated ? localBookmarks : bookmarks}
                            handleRemoveFromState={this.removeFromState}
                            currentUser={currentUser}
                            checkAvailabilty={checkAvailabilty}
                            checked={checked}
                            onSelect={checked => this.handleSelectSellItem(listing, checked)}
                            onSelectRent={checked => this.handleSelectRentItem(listing, checked)}
                            onDeliveryMethodChange={this.handleSellDeliveryMethodChange}
                            shippingPrice={shippingPrice}
                            cartSelectedItems={this.state.cartSelectedItems}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className={css.favoriteInfo}>
                {/* Still have an empty cart? Browse our <a href="/s">collection</a> to request an
                outfit for your next event! */}
                <FormattedMessage
                  id="CartPage.EmptyCartMessage"
                  values={{
                    link: chunks => <a href="/s">{chunks}</a>,
                  }}
                />
              </p>
            )}

            {/* Add address Modal  */}
            {/* <Modal
              className={css.stylingListingModal}
              isOpen={this.state.addAddressModal}
              onClose={() => this.hideAddAddressModal()}
              onManageDisableScrolling={() => { }}
              usePortal
            >
              <Addaddress
                config={config}
                showNotValidAddressError={checkDeliveryLocationError}
                checkingValidAdress={checkDeliveryLocationInProgress}
                onSubmit={handleAddAddressform}
                inProgress={false}
              />
            </Modal> */}
          </div>
          <Modal
            className={css.stylingListingModal}
            isOpen={this.state.cartSelectedItemModalOpen}
            onClose={() => this.setState({ cartSelectedItemModalOpen: false })}
            onManageDisableScrolling={this.props.onManageDisableScrolling}
            usePortal
          >
            <div>
              {this.state.trackStep === SELECT_DELIVERY &&
                this.state.cartSelectedItems?.map(listing => {
                  const listingId = listing?.id?.uuid;
                  const { title = '', price, publicData } = listing?.attributes || {};
                  const { purchaseQuantity, images } = listing || 1;
                  let showImage = null;
                  if (Array.isArray(images) && images.length > 0) {
                    const [firstImage] = images;
                    showImage = firstImage?.attributes?.variants?.['listing-card']?.url || null;
                  }
                  const { sellDeliveryOptions } = publicData || {};
                  const isListingBothDeliveryAndPickup =
                    sellDeliveryOptions?.includes('shipping') &&
                    sellDeliveryOptions?.includes('pickup');
                  const onlyOneMethod =
                    sellDeliveryOptions?.length === 1 ? sellDeliveryOptions[0] : null;
                  if (onlyOneMethod && listing.deliveryMethod !== onlyOneMethod) {
                    this.updateCartSelectedItemDeliveryMethod(listingId, onlyOneMethod);
                  }

                  return (
                    <div key={listingId} className={css.methodModal}>
                      <div className={css.methodImage}>
                        <img src={showImage} />
                        <div className={css.methodTitleWrapper}>
                          <div className={css.methodText}>{title}</div>
                          <div className={css.availabilityTag}><span>Availability</span></div>
                        </div>
                      </div>
                      <div className={css.detailRow}>
                        <div className={css.methodDetail}>
                          <div className={css.detailLabel}>Price</div>
                          <div className={css.methodContent}>{price.amount / 100}</div>
                        </div>
                        <div className={css.methodDetail}>
                          <div className={css.detailLabel}>
                            Quantity
                          </div>
                          <div className={css.methodContent}>{purchaseQuantity}</div>
                        </div>
                      </div>

                      <div className={css.listingMethod}>
                        <label>Method</label>
                        {isListingBothDeliveryAndPickup ? (
                          <select
                            name="deliveryMethod"
                            value={listing?.deliveryMethod || ''}
                            onChange={e =>
                              this.updateCartSelectedItemDeliveryMethod(listingId, e.target.value)
                            }
                          >
                            <option value="" disabled>
                              Select Any One
                            </option>
                            {deliveryPickupMethodOptions?.map(optionConfig => (
                              <option key={optionConfig.key} value={optionConfig.key}>
                                {optionConfig.label}
                              </option>
                            ))}
                          </select>
                        ) : onlyOneMethod ? (
                          <select name="deliveryMethod" value={onlyOneMethod} disabled>
                            <option value={onlyOneMethod}>
                              {deliveryPickupMethodOptions?.find(opt => opt.key === onlyOneMethod)
                                ?.label || onlyOneMethod}
                            </option>
                          </select>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>

            {this.state.trackStep === SELECT_DELIVERY && <Button
              className={css.nextButton}
              type="button"
              onClick={() => {
                const containShipping = this.state.cartSelectedItems?.some(listing => listing?.deliveryMethod == "shipping" || listing?.deliveryMethod == "delivery")
         
                if (!containShipping) {
                  this.handleSubmitSellCheckout();
                }
                this.setState({
                  trackStep: ADD_DELIVERY_LOCATION,
                });
              }}
              disabled={!validateCartSelectedItems(this.state.cartSelectedItems)}
            >
              Next
            </Button>}

            {/* Step 2  */}
            {this.state.trackStep === ADD_DELIVERY_LOCATION && (
              <Addaddress
                config={config}
                showNotValidAddressError={checkDeliveryLocationError}
                checkingValidAdress={checkDeliveryLocationInProgress}
                onSubmit={handleAddAddressform}
                inProgress={false}
              />
            )}

            {/* Step 3 Select package for delivery  */}
            {this.state.trackStep === SELECT_PACKAGE && (
              <div className={css.selectPackageBox}>
                <div className={css.addAddressHeading}>Add Address</div>
                {this.state.cartSelectedItems.map(listing => {
                  const listingId = listing?.id?.uuid;
                  const title = listing?.attributes?.title;

                  const shippingRates = this.state.shippingPrices?.[listingId] || [];

                  // Selected value comes from the listing object
                  const selectedOption = listing?.selectedShippingOption || null;

                  return (
                    <div key={listingId} className={css.mainBox}>
                      <label className={css.listingTitle}>{title}</label>
                      {Array.isArray(shippingRates) && shippingRates.length > 0 ? (
                        <div className={css.shippingDropdown}>
                          {/* Clickable label */}
                          <div
                            className={css.selectLabel}
                            onClick={() => this.toggleShippingDropdown(listingId)}
                          >
                            {selectedOption
                              ? `${selectedOption.amount} ${selectedOption.currency} - ${selectedOption.servicelevel?.name
                              } (${selectedOption.duration_terms || 'No duration info'})`
                              : 'Select option'}
                          </div>
                          {/* Dropdown list */}
                          {this.state.openShippingDropdownId === listingId && (
                            <div className={css.selectDropdown}>
                              <ul>
                                {[...shippingRates]
                                  .sort((a, b) => Number(a.amount) - Number(b.amount))
                                  .map(rate => (
                                    <li
                                      key={rate.object_id}
                                      onClick={() => this.handleShippingDropDown(listingId, rate)}
                                    >
                                      {rate.amount} {rate.currency} - {rate.servicelevel?.name} (
                                      {rate.duration_terms || 'No duration info'})
                                      {rate.attributes?.includes('CHEAPEST') && (
                                        <span className={css.cheapLabel}>Cheapest</span>
                                      )}
                                      {rate.attributes?.includes('FASTEST') && (
                                        <span className={css.fastLabel}>Fastest</span>
                                      )}
                                      {rate.attributes?.includes('BESTVALUE') && (
                                        <span className={css.valueLabel}>Best Value</span>
                                      )}
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <Button
                className={css.nextButton}
                  type="button"
                  onClick={() => {
                    this.handleSubmitSellCheckout();
                  }}
                  disabled={false}
                >
                  Next
                </Button>
              </div>
            )}
          </Modal>
        </LayoutSideNavigation>
      </Page>
    );
  }
}

CartPageComponent.defaultProps = {
  listings: [],
  pagination: null,
  searchListingsError: null,
  searchParams: {},
  tab: 'listings',
  activeListingId: null,
};

CartPageComponent.propTypes = {
  listings: array,
  history: shape({
    push: func.isRequired,
  }).isRequired,
  location: shape({
    search: string.isRequired,
  }).isRequired,
  intl: intlShape.isRequired,
  config: object.isRequired,
  routeConfiguration: arrayOf(propTypes.route).isRequired,
};

const EnhancedSearchPage = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();

  return (
    <CartPageComponent
      config={config}
      routeConfiguration={routeConfiguration}
      intl={intl}
      history={history}
      location={location}
      {...props}
    />
  );
};

const mapStateToProps = state => {
  const {
    showListingError,
    reviews,
    fetchReviewsError,
    timeSlots,
    fetchTimeSlotsError,
    sendEnquiryInProgress,
    sendEnquiryError,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    enquiryModalOpenForListingId,
    currentPageResultIds,
    pagination,
    queryInProgress,
    queryListingsError,
    queryParams,
    checkAvailabilty,
  } = state.CartPage;

  const { checkDeliveryLocationInProgress,
    checkDeliveryLocationError,
    deliveryLocationResponse } = state?.paymentMethods || {}
 
  const { currentUser } = state.user;
  const { isAuthenticated } = state.auth;

  const getListing = id => {
    const ref = { id, type: 'listing' };
    const listings = getMarketplaceEntities(state, [ref]);
    return listings.length === 1 ? listings[0] : null;
  };

  const getOwnListing = id => {
    const ref = { id, type: 'ownListing' };
    const listings = getMarketplaceEntities(state, [ref]);
    return listings.length === 1 ? listings[0] : null;
  };

  const bookmarks =
    currentUser &&
    currentUser?.attributes &&
    currentUser?.attributes?.profile &&
    currentUser?.attributes?.profile?.protectedData &&
    currentUser?.attributes?.profile?.protectedData?.bookmarks?.map(e => e.id);

  const result = bookmarks?.map(id => {
    return currentPageResultIds?.find(item => item?.uuid === id);
  });

  const ownBookmarks = result;

  const localBookmarks =
    typeof window !== 'undefined' &&
    typeof window.localStorage.getItem('localBookmarks') === 'string' &&
    JSON.parse(window.localStorage.getItem('localBookmarks')).map(e => e.id);

  const ownLocalBookmarks =
    localBookmarks && currentPageResultIds
      ? currentPageResultIds.filter(item => localBookmarks.indexOf(item.uuid) !== -1)
      : [];
  const listings = ownBookmarks
    ? getListingsById(state, ownLocalBookmarks.length > 0 ? ownLocalBookmarks : ownBookmarks)
    : null;

  const featuredListings = currentPageResultIds
    ? getListingsById(state, currentPageResultIds)
    : null;

  const filteredFl = featuredListings.filter(
    item =>
      item.attributes &&
      item.attributes.title &&
      item.attributes.title.includes('Vendor Listing') !== true
  );

  return {
    isAuthenticated,
    currentUser,
    getListing,
    getOwnListing,
    scrollingDisabled: isScrollingDisabled(state),
    enquiryModalOpenForListingId,
    showListingError,
    reviews,
    fetchReviewsError,
    timeSlots,
    fetchTimeSlotsError,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    sendEnquiryInProgress,
    sendEnquiryError,
    bookmarks,
    currentUser,
    currentPageResultIds,
    featuredListings: filteredFl,
    listings,
    pagination,
    queryInProgress,
    queryListingsError,
    queryParams,
    checkAvailabilty,
    checkDeliveryLocationInProgress,
    checkDeliveryLocationError,
    deliveryLocationResponse,
  };
};

const mapDispatchToProps = dispatch => ({
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
  onActivateListing: listingId => dispatch(setActiveListing(listingId)),
  onInitializeCardPaymentData: () => dispatch(initializeCardPaymentData()),
  callSetInitialValues: (setInitialValues, values, saveToSessionStorage) =>
    dispatch(setInitialValues(values, saveToSessionStorage)),
  onSendEnquiry: (listingId, message) => dispatch(sendEnquiry(listingId, message)),
  onFetchTransactionLineItems: params => dispatch(fetchTransactionLineItems(params)),
  onUpdateProfile: data => dispatch(updateProfile(data)),
  oncheckDeliveryLocation: params => dispatch(checkDeliveryLocation(params)),
  onfetchPriceFromShipo: params => dispatch(fetchShippingRates(params)),
});

const CartPage = compose(connect(mapStateToProps, mapDispatchToProps))(EnhancedSearchPage);

CartPage.loadData = (params, search) => {
  const queryParams = parse(search);
  const page = queryParams.page || 1;
  return searchListings({
    ...queryParams,
    page,
    perPage: RESULT_PAGE_SIZE,
    include: ['author', 'images'],
    'fields.listing': ['title', 'geolocation', 'price', 'publicData', 'createdAt'],
    'fields.user': ['profile', 'profile.displayName', 'profile.abbreviatedName'],
    'fields.image': ['variants.landscape-crop', 'variants.landscape-crop2x'],
    'limit.images': 1,
  });
};

export default CartPage;
