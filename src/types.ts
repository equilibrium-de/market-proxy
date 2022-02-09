import { ClientAction } from "./constants";
import type { RegistryError } from "@polkadot/types/types";

export interface Message {
  action: ClientAction;
  data?: unknown;
}

export interface CreateOrderData {
  token: string;
  limitPrice: number;
  direction: "Buy" | "Sell";
  amount: number;
}

export interface CancelOrderData {
  token: string;
  orderId: number;
  price: number;
}

export interface CreateMarketOrderData {
  token: string;
  direction: "Buy" | "Sell";
  amount: number;
}

export interface DepositData {
  token: string;
  amount: number;
}

export interface ChainInfoResponse {
  chainId: number;
  genesisHash: string;
}

export interface ExchangesResponseItem {
  id: number;
  chainId: number;
  currency: string;
  price: number;
  amount: number;
  makerAccountId: string;
  takerAccountId: string;
  makerSide: string;
  blockNumber: number;
  takerFee: number;
  makerFee: number;
}

export class TxError extends Error {
  public registryErrors: RegistryError[];

  constructor(message: string, errors: RegistryError[]) {
    super(message);
    this.registryErrors = errors;
  }
}
