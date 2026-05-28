// ==========================
// NDVI AND NDBI DATA COLLECTION IN GOOGLE EARTH ENGINE
// Study area: Local committees of Zagreb
// Period: Summer seasons, 2015–2024
// ==========================


// ==========================
// 1. INPUT DATA
// ==========================

// Boundary layer of Zagreb local committees stored as a GEE asset.
// The layer must contain the attributes JMS_MB and JMS_IME.
var mo = ee.FeatureCollection(
  'projects/land-zg-kvartovi/assets/Mjesni_odbori_Zagreb'
);

Map.centerObject(mo, 11);
Map.addLayer(mo, {}, 'Zagreb local committees');

print('First local committee feature:', mo.first());
print('Property names:', mo.first().propertyNames());


// ==========================
// 2. SCALE LANDSAT COLLECTION 2 LEVEL-2 SURFACE REFLECTANCE
// ==========================

function scaleReflectance(image) {
  var optical = image.select('SR_B.*')
    .multiply(0.0000275)
    .add(-0.2)
    .toFloat();

  return image.addBands(optical, null, true);
}


// ==========================
// 3. CLOUD, SHADOW, CIRRUS, AND SNOW MASK
// ==========================

function maskLandsat(image) {
  var qa = image.select('QA_PIXEL');

  var mask = qa.bitwiseAnd(1 << 1).eq(0)   // dilated cloud
    .and(qa.bitwiseAnd(1 << 2).eq(0))      // cirrus
    .and(qa.bitwiseAnd(1 << 3).eq(0))      // cloud
    .and(qa.bitwiseAnd(1 << 4).eq(0))      // cloud shadow
    .and(qa.bitwiseAnd(1 << 5).eq(0));     // snow

  return image.updateMask(mask);
}


// ==========================
// 4. NDVI AND NDBI CALCULATION
// ==========================

function addIndices(image) {
  // NDVI = (NIR - Red) / (NIR + Red)
  // Landsat 8/9: SR_B5 = NIR, SR_B4 = Red
  var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4'])
    .rename('NDVI')
    .toFloat();

  // NDBI = (SWIR1 - NIR) / (SWIR1 + NIR)
  // Landsat 8/9: SR_B6 = SWIR1, SR_B5 = NIR
  var ndbi = image.normalizedDifference(['SR_B6', 'SR_B5'])
    .rename('NDBI')
    .toFloat();

  return image
    .addBands([ndvi, ndbi])
    .clip(mo);
}


// ==========================
// 5. LANDSAT 8 AND LANDSAT 9 COLLECTIONS
// ==========================

var landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'));

var collection = landsat
  .filterBounds(mo)
  .filter(ee.Filter.calendarRange(2015, 2024, 'year'))
  .filter(ee.Filter.calendarRange(6, 8, 'month')) // June to August
  .filter(ee.Filter.lt('CLOUD_COVER', 20))
  .map(scaleReflectance)
  .map(maskLandsat)
  .map(addIndices);


// ==========================
// 6. YEARS
// ==========================

var years = ee.List.sequence(2015, 2024);


// ==========================
// 7. YEARLY SUMMER NDVI/NDBI STATISTICS
// ==========================

var yearlyStats = years.map(function(year) {
  year = ee.Number(year);

  var yearlyCollection = collection
    .filter(ee.Filter.calendarRange(year, year, 'year'));

  var imageCount = yearlyCollection.size();

  var yearlyImage = yearlyCollection
    .median()
    .select(['NDVI', 'NDBI'])
    .toFloat()
    .clip(mo);

  // Reference pixel count calculated on the same grid as NDVI/NDBI.
  // This band is not cloud-masked and represents the total number of reference pixels.
  var totalPixelBand = ee.Image.constant(1)
    .rename('total_pixels')
    .toFloat()
    .reproject(yearlyImage.select('NDVI').projection())
    .clip(mo);

  // Image used for zonal statistics:
  // 1) NDVI and NDBI bands: cloud-masked, used for mean values and valid pixel count.
  // 2) total_pixels band: unmasked, used for total pixel count.
  var statsImage = yearlyImage.addBands(totalPixelBand);

  var reducer = ee.Reducer.mean()
    .combine({
      reducer2: ee.Reducer.count(),
      sharedInputs: true
    });

  var reduced = statsImage.reduceRegions({
    collection: mo,
    reducer: reducer,
    scale: 30,
    tileScale: 4
  });

  reduced = reduced.map(function(feature) {
    return ee.Feature(null, {
      'JMS_MB': feature.get('JMS_MB'),
      'MO': ee.String(feature.get('JMS_IME')),
      'year': year,
      'NDVI': ee.Number(feature.get('NDVI_mean')),
      'NDBI': ee.Number(feature.get('NDBI_mean')),
      'valid_pixels': ee.Number(feature.get('NDVI_count')),
      'total_pixels': ee.Number(feature.get('total_pixels_count')),
      'image_count': imageCount
    });
  });

  return reduced;
});


// ==========================
// 8. FLATTEN RESULTS
// ==========================

var stats = ee.FeatureCollection(yearlyStats).flatten();


// ==========================
// 9. PREVIEW
// ==========================

print('NDVI/NDBI yearly table preview:', stats.limit(10));
print('Number of rows:', stats.size());


// ==========================
// 10. EXPORT CSV TO GOOGLE DRIVE
// ==========================

Export.table.toDrive({
  collection: stats,
  description: 'NDVI_NDBI_MO_2015_2024',
  fileNamePrefix: 'NDVI_NDBI_MO_2015_2024',
  fileFormat: 'CSV',
  selectors: [
    'JMS_MB',
    'MO',
    'year',
    'NDVI',
    'NDBI',
    'valid_pixels',
    'total_pixels',
    'image_count'
  ]
});
