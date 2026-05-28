var mo = ee.FeatureCollection(
  'projects/land-zg-kvartovi/assets/Mjesni_odbori_Zagreb'
);

Map.centerObject(mo, 10);
Map.addLayer(mo, {}, 'Mjesni odbori Zagreb');

var years = ee.List.sequence(2015, 2024);

var landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'));

function maskLandsat(image) {
  var qa = image.select('QA_PIXEL');

  var mask = qa.bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 2).eq(0))
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0))
    .and(qa.bitwiseAnd(1 << 5).eq(0));

  return image.updateMask(mask);
}

function scaleLST(image) {
  var lst = image.select('ST_B10')
    .multiply(0.00341802)
    .add(149.0)
    .subtract(273.15)
    .rename('LST')
    .toFloat();

  return image.addBands(lst);
}

var yearlyStats = years.map(function(year) {
  year = ee.Number(year);

  var collection = landsat
    .filterBounds(mo)
    .filterDate(
      ee.Date.fromYMD(year, 6, 1),
      ee.Date.fromYMD(year, 9, 1)
    )
    .filter(ee.Filter.lt('CLOUD_COVER', 30))
    .map(maskLandsat)
    .map(scaleLST);

  var imageCount = collection.size();

  var summerLST = collection
    .select('LST')
    .median()
    .clip(mo)
    .toFloat();

  var totalPixelBand = ee.Image.constant(1)
    .rename('total_pixels')
    .toFloat()
    .reproject(summerLST.projection())
    .clip(mo);

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

  return zonal.map(function(feature) {
    return ee.Feature(null, {
      JMS_MB: feature.get('JMS_MB'),
      MO: feature.get('JMS_IME'),
      year: year,
      LST: ee.Number(feature.get('LST_mean')),
      valid_pixels: ee.Number(feature.get('LST_count')),
      total_pixels: ee.Number(feature.get('total_pixels_count')),
      image_count: imageCount
    });
  });
});

var results = ee.FeatureCollection(yearlyStats).flatten();

print('Number of rows:', results.size());
print('Preview:', results.limit(5));

var summerLST2024 = landsat
  .filterBounds(mo)
  .filterDate('2024-06-01', '2024-09-01')
  .filter(ee.Filter.lt('CLOUD_COVER', 30))
  .map(maskLandsat)
  .map(scaleLST)
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

Export.table.toDrive({
  collection: results,
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
