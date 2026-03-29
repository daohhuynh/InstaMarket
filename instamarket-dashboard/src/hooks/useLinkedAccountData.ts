import type { LinkedAccountState } from "../types";

const EMPTY_ACCOUNT: LinkedAccountState = {
  walletAddress: null,
  connected: false,
  portfolio: {
    totalValue: 0,
    dailyPnl: 0,
    betCount: 0,
    yesBets: 0,
    noBets: 0,
    marketCount: 0,
    recentBets: [],
  },
  savedMarkets: [],
};

export function useLinkedAccountData() {
  return EMPTY_ACCOUNT;
}