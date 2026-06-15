// Market sentiment data module for Stock Vision
// Fetches limit-up (ZT) and limit-down (DT) pool counts via StockSDK

import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

export async function fetch() {
  const [ztPool, dtPool] = await Promise.all([
    sdk.getZTPool('zt'),
    sdk.getZTPool('dt')
  ]);

  return {
    ztCount: ztPool.length,
    dtCount: dtPool.length,
    totalVolume: 0,
    updatedAt: Date.now()
  };
}
