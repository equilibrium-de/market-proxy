# Equilibrium decentralized exchange proxy server

Node js service for equilibrium decentralized exchange

## Installation

### Install packages

```
$ yarn
```

### Create env file

```
$ echo SEED_PHRASE=\"lock idea vague ordinary pool stuff summer whale fame laptop assist lock\" > .env
$ cat .env
SEED_PHRASE="lock idea vague ordinary pool stuff summer whale fame laptop assist lock"
```

Possible env variables
| Variable | Description|
|----------|------------|
| SEED_PHRASE | Mandatory variable. 12 words seed phrase to generate keyring for tx subscription. |
| PORT | Service port. Default value is `9000`|
| CHAIN_NODE | Chain node used by service. Default value is `wss://devnet.genshiro.io` |
| API_ENDPOINT | Rest api for chain history data. Default value is `https://apiv3.equilibrium.io/api` |
| PREV_BLOCKS_COUNT | Previous blocks count is used in history api request. Encrease this if api handles new blocks too slow. Default value is `5` |

### Start service

In dev mode using ts-node

```
$ yarn dev
```

Or build and start node

```
$ yarn build
$ yarn start
```

## Websocket messages

### Subscribe to token info updates

Send subscribe message with token as `data`

```
{
    "action": "subscribe",
    "data": "WBTC"
}
```

Service will immediately return message with internal id. You can use this id to identify your subscription

```
{
    "id":"16444115124872",
    "message":{"action":"subscribe","data":"WBTC"}}
```

After successfull subscription service will send you message

```
{
  "id":"16444115124872",
  "message":"Subscribed to WBTC"
}
```

While subscription is active service will send best bid and ask when they updates

```
{
  "id":"16444115124872",
  "message":{"type":"bestPrices","data":{"ask":"35010.0","bid":"34970.0"}}}
```

Subscription sends order book updates

```
{
	"id": "16444115124872",
	"message": {
		"type": "orderBook",
		"data": [
			{
				"id": 5,
				"account": "cZfaH42YKgSQrZzDzZDdMDRXUryww5Ey7MiGco6W7kxjb48cp",
				"side": "buy",
				"price": "34970.0",
				"amount": "1.0",
				"createdAt": "1643370702",
				"expirationTime": "0"
			},
			{
				"id": 26,
				"account": "cZexYhjJa3nh9wWiEVSczvVhneHWXcLBnm3SRP6gY6QGSdNRA",
				"side": "sell",
				"price": "35010.0",
				"amount": "6.470000000000000000",
				"createdAt": "1644240018",
				"expirationTime": "0"
			},
      ...
			{
				"id": 33,
				"account": "cZexYhjJa3nh9wWiEVSczvVhneHWXcLBnm3SRP6gY6QGSdNRA",
				"side": "sell",
				"price": "35051.0",
				"amount": "1.0",
				"createdAt": "1644409386",
				"expirationTime": "0"
			},
			{
				"id": 27,
				"account": "cZhTPXeT5o3DVgEnRQ95Vi8BNiyPsDoFDovXZLCeWmDKB89WW",
				"side": "sell",
				"price": "35060.0",
				"amount": "1.0",
				"createdAt": "1644314064",
				"expirationTime": "0"
			}
		]
	}
}

```

Subscription sends trades updates from history api. Checks every block and sends new trades.

```
{
	"id": "16444115124872",
	"message": {
		"type": "trades",
		"data": [
			{
				"id": 285,
				"chainId": 1008,
				"eventCounter": 47,
				"currency": "WBTC",
				"price": 35010,
				"amount": 1.3,
				"takerRest": 0,
				"makerAccountId": "cZexYhjJa3nh9wWiEVSczvVhneHWXcLBnm3SRP6gY6QGSdNRA",
				"takerAccountId": "cZhTPXeT5o3DVgEnRQ95Vi8BNiyPsDoFDovXZLCeWmDKB89WW",
				"makerSide": "Sell",
				"makerOrderId": 26,
				"blockNumber": 203509,
				"exchangeDate": "2022-02-09T13:05:48",
				"takerFee": 45.513,
				"makerFee": 22.7565
			}
		]
	}
}
```

### Unsubscribe from token info updates

Send unsubscribe message with subscription id

```
{
    "action": "unsubscribe",
    "data": "16444115124872"
}
```

```
{
	"id": "16444122947064",
	"message": "Unsubscribing subscription 16444115124872"
}
```

Service will sent successfull notification

```
{
	"id": "16444115124872",
	"message": "Unsubscribed"
}

```

### Deposit to trading account

Deposit funds to trading account using message

```
{
	"action": "deposit",
	"data": { "token": "WBTC", "amount": 1 }
}
```

```
{
	"id": "16444124076415",
	"message": { "action": "deposit", "data": { "token": "WBTC", "amount": 1 } }
}
```

```
{ "id": "16444124076415", "message": "Deposit successful" }
```

### Withdraw from trading account

```
{
	"action": "withdraw",
	"data": { "token": "WBTC", "amount": 5 }
}
```

```
{
	"id": "16444128634396",
	"message": { "action": "withdraw", "data": { "token": "WBTC", "amount": 5 } }
}
```

```
{ "id": "16444128634396", "message": "Withdrawal successful" }
```

### Create limit order

Send message to create limit order

```
{
    "action": "createLimitOrder",
    "data": { "token": "WBTC", "direction": "Sell", "amount": 1, "limitPrice": 35051}
}
```

Server confirms message and responds with id

```
{
	"id": "164441945620210",
	"message": {
		"action": "createLimitOrder",
		"data": {
			"token": "WBTC",
			"direction": "Sell",
			"amount": 1,
			"limitPrice": 35051
		}
	}
}
```

Server responds when order creation process starts

```
{ "id": "164441945620210", "message": "Creating order" }
```

When order is successfully created and is in block server sends

```
{ "id": "164441945620210", "message": { "orderId": "34" } }
```

### Cancel limit order

Client sends message to cancel limit order by id

```
{
	"action": "cancelLimitOrder",
	"data": { "token": "WBTC", "orderId": 34, "price": 35051 }
}
```

Server confirms that message is recieved

```
{
	"id": "164441979841211",
	"message": {
		"action": "cancelLimitOrder",
		"data": { "token": "WBTC", "orderId": 34, "price": 35051 }
	}
}
```

When cancelling order is initiated server sends

```
{ "id": "164441979841211", "message": "Cancelling order" }
```

After successfull order cancellation server sends

```
{ "id": "164441979841211", "message": "Order successfully cancelled" }
```

### Create market order

```
{
    "action": "createMarketOrder",
    "data": { "token": "WBTC", "direction": "Buy", "amount": 1}
}
```

Server responds when order creation process starts

```
{
	"id": "16444129899627",
	"message": {
		"action": "createMarketOrder",
		"data": { "token": "WBTC", "direction": "Buy", "amount": 1 }
	}
}
```

```
{ "id": "164441945620210", "message": { "orderId": "34" } }
```
