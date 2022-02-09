import "dotenv/config";
import ws from "ws";
import { switchMap, filter, of, catchError } from "rxjs";
import { fromFetch } from "rxjs/fetch";
import qs from "querystring";

import { cryptoWaitReady } from "@polkadot/util-crypto";
import Keyring from "@polkadot/keyring";
import { assetFromToken, getApiCreator } from "@equilab/api";

import { assert, info, error } from "console";

import {
  ClientAction,
  ServerData,
  PORT,
  SEED_PHRASE,
  CHAIN_NODE,
  API_ENDPOINT,
  AVAILABLE_TOKENS,
  AMOUNT_PRECISION,
  PRICE_PRECISION,
  PREV_BLOCKS_COUNT,
} from "./constants";
import { Message } from "./types";
import {
  decodeMessage,
  isCreateOrderData,
  isCreateMarketOrderData,
  isCancelOrderData,
  isDepositData,
  isChainInfoResponse,
  isExchangesResponse,
  handleTx,
  getId,
  send,
} from "./utils";

// @ts-expect-error
if (!globalThis.fetch) {
  require("isomorphic-fetch");

  // @ts-expect-error
  if (!globalThis.AbortController) {
    // @ts-expect-error
    globalThis.AbortController = require("abort-controller");
  }
}

assert(
  Boolean(process.env.PORT),
  `Env var PORT not found. Using default ${PORT}`,
);
assert(
  Boolean(process.env.SEED_PHRASE),
  `Env var SEED_PHRASE not found. You won't be able to manage orders`,
);
assert(
  Boolean(process.env.CHAIN_NODE),
  `Env var NODE not found. Using default ${CHAIN_NODE}`,
);
assert(
  Boolean(process.env.API_ENDPOINT),
  `Env var API_ENDPOINT not found. Using default ${API_ENDPOINT}`,
);
assert(
  Boolean(process.env.PREV_BLOCKS_COUNT),
  `Env var API_ENDPOINT not found. Using default ${PREV_BLOCKS_COUNT}`,
);

const server = new ws.Server({ port: +PORT });
const api$ = getApiCreator("Gens", "rxjs")(CHAIN_NODE);
let keyring: Keyring | undefined = undefined;
let genesisHash: string | undefined = undefined;
let chainId: number | undefined = undefined;
let latestTradesBlock: number | undefined = undefined;

const blockNumber$ = api$.pipe(
  switchMap((api) => api._api.rpc.chain.subscribeNewHeads()),
);

const genesis$ = api$.pipe(
  switchMap((api) => api.getBlockHash(0)),
  switchMap((hash) =>
    fromFetch(`${API_ENDPOINT}/chains/byHash?hash=${hash.toHex()}`).pipe(
      switchMap((response) => {
        if (response.ok) {
          return response.json();
        } else {
          return of({ error: true, message: `Error ${response.status}` });
        }
      }),
      catchError((err) => {
        error(err);
        return of({ error: true, message: err.message });
      }),
    ),
  ),
);

const genesisSubscription = genesis$.subscribe({
  next: (res) => {
    if (!isChainInfoResponse(res)) return;

    chainId = res.chainId;
    genesisHash = res.genesisHash;
    genesisSubscription.unsubscribe();
  },
});

// TODO: add types to all kind of messages
const ids = new Map<string, any>();

