require('./dist/module-alias-setup');
const { getHistoricalRates } = require('dukascopy-node');

(async () => {
  const from = new Date('2026-06-12T10:00:00Z').getTime();
  const to = new Date('2026-06-12T11:00:00Z').getTime();
  console.log(`Querying 10:00 to 11:00 UTC: from=${from}, to=${to}`);
  
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
    console.error('Error:', err);
  }
})();
