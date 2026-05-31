var mo = ee.FeatureCollection(
  'projects/land-zg-kvartovi/assets/Mjesni_odbori_Zagreb'
);

Map.centerObject(mo, 11);
Map.addLayer(mo, {}, 'Mjesni odbori');

var years = ee.List.sequence(2015, 2024);

var landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'));

function scaleReflectance(image) {
  var optical = image.select('SR_B.*')
    .multiply(0.0000275)
    .add(-0.2)
    .toFloat();

  return image.addBands(optical, null, true);
}

function maskLandsat(image) {
  var qa = image.select('QA_PIXEL');

  var mask = qa.bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 2).eq(0))
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0))
    .and(qa.bitwiseAnd(1 << 5).eq(0));

  return image.updateMask(mask);
}

function addIndices(image) {
  var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4'])
    .rename('NDVI')
    .toFloat();

  var ndbi = image.normalizedDifference(['SR_B6', 'SR_B5'])
    .rename('NDBI')
    .toFloat();

  return image
    .addBands([ndvi, ndbi])
    .clip(mo);
}

var collection = landsat
  .filterBounds(mo)
  .filter(ee.Filter.calendarRange(2015, 2024, 'year'))
  .filter(ee.Filter.calendarRange(6, 8, 'month'))
  .filter(ee.Filter.lt('CLOUD_COVER', 20))
  .map(scaleReflectance)
  .map(maskLandsat)
  .map(addIndices);

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

  var totalPixelBand = ee.Image.constant(1)
    .rename('total_pixels')
    .toFloat()
    .reproject(yearlyImage.select('NDVI').projection())
    .clip(mo);

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

  return reduced.map(function(feature) {
    return ee.Feature(null, {
      JMS_MB: feature.get('JMS_MB'),
      MO: ee.String(feature.get('JMS_IME')),
      year: year,
      NDVI: ee.Number(feature.get('NDVI_mean')),
      NDBI: ee.Number(feature.get('NDBI_mean')),
      valid_pixels: ee.Number(feature.get('NDVI_count')),
      total_pixels: ee.Number(feature.get('total_pixels_count')),
      image_count: imageCount
    });
  });
});

var stats = ee.FeatureCollection(yearlyStats).flatten();

print('Number of rows:', stats.size());
print('Preview:', stats.limit(10));

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
