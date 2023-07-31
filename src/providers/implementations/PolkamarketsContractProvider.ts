import * as polkamarketsjs from 'polkamarkets-js';

import { ContractProvider } from '@providers/ContractProvider';
import { Etherscan } from '@services/Etherscan';
import { RedisService } from '@services/RedisService';

import { EventsWorker } from '@workers/EventsWorker';

export class PolkamarketsContractProvider implements ContractProvider {
  public polkamarkets: any;

  public web3Providers: Array<string>;

  public useEtherscan: boolean;

  public blockConfig: Object | undefined;

  constructor() {
    // providers are comma separated
    this.web3Providers = process.env.WEB3_PROVIDER.split(',');
    this.useEtherscan = !!(process.env.ETHERSCAN_URL && process.env.ETHERSCAN_API_KEY);
    this.blockConfig = process.env.WEB3_PROVIDER_BLOCK_CONFIG ? JSON.parse(process.env.WEB3_PROVIDER_BLOCK_CONFIG) : null;
  }

  public initializePolkamarkets(web3ProviderIndex: number) {
    // picking up provider and starting polkamarkets
    this.polkamarkets = new polkamarketsjs.Application({
      web3Provider: this.web3Providers[web3ProviderIndex]
    });
    this.polkamarkets.start();
  }

  public getContract(contract: string, address: string, providerIndex: number) {
    this.initializePolkamarkets(providerIndex);

    if (contract === 'predictionMarket') {
      return this.polkamarkets.getPredictionMarketContract({ contractAddress: address });
    } else if (contract === 'predictionMarketV2') {
      return this.polkamarkets.getPredictionMarketV2Contract({ contractAddress: address });
    } else if (contract === 'erc20') {
      return this.polkamarkets.getERC20Contract({ contractAddress: address });
    } else if (contract === 'realitio') {
      return this.polkamarkets.getRealitioERC20Contract({ contractAddress: address });
    } else if (contract === 'achievements') {
      return this.polkamarkets.getAchievementsContract({ contractAddress: address });
    } else if (contract === 'voting') {
      return this.polkamarkets.getVotingContract({ contractAddress: address });
    } else if (contract === 'reward') {
      return this.polkamarkets.getRewardContract({ contractAddress: address });
    } else {
      // this should never happen - should be overruled by the controller
      throw `'Contract ${contract} is not defined`;
    }
  }

  public async getBlockRanges() {
    if (!this.blockConfig) {
      return [];
    }

    if (!this.polkamarkets) {
      this.initializePolkamarkets(0);
    }

    // iterating by block numbers
    let fromBlock = this.blockConfig['fromBlock'];
    const blockRanges = [];
    const currentBlockNumber = await this.polkamarkets.web3.eth.getBlockNumber();

    while (fromBlock < currentBlockNumber) {
      let toBlock = (fromBlock - fromBlock % this.blockConfig['blockCount']) + this.blockConfig['blockCount'];
      toBlock = toBlock > currentBlockNumber ? currentBlockNumber : toBlock;

      blockRanges.push({
        fromBlock,
        toBlock
      });

      fromBlock = toBlock + 1;
    }

    return blockRanges;
  }

  normalizeFilter(filter: Object): string {
    // sorting filter keys
    const keys = Object.keys(filter).sort();

    // normalizing filter
    const normalizedFilter = {};
    keys.forEach(key => {
      // ignoring item if not present
      if (!filter[key]) {
        return;
      }

      if (typeof filter[key] === 'string' && filter[key].startsWith('0x')) {
        // parsing as lowercase string in case it's a hexadecimal
        normalizedFilter[key] = filter[key].toString().toLowerCase();
      } else if (typeof filter[key] === 'string' && !isNaN(parseInt(filter[key]))) {
        // parsing string as integer in case it's a number
        normalizedFilter[key] = parseInt(filter[key]);
      } else {
        // storing string as downcase
        normalizedFilter[key] = filter[key].toString().toLowerCase();
      }
    });

    return JSON.stringify(normalizedFilter);
  }

  public blockRangeCacheKey(contract: string, address: string, eventName: string, filter: Object, blockRange: Object) {
    const blockRangeStr = `${blockRange['fromBlock']}-${blockRange['toBlock']}`;
    return `events:${contract}:${address.toLowerCase()}:${eventName}:${this.normalizeFilter(filter)}:${blockRangeStr}`;
  }

