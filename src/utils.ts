import ws from "ws";
import { map } from "rxjs";
import type { ApiRx } from "@polkadot/api";
import type { IEvent, ISubmittableResult } from "@polkadot/types/types";
import type { DispatchInfo, DispatchError } from "@polkadot/types/interfaces";
import {
  Message,
  CreateOrderData,
  CancelOrderData,
  TxError,
  DepositData,
  ChainInfoResponse,
  ExchangesResponseItem,
  CreateMarketOrderData,
} from "./types";
import { ClientAction, UNKNOWN_MESSAGE } from "./constants";

let nonce = 0;

export const getId = () => {
  nonce = nonce + 1;
  return Date.now().toString() + nonce.toString();
};

export const send = (id: string, client: ws, message: unknown) =>
  client.send(JSON.stringify({ id, message }));

const isMessage = (raw: unknown): raw is Message =>
  "action" in (raw as Message) &&
  Object.values(ClientAction).some((v) => v === (raw as Message).action);

export const decodeMessage = (raw: ws.RawData): Message => {
  try {
    const parsed = JSON.parse(raw.toString());

    if (isMessage(parsed)) {
      return parsed;
    }

    return UNKNOWN_MESSAGE;
  } catch (e) {
    return UNKNOWN_MESSAGE;
  }
};

export const isCreateOrderData = (raw: unknown): raw is CreateOrderData =>
  typeof (raw as CreateOrderData).token === "string" &&
  typeof (raw as CreateOrderData).direction === "string" &&
  ["Buy", "Sell"].some((el) => el === (raw as CreateOrderData).direction) &&
  typeof (raw as CreateOrderData).limitPrice === "number" &&
  typeof (raw as CreateOrderData).amount === "number";

export const isCancelOrderData = (raw: unknown): raw is CancelOrderData =>
  typeof (raw as CancelOrderData).token === "string" &&
  typeof (raw as CancelOrderData).price === "number" &&
  typeof (raw as CancelOrderData).orderId === "number";

export const isCreateMarketOrderData = (
  raw: unknown,
): raw is CreateMarketOrderData =>
  typeof (raw as CreateMarketOrderData).token === "string" &&
  typeof (raw as CreateMarketOrderData).direction === "string" &&
  ["Buy", "Sell"].some(
    (el) => el === (raw as CreateMarketOrderData).direction,
  ) &&
  typeof (raw as CreateMarketOrderData).amount === "number";

export const isDepositData = (raw: unknown): raw is DepositData =>
  typeof (raw as CancelOrderData).token === "string" &&
  typeof (raw as CreateOrderData).amount === "number";

export const isChainInfoResponse = (raw: unknown): raw is ChainInfoResponse =>
  typeof (raw as ChainInfoResponse).chainId === "number" &&
  typeof (raw as ChainInfoResponse).genesisHash === "string";

export const isExchangesResponseItem = (
  raw: unknown,
): raw is ExchangesResponseItem =>
  typeof (raw as ExchangesResponseItem).id === "number" &&
  typeof (raw as ExchangesResponseItem).chainId === "number" &&
  typeof (raw as ExchangesResponseItem).price === "number" &&
  typeof (raw as ExchangesResponseItem).amount === "number" &&
  typeof (raw as ExchangesResponseItem).blockNumber === "number" &&
  typeof (raw as ExchangesResponseItem).takerFee === "number" &&
  typeof (raw as ExchangesResponseItem).makerFee === "number" &&
  typeof (raw as ExchangesResponseItem).currency === "string" &&
  typeof (raw as ExchangesResponseItem).makerAccountId === "string" &&
  typeof (raw as ExchangesResponseItem).takerAccountId === "string" &&
  typeof (raw as ExchangesResponseItem).makerSide === "string";

export const isExchangesResponse = (
  raw: unknown,
): raw is ExchangesResponseItem[] =>
  Array.isArray(raw) && raw.every(isExchangesResponseItem);

export const handleTx = (api: ApiRx) =>
  map((res: ISubmittableResult) => {
    if (res.status.isInBlock || res.status.isFinalized) {
      const { success, error } = res.events.reduce<{
        success: (IEvent<[DispatchInfo]> | { orderId: string })[];
        error: IEvent<[DispatchError, DispatchInfo]>[];
      }>(
        (prev, event) => {
          if (api.events.system.ExtrinsicFailed.is(event.event)) {
            return { ...prev, error: [...prev.error, event.event] };
          } else if (api.events.system.ExtrinsicSuccess.is(event.event)) {
            return { ...prev, success: [...prev.success, event.event] };
          } else if (api.events.eqDex.OrderCreated.is(event.event)) {
            const orderId = event.event.data[1].toString();
            return { ...prev, success: [...prev.success, { orderId }] };
          }

          return prev;
        },
        { success: [], error: [] },
      );

      if (success.length) {
        return success;
      } else if (error.length) {
        const decoded = error.map((e) =>
          api.registry.findMetaError(e.data[0].asModule),
        );

        const message = decoded
          .map(
            ({ section, method, docs }) =>
              `${section}.${method}: ${docs.join(" ")}`,
          )
          .join(", ");

        const err = new TxError(message, decoded);
        throw err;
      }
    }
  });
