import BigNumber from "bignumber.js";

export enum ClientAction {
  subscribe = "subscribe",
  unsubscribe = "unsubscribe",
  createLimitOrder = "createLimitOrder",
  cancelLimitOrder = "cancelLimitOrder",
  createMarketOrder = "createMarketOrder",
  deposit = "deposit",
  withdraw = "withdraw",
  unknown = "unknown",
}

export enum ServerData {
  orderBook = "orderBook",
  trades = "trades",
  bestPrices = "bestPrices",
}

export const PORT = process.env.PORT || 9000;
export const SEED_PHRASE = process.env.SEED_PHRASE || "";
export const CHAIN_NODE = process.env.CHAIN_NODE || "wss://devnet.genshiro.io";
export const API_ENDPOINT =
  process.env.API_ENDPOINT || "https://apiv3.equilibrium.io/api";
export const PREV_BLOCKS_COUNT = process.env.PREV_BLOCKS_COUNT || 5;

export const AVAILABLE_TOKENS = ["WBTC", "ETH"];
export const UNKNOWN_MESSAGE = { action: ClientAction.unknown };
export const AMOUNT_PRECISION = new BigNumber(1e18);
export const PRICE_PRECISION = new BigNumber(1e9);
