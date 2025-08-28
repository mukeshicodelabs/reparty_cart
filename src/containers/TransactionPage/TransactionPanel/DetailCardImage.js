import React from 'react';
import classNames from 'classnames';

import { AvatarMedium, AspectRatioWrapper, ResponsiveImage } from '../../../components';

import css from './TransactionPanel.module.css';
import Slider from 'react-slick';

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

const DetailCardImage = props => {
  const {
    className,
    rootClassName,
    avatarWrapperClassName,
    listingTitle,
    image,
    provider,
    isCustomer,
    listingImageConfig,
    protectedData
  } = props; 
  const  cartItems  = protectedData?.cartItems || [];
  const needToShowSlider = Array.isArray(cartItems) && cartItems?.length > 1 && protectedData?.isRental;
  const classes = classNames(rootClassName || css.detailCardImageWrapper, className);
  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } = listingImageConfig;
  const variants = image
    ? Object.keys(image?.attributes?.variants).filter(k => k.startsWith(variantPrefix))
    : []; 
     var settings = {
        dots: false, 
        infinite: false,
        arrows: true,
        speed: 500,
        slidesToShow: 1,
        slidesToScroll: 1,
        nextArrow: <SampleNextArrow />,
        prevArrow: <SamplePrevArrow />,
      };

  return (
    <React.Fragment>
      {needToShowSlider ? (
        <Slider {...settings} className={css.sliderWrapper}>
            {cartItems.map((item, index) => (
          <div className={css.cartImage}>
              <img src={item?.imgURL} key={index} alt={item?.title} />
          </div>
            ))}
        </Slider>
      ) : (
        <AspectRatioWrapper width={aspectWidth} height={aspectHeight} className={classes}>
          <ResponsiveImage
            rootClassName={css.rootForImage}
            alt={listingTitle}
            image={image}
            variants={variants}
          />
        </AspectRatioWrapper>
      )} 
      {isCustomer ? (
        <div className={avatarWrapperClassName || css.avatarWrapper}>
          <AvatarMedium user={provider} />
        </div>
      ) : null}
    </React.Fragment>
  );
};

export default DetailCardImage;
