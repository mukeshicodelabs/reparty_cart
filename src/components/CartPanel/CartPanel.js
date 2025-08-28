import React, { Component, useEffect, useRef, useState } from 'react';
import { string, func, bool, object } from 'prop-types';
import classNames from 'classnames';
import { useConfiguration } from '../../context/configurationContext';
import { intlShape, injectIntl, FormattedMessage } from '../../util/reactIntl';
import { lazyLoadWithDimensions } from '../../util/uiHelpers';
import { formatMoney } from '../../util/currency';
import { deliveryPickupMethodOptions, ensureListing, ensureUser, isProductForRent } from '../../util/data';
import { richText } from '../../util/richText';
import { createSlug } from '../../util/urlHelpers';

import { AspectRatioWrapper, AvatarLarge, NamedLink, ResponsiveImage } from '../../components';

import css from './CartPanel.module.css';
import { types as sdkTypes } from '../../util/sdkLoader';
import moment from 'moment';
import { propTypes } from '../../util/types';
import BrandIconCard from '../BrandIconCard/BrandIconCard';
const { Money } = sdkTypes;

const MIN_LENGTH_FOR_LONG_WORDS = 10;

const priceData = (price, currency, intl) => {
  if (price && price.currency === currency) {
    const formattedPrice = formatMoney(intl, price);
    return { formattedPrice, priceTitle: formattedPrice };
  } else if (price) {
    return {
      formattedPrice: intl.formatMessage(
        { id: 'ListingCard.unsupportedPrice' },
        { currency: price.currency }
      ),
      priceTitle: intl.formatMessage(
        { id: 'ListingCard.unsupportedPriceTitle' },
        { currency: price.currency }
      ),
    };
  }
  return {};
};

// Helper function to format shipping rates for dropdown
const formatShippingRates = (shippingPrice, intl) => {
  // This function is no longer needed as we're working directly with the shippingPrice.rates
  // Keeping it for backwards compatibility but it's not used in the new implementation
  return [];
};

const LazyImage = lazyLoadWithDimensions(ResponsiveImage, { loadAfterInitialRendering: 3000 });