  public async getContractEvents(contract: string, address: string, providerIndex: number, eventName: string, filter: Object) {
    const polkamarketsContract = this.getContract(contract, address, providerIndex);
    this.blockConfig = process.env.WEB3_PROVIDER_BLOCK_CONFIG ? JSON.parse(process.env.WEB3_PROVIDER_BLOCK_CONFIG) : null;
    let etherscanData;

    if (!this.blockConfig) {
      // no block config, querying directly in evm
      const events = await polkamarketsContract.getEvents(eventName, filter);
      return events;
    }

    const readClient = new RedisService().client;

    if (this.useEtherscan) {
      try {
        etherscanData = await (new Etherscan().getEvents(polkamarketsContract, address, this.blockConfig['fromBlock'], 'latest', eventName, filter));
      } catch (err) {
        // error fetching data from etherscan, taking RPC route
      }
    }

    // iterating by block numbers
    let events = [];
    let rpcError;
    const blockRanges = await this.getBlockRanges();

    const keys = blockRanges.map((blockRange) => this.blockRangeCacheKey(contract, address, eventName, filter, blockRange));

    const response = await readClient.mget(...keys).catch(err => {
      console.log(err);
      readClient.end();
      throw(err);
    });

    // closing connection after request is finished
    readClient.end();

    // successful etherscan call
    if (etherscanData && !etherscanData.maxLimitReached) {
      // filling up empty redis slots
      const writeKeys: Array<[key: string, value: string]> = [];

      keys.forEach((key, index) => {
        const result = response[index];
        const fromBlock = parseInt(key.split(':').pop().split('-')[0]);
        const toBlock = parseInt(key.split(':').pop().split('-')[1]);

        if (!result && (toBlock % this.blockConfig['blockCount'] === 0)) {
          // key not stored in redis
          writeKeys.push([
            key,
            JSON.stringify(etherscanData.result.filter(e => e.blockNumber >= fromBlock && e.blockNumber <= toBlock))
          ]);
        }
      });

      if (writeKeys.length > 0) {
        const writeClient = new RedisService().client;

        // writing to redis (using N set calls instead of mset to set a ttl)
        await Promise.all(writeKeys.map(async (item) => {
          await writeClient.set(item[0], item[1], 'EX', 60 * 60 * 24 * 2).catch(err => {
            console.log(err);
            writeClient.end();
            throw(err);
          });
        }));

        writeClient.end();
      }

      return etherscanData.result;
    }

    // filling up empty redis slots (only verifying for first provider)
    if (!process.env.DISABLE_QUEUES && providerIndex === 0 && response.slice(0, -1).filter(r => r === null).length > 1) {
      // some keys are not stored in redis, triggering backfill worker
      EventsWorker.send(
        {
          contract,
          address,
          eventName,
          filter
        }
      );
    }

    await Promise.all(blockRanges.map(async (blockRange, index) => {
      // checking redis if events are cached
      const result = response[index];
      let blockEvents;

      if (result) {
        blockEvents = JSON.parse(result);
      } else {
        try {
          blockEvents = await polkamarketsContract.getContract().getPastEvents(eventName, {
            filter,
            ...blockRange
          });
        } catch (err) {
          // non-blocking, error will be thrown after all calls are performed
          rpcError = err;
          return;
        }

        // not writing to cache if block range is not complete
        if (blockRange.toBlock % this.blockConfig['blockCount'] === 0) {
          const writeClient = new RedisService().client;
          writeClient.nodeRedis.on("error", err => {
            // redis connection error, ignoring and letting the get/set functions error handlers act
            console.log("ERR :: Redis Connection: " + err);
            writeClient.end();
          });

          const key = this.blockRangeCacheKey(contract, address, eventName, filter, blockRange);
          await writeClient.set(key, JSON.stringify(blockEvents), 'EX', 60 * 60 * 24 * 2).catch(err => {
            console.log(err);
            writeClient.end();
            throw(err);
          });
          writeClient.end();
        }
      }

      events = blockEvents.concat(events);
    }));

    // if there's a RPC error, error is thrown after all calls are performed
    if (rpcError) throw(rpcError);

    return events.sort((a, b) => a.blockNumber - b.blockNumber);
  }
}
