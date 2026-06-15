import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

export async function fetch() {
  const list = await sdk.board.industry.list();
  const ranked = list
    .map(item => ({
      name: item.name, code: item.code,
      weekChange: item.changePercent || 0,
      monthChange: item.monthChangePercent || 0,
      amount: item.amount || 0
    }))
    .sort((a, b) => Math.abs(b.weekChange) - Math.abs(a.weekChange))
    .slice(0, 10);
  return { industries: ranked, updatedAt: Date.now() };
}
