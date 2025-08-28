import * as importedSdk from 'sharetribe-flex-sdk';

let exportSdk;

const isServer = () => typeof window === 'undefined';

if (isServer()) {
  // Use eval to skip webpack from bundling SDK in Node
  // eslint-disable-next-line no-eval
  exportSdk = eval('require')('sharetribe-flex-sdk');
} else {
  exportSdk = importedSdk;
}

const { createInstance, types, transit, util } = exportSdk;

// create image variant from variant name, desired width and aspectRatio
const createImageVariantConfig = (name, width, aspectRatio) => {
  console.log(name,width,aspectRatio, '&&& &&& => name,width,aspectRatio,');

  let variantWidth = width;
  let variantHeight = Math.round(aspectRatio * width);

  if (variantWidth > 3072 || variantHeight > 3072) {
    if (!isServer) {
      console.error(`Dimensions of custom image variant (${name}) are too high (w:${variantWidth}, h:${variantHeight}).
      Reduce them to max 3072px. https://www.sharetribe.com/api-reference/marketplace.html#custom-image-variants`);
    }

    if (variantHeight > 3072) {
      variantHeight = 3072;
      variantWidth = Math.round(variantHeight / aspectRatio);
    } else if (variantHeight > 3072) {
      variantWidth = 3072;
      variantHeight = Math.round(aspectRatio * variantWidth);
    }
  }

  return {
    [`imageVariant.${name}`]: util.objectQueryString({
      w: variantWidth,
      h: variantHeight,
      fit: 'crop',
    }),
  };
};

// Utility function to get image dimensions
const getImageDimensions = (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.onerror = () => {
      resolve(null); // fallback to default dimensions
    };
    img.src = URL.createObjectURL(file);
  });
};

// New function for creating responsive image variants using Imgix
const createResponsiveImageVariants = (variantPrefix = 'listing-card', actualImageDimensions = null) => {
  let aspectRatio = 1; // default square
  if (actualImageDimensions) {
    const { width, height } = actualImageDimensions;
    aspectRatio = height / width;
  }

  const variants = {};

  if (aspectRatio > 1.2) {
    // Portrait image - use face detection and padding
    variants[`${variantPrefix}`] = util.objectQueryString({
      w: 400,
      ar: '3:4',
      fit: 'crop',
      crop: 'faces,entropy',
      pad: 20, // add padding to avoid tight crop
      auto: 'format,compress,enhance'
    });
    variants[`${variantPrefix}-2x`] = util.objectQueryString({
      w: 800,
      ar: '3:4',
      fit: 'crop',
      crop: 'faces,entropy',
      pad: 40,
      auto: 'format,compress,enhance'
    });
  } else if (aspectRatio < 0.8) {
    // Landscape image - use entropy crop
    variants[`${variantPrefix}`] = util.objectQueryString({
      w: 400,
      ar: '4:3',
      fit: 'crop',
      crop: 'entropy',
      auto: 'format,compress,enhance'
    });
    variants[`${variantPrefix}-2x`] = util.objectQueryString({
      w: 800,
      ar: '4:3',
      fit: 'crop',
      crop: 'entropy',
      auto: 'format,compress,enhance'
    });
  } else {
    // Square-ish image
    variants[`${variantPrefix}`] = util.objectQueryString({
      w: 400,
      ar: '1:1',
      fit: 'crop',
      crop: 'faces,entropy',
      auto: 'format,compress,enhance'
    });
    variants[`${variantPrefix}-2x`] = util.objectQueryString({
      w: 800,
      ar: '1:1',
      fit: 'crop',
      crop: 'faces,entropy',
      auto: 'format,compress,enhance'
    });
  }

  // Thumbnail (always square, use faces if possible)
  variants['thumbnail'] = util.objectQueryString({
    w: 200,
    ar: '1:1',
    fit: 'crop',
    crop: 'faces,entropy',
    auto: 'format,compress,enhance'
  });

  // Hero image (wide, use entropy)
  variants['hero'] = util.objectQueryString({
    w: 1200,
    ar: '2:1',
    fit: 'crop',
    crop: 'entropy',
    auto: 'format,compress,enhance'
  });

  // Detail image (clip, no crop)
  variants['detail'] = util.objectQueryString({
    w: 1200,
    h: 800,
    fit: 'clip',
    auto: 'format,compress,enhance'
  });

  return variants;
};

export { createInstance, types, transit, util, createImageVariantConfig, createResponsiveImageVariants, getImageDimensions };