export const CartPanelComponent = props => {
  const config = useConfiguration();
  const {
    className,
    rootClassName,
    intl,
    listing,
    renderSizes,
    setActiveListing,
    bookmarks,
    handleWishlist,
    handleRemoveFromState = () => {},
    currentUser,
    checkAvailabilty,
    checked,
    onSelect,
    onSelectRent,
    onDeliveryMethodChange,
    shippingPrice, // Add shipping price prop
    onShippingRateChange, // Add callback for shipping rate selection
  } = props; 

  const classes = classNames(rootClassName || css.root, className);
  const currentListing = ensureListing(listing);

  const { title = '', price, publicData } = currentListing?.attributes || {};
  const { productType, selectedPrice } = currentListing || {};
  const { sellDeliveryOptions } = publicData || [];

  const isListingBothDeliveryAndPickup =
    productType == 'sell' &&
    sellDeliveryOptions?.includes('shipping') &&
    sellDeliveryOptions?.includes('pickup');
  const onlyOneMethod = sellDeliveryOptions?.length == 1 ? sellDeliveryOptions[0] : null;

  const isRent = isProductForRent(productType);

  const id = currentListing.id.uuid;
  const startDate = moment(currentListing?.startDate).format('MM/DD/YYYY');
  const endDate = moment(currentListing?.endDate)
    .subtract(1, 'days')
    .format('MM/DD/YYYY');

  const slug = createSlug(title);
  const author = ensureUser(listing.author);
  const authorName = author.attributes.profile.displayName;
  const firstImage =
    currentListing.images && currentListing.images.length > 0 ? currentListing.images[0] : null;

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'scaled-small',
  } = config.layout.listingImage;
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter(k => k.startsWith('scaled-small'))
    : [];
  const selectedRentalPrice = new Money(selectedPrice, 'USD');

  const cartItemprice = productType === 'rent' ? price : price;

  const { formattedPrice, priceTitle } = priceData(cartItemprice, config.currency, intl);
  
  const [isHovered, setHovered] = useState('');
  const [selectedShippingRate, setSelectedShippingRate] = useState(null);
  const [isShippingDropdownOpen, setIsShippingDropdownOpen] = useState(false);
  const [selectedShippingOption, setSelectedShippingOption] = useState(null);  
 
  const divRef = useRef(null)
    const handleShippingDropDown = rate => {  
    setSelectedShippingOption(rate); 
    setIsShippingDropdownOpen(false);
     
  };

  const setActivePropsMaybe = setActiveListing
    ? {
        onMouseEnter: () => setActiveListing(currentListing.id),
        onMouseLeave: () => setActiveListing(null),
      }
    : null;

  if (isHovered && currentListing && currentListing.images && currentListing.images.length > 1) {
    firstImage = currentListing.images[1];
  }

  const isStockAvailable = currentListing?.currentStock?.attributes?.quantity;
  const bookingEndDate =
    currentListing && currentListing.endDate
      ? new Date(currentListing.endDate).toISOString()
      : null;

  const listingId = currentListing?.id?.uuid;
  const isEndDateAvailable =
    bookingEndDate && listingId
      ? checkAvailabilty?.some(item => {
          if (item.id === listingId) {
            return item?.data?.some(slot => slot.attributes.end === bookingEndDate);
          }
          return false;
        })
      : false;

  // Only for 'sell' listings
  const isSell = (listing?.productType || listing?.attributes?.publicData?.productType) === 'sell';
  // Use deliveryPickupMethodOptions for delivery methods
  const deliveryMethods = isSell ? deliveryPickupMethodOptions.map(option => option.key) : [];
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const handleDeliveryChange = e => {
    setDeliveryMethod(e.target.value);
    if (onDeliveryMethodChange) {
      onDeliveryMethodChange(listing, e.target.value);
    }
  };

  // Auto-select only delivery method if present and not already set
  useEffect(() => {
    if (isSell && onlyOneMethod && deliveryMethod !== onlyOneMethod) {
      setDeliveryMethod(onlyOneMethod);
      if (onDeliveryMethodChange) {
        onDeliveryMethodChange(listing, onlyOneMethod);
      }
    }
  }, [isSell, onlyOneMethod, deliveryMethod, onDeliveryMethodChange, listing]);

  // // Auto-select first shipping rate if available and none selected
  // useEffect(() => {
  //   if (shippingPrice?.rates && Array.isArray(shippingPrice.rates) && shippingPrice.rates.length > 0 && !selectedShippingRate) {
  //     const sortedRates = [...shippingPrice.rates].sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
  //     const firstRate = sortedRates[0];
  //     setSelectedShippingRate(firstRate);
  //     if (onShippingRateChange) {
  //       onShippingRateChange(listing, firstRate);
  //     }
  //   }
  // }, [shippingPrice, selectedShippingRate, onShippingRateChange, listing]);

  // Handle shipping dropdown toggle
  const toggleShippingDropdown = () => {
    setIsShippingDropdownOpen(!isShippingDropdownOpen);
  };

  // Handle shipping rate selection
  const handleShippingRateSelect = (rate) => {
    setSelectedShippingRate(rate);
    setIsShippingDropdownOpen(false);
    
    if (onShippingRateChange) {
      onShippingRateChange(listing, rate);
    }
  };

  // Check if current delivery method requires shipping
  const currentDeliveryMethod = deliveryMethod || onlyOneMethod;
  const requiresShipping = currentDeliveryMethod === 'shipping' || currentDeliveryMethod === 'delivery';

  return (
    <div className={css.root}>
      <div className={css.avatarWrapper}>
        {isSell && (
          <input
            type="checkbox"
            checked={typeof checked !== 'undefined' ? checked : false}
            onChange={e => onSelect && onSelect(e.target.checked)}
          />
        )}
        {!isSell && (
          <input
            type="checkbox"
            checked={typeof checked !== 'undefined' ? checked : false}
            onChange={e =>  onSelectRent(e.target.checked)}
          />
        )}
        <AspectRatioWrapper
          className={css.aspectRatioWrapper}
          width={aspectWidth}
          height={aspectHeight}
          {...setActivePropsMaybe}
          onMouseOver={() => setHovered('hover')}
          onMouseOut={() => setHovered('')}
        >
          <LazyImage
            rootClassName={css.rootForImage}
            alt={title}
            image={firstImage}
            variants={variants}
            sizes={renderSizes}
          />
        </AspectRatioWrapper>

        <div className={css.info}>
          <div className={css.mainInfo}>
            <div className={css.title}>
              {richText(title, {
                longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS,
                longWordClass: css.longWord,
              })}
            </div>
          </div>
          {productType === 'rent' && (
            <div className={isEndDateAvailable ? css.unavailable : css.available}>
              {isEndDateAvailable ? (
                <FormattedMessage id="CartPanel.itemNotAvailable" />
              ) : (
                <FormattedMessage id="CartPanel.itemAvailable" />
              )}
            </div>
          )}

          {productType === 'sell' && (
            <div className={isStockAvailable ? css.available : css.unavailable}>
              {isStockAvailable ? (
                <FormattedMessage id="CartPanel.itemInStock" />
              ) : (
                <FormattedMessage id="CartPanel.itemOutOfStock" />
              )}
            </div>
          )}
        </div>
      </div>
      <div className={css.formattedPrice}>
        <div>
          <p className={css.headingName}>
            <FormattedMessage id="CartPage.priceheading" />
          </p>
          <span className={css.tableValue}>{formattedPrice}</span>
        </div>
      </div>

      {productType == 'rent' ? (
        <div className={css.dateWrapper}>
          <p className={css.headingName}>
            <FormattedMessage id="CartPage.rentalPeriodheading" />
          </p>
          <span className={css.tableValue}>
            {startDate} to {endDate}
          </span>
        </div>
      ) : null}
      
      {productType === 'sell' && (
        <div className={css.dateWrapper}>
          <p className={css.headingName}>
            {' '}
            <FormattedMessage id="CartPage.quantityheading" />
          </p>
          <span className={css.tableValue}>{currentListing?.purchaseQuantity}</span>
        </div>
      )}

 
{Array.isArray(shippingPrice) && shippingPrice.length > 0 ? (
  <div className={css.mainBox}>
    <label>
      {intl.formatMessage({ id: 'LocationOrShippingDetails.deliveryMethodLabel' })}
    </label>
    <div className={css.shippingDropdown}>
      <div className={css.selectLabel} onClick={toggleShippingDropdown}>
        {selectedShippingOption
          ? `${selectedShippingOption.amount} ${selectedShippingOption.currency} - ${
              selectedShippingOption.servicelevel?.name
            } (${selectedShippingOption.duration_terms || 'No duration info'})`
          : 'Select options'}
      </div>
      {isShippingDropdownOpen && (
        <div className={css.selectDropdown}>
          <ul>
            {[...shippingPrice]
              .sort((a, b) => Number(a.amount) - Number(b.amount))
              .map(rate => (
                <li key={rate.object_id} onClick={() => handleShippingDropDown(rate)}>
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
  </div>
) : null}


      <div className={css.autorImgWrapper}>
        <AvatarLarge className={css.autorImg} user={author} />
        <NamedLink
          className={css.authorProfileName}
          name="ProfilePage"
          params={{ id: author?.id?.uuid }}
        >
          <div className={css.authorName}>
            {author?.attributes?.profile?.displayName || 'Seller'}
          </div>
        </NamedLink>
      </div>

      <div className={css.buttonsGroup}>
        <button
          className={css.deleteBtn}
          onClick={e => {
            handleRemoveFromState(id);
            handleWishlist(id, e, null);
          }}
        >
          <BrandIconCard type="delete" />
          {bookmarks && bookmarks.findIndex(e => e == id) > -1 ? (
            <span>
              <FormattedMessage id="CartPage.deleteheading" />
            </span>
          ) : null}
        </button>
        <NamedLink
          className={css.viewBtn}
          name="ListingPage"
          params={{ id, slug }}
          to={{ search: '?redirect=true' }}
        >
          <BrandIconCard type="view" />
          <FormattedMessage id="CartPage.viewheading" />
        </NamedLink>
      </div>
    </div>
  );
};

CartPanelComponent.defaultProps = {
  className: null,
  rootClassName: null,
  renderSizes: null,
  setActiveListing: null,
  showAuthorInfo: true,
  shippingPrice: null, // Add default prop
  onShippingRateChange: null, // Add default callback
};

CartPanelComponent.propTypes = {
  className: string,
  rootClassName: string,
  intl: intlShape.isRequired,
  listing: propTypes.listing.isRequired,
  showAuthorInfo: bool,
  shippingPrice: object, // Add prop type
  onShippingRateChange: func, // Add callback prop type

  // Responsive image sizes hint
  renderSizes: string,

  setActiveListing: func,
};

export default injectIntl(CartPanelComponent);