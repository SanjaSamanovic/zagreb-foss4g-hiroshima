//------------------------------------
// LST DATA COLLECTION IN GOOGLE EARTH ENGINE
// Study area: Local committees of Zagreb
// Period: Summer seasons, 2015–2024
//------------------------------------


//------------------------------------
// 1. INPUT DATA
//------------------------------------

// Boundary layer of Zagreb local committees stored as a GEE asset.
// The layer must contain the attributes JMS_MB and JMS_IME.
var mo = ee.FeatureCollection(
  'projects/land-zg-kvartovi/assets/Mjesni_odbori_Zagreb'
);

Map.centerObject(mo, 10);
Map.addLayer(mo, {}, 'Zagreb local committees');

print('First local committee feature:', mo.first());
print('Property names:', mo.first().propertyNames());


//------------------------------------
// 2. YEARS
//------------------------------------

var years = ee.List.sequence(2015, 2024);


//------------------------------------
// 3. LANDSAT 8 AND LANDSAT 9 COLLECTIONS
//------------------------------------

var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2');

var landsat = l8.merge(l9);


//------------------------------------
// 4. CLOUD, SHADOW, CIRRUS, AND SNOW MASK
//------------------------------------

function maskLandsat(image) {
  var qa = image.select('QA_PIXEL');

  var mask = qa.bitwiseAnd(1 << 1).eq(0)   // dilated cloud
    .and(qa.bitwiseAnd(1 << 2).eq(0))      // cirrus
    .and(qa.bitwiseAnd(1 << 3).eq(0))      // cloud
    .and(qa.bitwiseAnd(1 << 4).eq(0))      // cloud shadow
    .and(qa.bitwiseAnd(1 << 5).eq(0));     // snow

  return image.updateMask(mask);
}


//------------------------------------
// 5. LST SCALING TO DEGREES CELSIUS
//------------------------------------

function scaleLST(image) {
  var lst = image.select('ST_B10')
    .multiply(0.00341802)
    .add(149.0)
    .subtract(273.15)
    .rename('LST')
    .toFloat();

  return image.addBands(lst);
}


//------------------------------------
// 6. YEARLY SUMMER LST STATISTICS
//------------------------------------

var yearlyStats = years.map(function(year) {
  year = ee.Number(year);

  var start = ee.Date.fromYMD(year, 6, 1);
  var end = ee.Date.fromYMD(year, 9, 1);
  // Summer period: 1 June to 31 August.
  // The end date is 1 September because filterDate uses an exclusive end date.

  var collection = landsat
    .filterBounds(mo)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUD_COVER', 30))
    .map(maskLandsat)
    .map(scaleLST);

  var imageCount = collection.size();

  var summerLST = collection
    .select('LST')
    .median()
    .clip(mo)
    .toFloat();

  // Reference pixel count calculated on the same grid as LST.
  // This band is not cloud-masked and represents the total number of reference pixels.
  var totalPixelBand = ee.Image.constant(1)
    .rename('total_pixels')
    .toFloat()
    .reproject(summerLST.projection())
    .clip(mo);

  // Image used for zonal statistics:
  // 1) LST band: cloud-masked, used for mean LST and valid pixel count.
  // 2) total_pixels band: unmasked, used for total pixel count.
  var statsImage = summerLST.addBands(totalPixelBand);

  var reducer = ee.Reducer.mean()
    .combine({
      reducer2: ee.Reducer.count(),
      sharedInputs: true
    });

  var zonal = statsImage.reduceRegions({
    collection: mo,
    reducer: reducer,
    scale: 30,
    tileScale: 4
  });

  zonal = zonal.map(function(feature) {
    return ee.Feature(null, {
      'JMS_MB': feature.get('JMS_MB'),
      'MO': feature.get('JMS_IME'),
      'year': year,
      'LST': ee.Number(feature.get('LST_mean')),
      'valid_pixels': ee.Number(feature.get('LST_count')),
      'total_pixels': ee.Number(feature.get('total_pixels_count')),
      'image_count': imageCount
    });
  });

  return zonal;
});


//------------------------------------
// 7. FLATTEN RESULTS
//------------------------------------

var results_export = ee.FeatureCollection(yearlyStats).flatten();


//------------------------------------
// 8. PREVIEW
//------------------------------------

print('Number of output rows:', results_export.size());
print('First 5 rows:', results_export.limit(5));


//------------------------------------
// 9. OPTIONAL MAP DISPLAY FOR 2024
//------------------------------------

var collection2024 = landsat
  .filterBounds(mo)
  .filterDate('2024-06-01', '2024-09-01')
  .filter(ee.Filter.lt('CLOUD_COVER', 30))
  .map(maskLandsat)
  .map(scaleLST);

print('2024 image count:', collection2024.size());

var summerLST2024 = collection2024
  .select('LST')
  .median()
  .clip(mo);

Map.addLayer(
  summerLST2024,
  {
    min: 20,
    max: 45,
    palette: ['blue', 'green', 'yellow', 'orange', 'red']
  },
  'Summer LST 2024'
);


//------------------------------------
// 10. EXPORT CSV TO GOOGLE DRIVE
//------------------------------------

Export.table.toDrive({
  collection: results_export,
  description: 'Zagreb_MO_LST_2015_2024',
  fileNamePrefix: 'Zagreb_MO_LST_2015_2024',
  fileFormat: 'CSV',
  selectors: [
    'JMS_MB',
    'MO',
    'year',
    'LST',
    'valid_pixels',
    'total_pixels',
    'image_count'
  ]
});
