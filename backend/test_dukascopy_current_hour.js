require('./dist/module-alias-setup');
const { getHistoricalRates } = require('dukascopy-node');

(async () => {
  const from = Date.now() - 3600000 * 2; // 2 hours ago
  const to = Date.now() - 60000;       // 1 minute ago
  console.log(`Querying dukascopy-node directly: from=${new Date(from).toISOString()}, to=${new Date(to).toISOString()}`);
  
  try {
    const rawData = await getHistoricalRates({
      instrument: 'eurusd',
      timeframe: 'm1',
      priceType: 'bid',
      utcOffset: 0,
      volumes: true,
      format: 'json',
      dates: {
        from: from,
        to: to
      }
    });
    console.log('Success! Count:', rawData ? rawData.length : 0);
    if (rawData && rawData.length > 0) {
      console.log('First candle:', rawData[0]);
      console.log('Last candle:', rawData[rawData.length - 1]);
    }
  } catch (err) {
    console.error('Error fetching from Dukascopy directly:', err);
  }
})();
