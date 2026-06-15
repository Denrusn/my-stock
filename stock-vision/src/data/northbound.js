// Northbound capital flow data module for Stock Vision
// Fetches northbound (foreign investor) market money flow data via StockSDK
//
// Uses two SDK services:
//   northboundService.getNorthboundFlowSummary() — per-board daily northbound net buy
//   fundFlowService.getMarketFundFlow()           — A-share daily fund flow history

import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

export async function fetch() {
  const [summary, marketFlow] = await Promise.all([
    sdk.northboundService.getNorthboundFlowSummary(),
    sdk.fundFlowService.getMarketFundFlow()
  ]);

  // Northbound boards: 001 = 沪股通 (Shanghai-HK), 003 = 深股通 (Shenzhen-HK)
  const northboundBoards = summary.filter(s => s.type === '001' || s.type === '003');
  const todayNet = northboundBoards.reduce((sum, s) => sum + (s.netBuyAmount || 0), 0);

  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const recentFlows = marketFlow.filter(d => new Date(d.date) >= oneMonthAgo);
  const weekFlows = recentFlows.filter(d => new Date(d.date) >= oneWeekAgo);
  const weekNet = weekFlows.reduce((sum, d) => sum + (d.mainNetInflow || 0), 0);
  const monthNet = recentFlows.reduce((sum, d) => sum + (d.mainNetInflow || 0), 0);

  const dailyHistory = marketFlow.slice(-20).map(d => ({
    date: d.date,
    net: d.mainNetInflow || 0,
    shClose: d.shClose,
    shChangePercent: d.shChangePercent
  }));

  return { todayNet, weekNet, monthNet, history: dailyHistory, updatedAt: Date.now() };
}
