import type { MarketState } from "../contracts/sharedSchemas.js";
import { validateMarketState } from "../contracts/sharedSchemas.js";

export interface MarketStateProvider {
  getMarketState(marketId: string): Promise<MarketState>;
}

export class StaticMarketStateProvider implements MarketStateProvider {
  constructor(private readonly marketState: MarketState) {}

  async getMarketState(_marketId: string): Promise<MarketState> {
    return this.marketState;
  }
}

export class HttpMarketStateProvider implements MarketStateProvider {
  constructor(private readonly endpointBase: string) {}

  async getMarketState(marketId: string): Promise<MarketState> {
    const url = `${this.endpointBase.replace(/\/$/, "")}/${encodeURIComponent(marketId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Market state fetch failed (${response.status}) for market ${marketId}`);
    }

    const payload = (await response.json()) as unknown;
    validateMarketState(payload);
    return payload;
  }
}
