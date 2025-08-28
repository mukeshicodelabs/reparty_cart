import React from 'react';

import { FormattedMessage } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { createSlug } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';
import Slider from 'react-slick';
import {
  AspectRatioWrapper,
  AvatarMedium,
  H4,
  H6,
  NamedLink,
  ResponsiveImage,
} from '../../components';

import css from './CheckoutPage.module.css';
import moment from 'moment';
import { isProductForRent } from '../../util/data';

/**
 * A card that displays the listing and booking details on the checkout page.
 *
 * @component
 * @param {Object} props
 * @param {propTypes.listing} props.listing - The listing
 * @param {string} props.listingTitle - The listing title
 * @param {propTypes.user} props.author - The author
 * @param {propTypes.image} props.firstImage - The first image
 * @param {Object} props.layoutListingImageConfig - The layout listing image config
 * @param {ReactNode} props.speculateTransactionErrorMessage - The speculate transaction error message
 * @param {boolean} props.showPrice - Whether to show the price
 * @param {string} props.processName - The process name
 * @param {ReactNode} props.breakdown - The breakdown
 * @param {intlShape} props.intl - The intl object
 */

function SampleNextArrow(props) {
  const { className, style, onClick } = props;
  return (
    <div className={className} style={{ ...style, display: 'block' }} onClick={onClick}>
      <svg
        width="60"
        height="60"
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g filter="url(#filter0_b_84_283)">
          <circle cx="30" cy="30" r="29.5" stroke="#CDAC00" />
        </g>
        <path
          d="M33.8475 20.3892L43.4584 30L33.8475 39.6108"
          stroke="#CDAC00"
          strokeWidth="1.5"
          strokeMiterlimit="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16.5416 30H43.1891"
          stroke="#CDAC00"
          strokeWidth="1.5"
          strokeMiterlimit="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <filter
            id="filter0_b_84_283"
            x="-4"
            y="-4"
            width="68"
            height="68"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feGaussianBlur in="BackgroundImageFix" stdDeviation="2" />
            <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_84_283" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect1_backgroundBlur_84_283"
              result="shape"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

function SamplePrevArrow(props) {
  const { className, style, onClick } = props;
  return (
    <div className={className} style={{ ...style, display: 'block' }} onClick={onClick}>
      <svg
        width="60"
        height="60"
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g filter="url(#filter0_b_84_286)">
          <circle cx="30" cy="30" r="29.5" transform="matrix(-1 0 0 1 60 0)" stroke="#CDAC00" />
        </g>
        <path
          d="M26.1526 20.3892L16.5418 30L26.1526 39.6108"
          stroke="#CDAC00"
          strokeWidth="1.5"
          strokeMiterlimit="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M43.4583 30H16.8108"
          stroke="#CDAC00"
          strokeWidth="1.5"
          strokeMiterlimit="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <filter
            id="filter0_b_84_286"
            x="-4"
            y="-4"
            width="68"
            height="68"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feGaussianBlur in="BackgroundImageFix" stdDeviation="2" />
            <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_84_286" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect1_backgroundBlur_84_286"
              result="shape"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

const DetailsSideCard = props => {
  const {
    listing,
    listingTitle,
    priceVariantName,
    author,
    firstImage,
    layoutListingImageConfig,
    speculateTransactionErrorMessage,
    showPrice,
    processName,
    breakdown,
    intl,
    otherOrderData,
  } = props; 
  const isArrayDisable = otherOrderData?.cartItems?.map(item => item.listingId);
  const { price, publicData } = listing?.attributes || {};
  const unitType = publicData.unitType || 'unknown';

  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } =
    layoutListingImageConfig || {};
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter(k => k.startsWith(variantPrefix))
    : [];

  var settings = {
    dots: false,
    arrows:  Array.isArray(isArrayDisable) && isArrayDisable?.length > 1 ? true : false,
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    variableWidth: false,
    className: css.checkoutSlider,
    nextArrow: <SampleNextArrow />,
    prevArrow: <SamplePrevArrow />,
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
          infinite: false,
          dots: false,
        },
      },
      {
        breakpoint: 768,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
        },
      },
      {
        breakpoint: 520,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
        },
      },
    ],
  };

  return (
    <>
      {otherOrderData && otherOrderData.cartItems ? (
        <div className={css.sliderNbreakdownContainer}>
        <Slider {...settings} >
          {otherOrderData?.cartItems.map((e, index) => {
            const itemTitle = e.title;
            const detailsSubTitle = `${formatMoney(intl, e.price)}`;
            const description = e.ItemDescription;
            // const startDate = moment(e.bookingStartDate).format('MM/DD/YYYY');
            // const endDate = moment(e.bookingEndDate).subtract(1, 'days').format('MM/DD/YYYY');
            // const category = e.ItemCategory;
            const isRent = isProductForRent(e.productType);
            const firstImage = e.images?.[0];
            const variants = firstImage
              ? Object.keys(firstImage?.attributes?.variants).filter(k =>
                  k.startsWith('scaled-small')
                )
              : [];
            // const formattedSizes = getSizeLabels(listingConfig, e.ItemSize);
            // const filterOverallFit = findLabel(filteredListingValues, 'overall_Fit', e.ItemOverallFit);
            // const eventTypeLabels = (e.ItemEventType || []).map(type =>
            //   type === 'other' ? e.ItemOtherEvent : findLabel(filteredListingValues, 'event_type', type)
            // );

            return (
              <div key={index} className={css.sliderMain}>
                <div className={css.sliderImg}>

                <AspectRatioWrapper
                  width={aspectWidth}
                  height={aspectHeight}
                  className={css.detailsAspectWrapper}
                  >
                  <ResponsiveImage
                    alt={itemTitle}
                    image={firstImage}
                    variants={variants}
                    rootClassName={css.rootForImage}
                    />
                </AspectRatioWrapper>
                    </div>
                <div className={css.detailsWrapper}>
                  <h2 className={css.detailTitle}>{itemTitle}</h2>
                  {/* <div className={css.detailsSubtitle}>
                    <span>{isRent ? 'Rental Price:' : 'Sale Price:'}</span>{' '}
                    <span>{detailsSubTitle}</span>
                  </div> */}
                  {/* {isRent && (
                    <div className={css.detailsDatetitle}>
                      <span>Rental Period:</span>
                      <span>{`${startDate} to ${endDate}`}</span>
                    </div>
                  )} */}
                  {/* <div className={css.descriptionHeading}>Description</div> */}
                  {/* <div className={css.descriptionDetails}>
                    {showFullDescription ? description : `${description.substring(0, 10)}...`}
                    {description.length > 10 && (
                      <InlineTextButton onClick={toggleDescription} className={css.toggleButton}>
                        {showFullDescription ? 'View Less' : 'View More'}
                      </InlineTextButton>
                    )}
                  </div> */}
                  {/* <div className={css.categoryHeading}>Outfit Details</div>
                  <div className={css.categorydetail}>
                    <span>Category:</span> <span>{category === 'men_outfit' ? "Men's" : "Women's"}</span>
                  </div>
                  <div className={css.categorydetail}>
                    <span>Outfit Type:</span>{' '}
                    <span>
                      {getOutfitType(category === 'men_outfit' ? e.ItemMenOutfit : e.ItemWomenOutfit)}
                    </span>
                  </div>
                  <div className={css.categorydetail}>
                    <span>Size:</span> <span>{formattedSizes}</span>
                  </div>
                  <div className={css.categorydetail}>
                    <span>Event Type:</span> <span>{eventTypeLabels.join(', ')}</span>
                  </div>
                  <div className={css.categorydetail}>
                    <span>Overall Fit:</span> <span>{filterOverallFit}</span>
                  </div> */}
                </div>
              </div>
            );
          })}
        </Slider>
        {breakdown}
        </div>



      ) : (
        <div className={css.detailsContainerDesktop}>
          <AspectRatioWrapper
            width={aspectWidth}
            height={aspectHeight}
            className={css.detailsAspectWrapper}
          >
            <ResponsiveImage
              rootClassName={css.rootForImage}
              alt={listingTitle}
              image={firstImage}
              variants={variants}
            />
          </AspectRatioWrapper>
          <div className={css.listingDetailsWrapper}>
            <div className={css.avatarWrapper}>
              <AvatarMedium user={author} disableProfileLink />
            </div>
            <div className={css.detailsHeadings}>
              <H4 as="h2">
                <NamedLink
                  name="ListingPage"
                  params={{ id: listing?.id?.uuid, slug: createSlug(listingTitle) }}
                >
                  {listingTitle}
                </NamedLink>
              </H4>
              {showPrice ? (
                <div className={css.priceContainer}>
                  <p className={css.price}>{formatMoney(intl, price)}</p>
                  <div className={css.perUnit}>
                    <FormattedMessage
                      id="CheckoutPageWithInquiryProcess.perUnit"
                      values={{ unitType }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            {speculateTransactionErrorMessage}
          </div>

          {!!breakdown ? (
            <div className={css.orderBreakdownHeader}>
              {priceVariantName ? (
                <div className={css.bookingPriceVariant}>
                  <p>{priceVariantName}</p>
                </div>
              ) : null}

              <H6 as="h3" className={css.orderBreakdownTitle}>
                <FormattedMessage id={`CheckoutPage.${processName}.orderBreakdown`} />
              </H6>
              <hr className={css.totalDivider} />
            </div>
          ) : null}
          {breakdown}
        </div>
      )}
    </>
  );
};

export default DetailsSideCard;