const actionDispatch = async (id: string, client: ws, message: Message) => {
  switch (message.action) {
    case ClientAction.subscribe:
      if (!message.data || typeof message.data !== "string") {
        send(id, client, "Wrong data in subscription request");
        return;
      }
      const token = AVAILABLE_TOKENS.find((el) => el === message.data);
      if (!token) {
        send(id, client, "No token found for subscription");
        return;
      }

      const orders$ = api$.pipe(
        switchMap((api) => api.derive.dex.orders(token)),
      );

      const bestPrices$ = api$.pipe(
        switchMap((api) => api.derive.dex.bestPrice(token)),
      );

      const orderSubscription = orders$.subscribe({
        next: (data) => send(id, client, { type: ServerData.orderBook, data }),
      });

      const bestPricesSubscription = bestPrices$.subscribe({
        next: (data) => send(id, client, { type: ServerData.bestPrices, data }),
      });

      const tradesSubscription = blockNumber$
        .pipe(
          switchMap(({ number }) => {
            const params: Record<string, any> = {
              chainId,
              currency: token,
              page: 0,
              pageSize: 10000,
              bnFrom: number.toNumber() - +PREV_BLOCKS_COUNT,
            };

            const url = `${API_ENDPOINT}/dex/exchanges?${qs.stringify(params)}`;

            return fromFetch(url).pipe(
              switchMap((response) => {
                if (response.ok) {
                  return response.json();
                } else {
                  return of({
                    error: true,
                    message: `Error ${response.status}`,
                  });
                }
              }),
              catchError((err) => {
                error(err);
                return of({ error: true, message: err.message });
              }),
            );
          }),
          switchMap((res) => {
            if (!isExchangesResponse(res)) {
              return of(undefined);
            }

            if (Array.isArray(res) && res.length === 0) {
              return of(undefined);
            }

            const newTrades =
              typeof latestTradesBlock !== "undefined"
                ? res.filter((el) => el.blockNumber > latestTradesBlock!)
                : res;

            if (newTrades.length === 0) {
              return of(undefined);
            }

            latestTradesBlock = newTrades.reduce(
              (acc, el) => Math.max(acc, el.blockNumber),
              newTrades[0].blockNumber,
            );

            return of(newTrades);
          }),
        )
        .subscribe({
          next: (data) => {
            if (!data) return;
            if (Array.isArray(data) && data.length === 0) return;
            if (!isExchangesResponse(data)) return;

            send(id, client, { type: ServerData.trades, data });
          },
        });

      ids.set(id, {
        unsubscribe: () => {
          orderSubscription.unsubscribe();
          bestPricesSubscription.unsubscribe();
          tradesSubscription.unsubscribe();
          send(id, client, "Unsubscribed");
          ids.delete(id);
        },
      });

      send(id, client, `Subscribed to ${token}`);
      break;

    case ClientAction.unsubscribe:
      if (!message.data || typeof message.data !== "string") {
        send(id, client, "Wrong data in unsubscription request");
        return;
      }

      const subscriptionId = message.data;
      if (!ids.has(subscriptionId)) {
        send(id, client, "Subscription message id not found");
        return;
      }

      const sub = ids.get(subscriptionId);
      if ("unsubscribe" in sub && typeof sub["unsubscribe"] === "function") {
        send(id, client, `Unsubscribing subscriptioin ${subscriptionId}`);
        sub.unsubscribe();
      }
      break;

    case ClientAction.createLimitOrder:
      if (!isCreateOrderData(message.data)) {
        send(id, client, "Wrong data format for create order");
        return;
      }
      send(id, client, "Creating order");

      const createOrderAsset = assetFromToken(message.data.token);
      const createOrderlimitPrice = PRICE_PRECISION.times(
        message.data.limitPrice,
      ).toString();
      const createOrderDirection = message.data.direction;
      const createOrderAmount = AMOUNT_PRECISION.times(
        message.data.amount,
      ).toString();
      const pair = keyring?.getPairs()?.[0];

      if (!pair) return;

      const createOrder$ = api$.pipe(
        switchMap((api) =>
          api.tx
            .dexCreateOrder(
              createOrderAsset,
              { Limit: { price: createOrderlimitPrice, expiration_time: 0 } },
              createOrderDirection,
              createOrderAmount,
            )
            .signAndSend(pair, {
              nonce: -1,
            })
            .pipe(
              filter((res) => res.isFinalized || res.isInBlock),
              handleTx(api._api),
            ),
        ),
      );

      const subscription = createOrder$.subscribe({
        next: (res) => {
          if (Array.isArray(res)) {
            const order = res.find((el) => "orderId" in el);
            if (order) {
              send(id, client, order);
            }
          }
          subscription.unsubscribe();
        },
        error: () => {
          send(id, client, "Order creation failed");
          subscription.unsubscribe();
        },
      });
      break;

    case ClientAction.cancelLimitOrder:
      if (!isCancelOrderData(message.data)) {
        send(id, client, "Wrong data format for cancel order");
        return;
      }
      send(id, client, "Cancelling order");

      const cancelOrderAsset = assetFromToken(message.data.token);
      const cancelOrderPrice = PRICE_PRECISION.times(
        message.data.price,
      ).toString();
      const cancelOrderId = message.data.orderId;
      const cancelOrderPair = keyring?.getPairs()?.[0];

      if (!cancelOrderPair) return;

      const deleteOrder$ = api$.pipe(
        switchMap((api) =>
          api._api.tx.eqDex
            .deleteOrderExternal(
              cancelOrderAsset,
              cancelOrderId,
              cancelOrderPrice,
            )
            .signAndSend(cancelOrderPair, {
              nonce: -1,
            })
            .pipe(
              filter((res) => res.isFinalized || res.isInBlock),
              handleTx(api._api),
            ),
        ),
      );

      const deleteOrderSubscription = deleteOrder$.subscribe({
        next: () => {
          send(id, client, "Order successfully cancelled");
          deleteOrderSubscription.unsubscribe();
        },
        error: (err) => {
          send(id, client, `Order cancel failed: ${err.toString()}`);
          deleteOrderSubscription.unsubscribe();
        },
      });
      break;

    case ClientAction.createMarketOrder:
      if (!isCreateMarketOrderData(message.data)) {
        send(id, client, "Wrong data format for create market order");
        return;
      }
      send(id, client, "Creating market order");

      const createMarketOrderAsset = assetFromToken(message.data.token);
      const createMarketOrderDirection = message.data.direction;
      const createMarketOrderAmount = AMOUNT_PRECISION.times(
        message.data.amount,
      ).toString();
      const marketOrderPair = keyring?.getPairs()?.[0];

      if (!marketOrderPair) return;

      const createMarketOrder$ = api$.pipe(
        switchMap((api) =>
          api.tx
            .dexCreateOrder(
              createMarketOrderAsset,
              { Market: {} },
              createMarketOrderDirection,
              createMarketOrderAmount,
            )
            .signAndSend(marketOrderPair, {
              nonce: -1,
            })
            .pipe(
              filter((res) => res.isFinalized || res.isInBlock),
              handleTx(api._api),
            ),
        ),
      );

      const marketOrderSubscription = createMarketOrder$.subscribe({
        next: (res) => {
          if (Array.isArray(res)) {
            const order = res.find((el) => "orderId" in el);
            if (order) {
              send(id, client, order);
            }
          }
          marketOrderSubscription.unsubscribe();
        },
        error: () => {
          send(id, client, "Order creation failed");
          marketOrderSubscription.unsubscribe();
        },
      });
      break;

    case ClientAction.deposit:
      if (!isDepositData(message.data)) {
        send(id, client, "Wrong deposit data");
        return;
      }
      const depositAsset = assetFromToken(message.data.token);
      const depositAmount = PRICE_PRECISION.times(
        message.data.amount,
      ).toString();
      const depositPair = keyring?.getPairs()?.[0];

      if (!depositPair) return;

      const deposit$ = api$.pipe(
        switchMap((api) =>
          api.tx
            .toSubaccount("Borrower", depositAsset, depositAmount)
            .signAndSend(depositPair, { nonce: -1 })
            .pipe(
              filter((res) => res.isFinalized || res.isInBlock),
              handleTx(api._api),
            ),
        ),
      );

      const depositSubscription = deposit$.subscribe({
        next: () => {
          send(id, client, "Deposit successful");
          depositSubscription.unsubscribe();
        },
        error: (err) => {
          send(id, client, `Deposit failed: ${err.toString()}`);
          depositSubscription.unsubscribe();
        },
      });

      break;

    case ClientAction.withdraw:
      if (!isDepositData(message.data)) {
        send(id, client, "Wrong deposit data");
        return;
      }
      const withdrawAsset = assetFromToken(message.data.token);
      const withdrawAmount = PRICE_PRECISION.times(
        message.data.amount,
      ).toString();
      const withdrawPair = keyring?.getPairs()?.[0];

      if (!withdrawPair) return;

      const withdraw$ = api$.pipe(
        switchMap((api) =>
          api.tx
            .fromSubaccount("Borrower", withdrawAsset, withdrawAmount)
            .signAndSend(withdrawPair, { nonce: -1 })
            .pipe(
              filter((res) => res.isFinalized || res.isInBlock),
              handleTx(api._api),
            ),
        ),
      );

      const withdrawSubscription = withdraw$.subscribe({
        next: () => {
          send(id, client, "Withdrawal successful");
          withdrawSubscription.unsubscribe();
        },
        error: (err) => {
          send(id, client, `Withdrawal failed: ${err.toString()}`);
          withdrawSubscription.unsubscribe();
        },
      });

      break;

    case ClientAction.unknown:
      send(id, client, "Wrong message recieved");
      break;

    default:
      send(id, client, "Wrong message recieved");
      break;
  }
};

if (SEED_PHRASE.length === 0 || SEED_PHRASE.split(" ").length !== 12) {
  error("No valid seed phrase found. Shutting service down");
  process.exit();
}

info("Initializing keyring...");
cryptoWaitReady()
  .then(() => {
    keyring = new Keyring();
    keyring.addFromMnemonic(SEED_PHRASE, {}, "sr25519");
    info("Keyring initialized");
  })
  .catch((e) => {
    error("Failed to initialize keyring. Shutting down");
    process.exit();
  });

server.on("connection", (client) => {
  client.send("Market maker service connected");

  client.on("message", (clientMessage) => {
    const message = decodeMessage(clientMessage);

    const id = getId();
    send(id, client, message);

    actionDispatch(id, client, message);
  });
});

info(`Server started on port ${PORT}`);
