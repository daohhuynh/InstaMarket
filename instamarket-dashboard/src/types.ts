export type DashboardTopicId = "ai" | "macro" | "elections" | "crypto";
export type DashboardViewId = "dashboard" | "portfolio" | "saved";

export type MarketCardVariant =
  | "sparkline"
  | "arc"
  | "leaderboard"
  | "heat"
  | "binary";

export interface ChartPoint {
  time: string;
  label: string;
  probability: number;
  volume: number;
}

export interface MarketCandidate {
  label: string;
  value: number;
  accent?: string;
  avatar?: string;
}

export interface MarketRecord {
  id: string;
  title: string;
  shortLabel: string;
  category: string;
  probability: number;
  change24h: number;
  volume: string;
  liquidity: string;
  confidence: number;
  momentumLabel: string;
  sourceBias: string;
  tags: string[];
  icon: string;
  chartVariant: MarketCardVariant;
  chartPoints: ChartPoint[];
  narrative: string;
  candidates?: MarketCandidate[];
}

export interface SourceMetric {
  source: string;
  winRate: number;
  edgeCaptured: number;
  bets: number;
  confidence: number;
  conversion: number;
  trendPoints: number[];
  thesis: string;
  accent: string;
}

export interface ActivityEvent {
  id: string;
  type: "bet" | "save" | "signal" | "swing";
  label: string;
  timestamp: string;
  direction: "up" | "down" | "neutral";
  amount: string;
  source: string;
}

export interface PortfolioPosition {
  id: string;
  marketId: string;
  side: "YES" | "NO";
  entryProbability: number;
  sizeUsd: number;
  conviction: "High" | "Medium" | "Low";
  openedAt: string;
  thesis: string;
}

export interface SavedMarketEntry {
  id: string;
  marketId: string;
  savedProbability: number;
  savedAt: string;
  source: string;
  note: string;
}

export interface LinkedPortfolioBet {
  marketId: string;
  question: string;
  side: "YES" | "NO";
  amount: number;
  placedAt: string;
  yesOdds?: number;
  noOdds?: number;
  currentYesOdds?: number;
  currentNoOdds?: number;
}

export interface LinkedSavedMarket {
  marketId: string;
  question: string;
  savedAt: string;
  savedYesOdds: number;
  savedNoOdds: number;
  currentYesOdds?: number;
  currentNoOdds?: number;
  savedVolume?: string;
  currentVolume?: string;
}

export interface LinkedAccountState {
  walletAddress: string | null;
  connected: boolean;
  portfolio: {
    totalValue: number;
    dailyPnl: number;
    betCount: number;
    yesBets: number;
    noBets: number;
    marketCount: number;
    recentBets: LinkedPortfolioBet[];
  };
  savedMarkets: LinkedSavedMarket[];
}

export interface DashboardTopic {
  id: DashboardTopicId;
  label: string;
  subtitle: string;
  sidebarLabel: string;
  topCategory: string;
  heroMarketId: string;
  marketIds: string[];
  heroHeadline: string;
  sourceCopy: string;
}

export interface DashboardData {
  topics: DashboardTopic[];
  topNavCategories: string[];
  breakingTicker: string[];
  markets: Record<string, MarketRecord>;
  sourceMetrics: Record<DashboardTopicId, SourceMetric[]>;
  activityByTopic: Record<DashboardTopicId, ActivityEvent[]>;
  portfolioPositions: PortfolioPosition[];
  savedMarkets: SavedMarketEntry[];
}
