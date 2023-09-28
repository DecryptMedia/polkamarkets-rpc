# polkamarkets-rpc

HTTP web3 wrapper for [`polkamarkets-js`](https://github.com/polkamarkets/polkamarkets-js)

## Installation

Setup `WEB3_PROVIDER` env variable (e.g., Infura for Ethereum dapps)

```
yarn install
yarn dev
```

## Usage

[Smart Contract](https://github.com/Polkamarkets/polkamarkets-js/tree/main/contracts/PredictionMarket.sol) Method Queries:

```
// method - method name (example: getMarketData)
// args - method arguments, comma separated (example: 1,2)
// contractAddress - smart contract address (example: 0xDcBe79f74c98368141798eA0b7b979B9bA54b026)

http://localhost:3333/call?contract=predictionMarket&method=${method}&args=${args}&address=${contractAddress}
```

[Smart Contract](https://github.com/Polkamarkets/polkamarkets-js/tree/main/contracts/PredictionMarket.sol) Event Queries:

```
// eventName - event name (example: MarketActionTx)
// filter - event filter json (example: {"marketId":"1"})
// contractAddress - smart contract address (example: 0xDcBe79f74c98368141798eA0b7b979B9bA54b026)

http://localhost:3333/events?contract=predictionMarket&eventName=${eventName}&address=${contractAddress}&filter=${filter}
```

## Contribution

Contributions are welcomed but we ask to red existing code guidelines, specially the code format. Please review [Contributor guidelines][1]

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Notes

The usage of ETH in all methods or params means using the native currency of that blockchain, example BSC in Binance Chain would still be nominated as ETH

[1]: https://github.com/polkamarkets/polkamarkets-js/blob/master/CONTRIBUTING.md
