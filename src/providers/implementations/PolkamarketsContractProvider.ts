import * as polkamarketsjs from 'polkamarkets-js';

import { ContractProvider } from '@providers/ContractProvider';
import { Etherscan } from '@services/Etherscan';
import { Event } from '@models/Event';
import { Query } from '@models/Query';

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
    } else if (contract === 'erc20') {
      return this.polkamarkets.getERC20Contract({ contractAddress: address });
    } else if (contract === 'realitio') {
      return this.polkamarkets.getRealitioERC20Contract({ contractAddress: address });
    } else if (contract === 'achievements') {
      return this.polkamarkets.getAchievementsContract({ contractAddress: address });
    } else if (contract === 'voting') {
      return this.polkamarkets.getVotingContract({ contractAddress: address });
    } else {
      // this should never happen - should be overruled by the controller
      throw `'Contract ${contract} is not defined`;
    }
  }

  public async getBlockRanges(fromBlockInput = null) {
    if (!this.blockConfig) {
      return [];
    }

    if (!this.polkamarkets) {
      this.initializePolkamarkets(0);
    }

    // iterating by block numbers
    let fromBlock = fromBlockInput || this.blockConfig['fromBlock'];
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
    let etherscanData;

    if (!this.blockConfig) {
      // no block config, querying directly in evm
      const events = await polkamarketsContract.getEvents(eventName, filter);
      return events;
    }

    if (this.useEtherscan) {
      try {
        etherscanData = await (new Etherscan().getEvents(polkamarketsContract, address, this.blockConfig['fromBlock'], 'latest', eventName, filter));
      } catch (err) {
        // error fetching data from etherscan, taking RPC route
      }
    }

    const normalizedFilter = this.normalizeFilter(filter);

    // successful etherscan call
    if (etherscanData && !etherscanData.maxLimitReached) {

      // write to database.
      const query = await this.getQuery({address, contract, eventName, normalizedFilter});
      await this.addEventsToQuery({ events: etherscanData.result, query, lastBlockToSave: await this.polkamarkets.web3.eth.getBlockNumber()});

      return etherscanData.result;
    }

    // // filling up empty redis slots (only verifying for first provider)
    // if (providerIndex === 0 && response.slice(0, -1).filter(r => r === null).length > 1) {
    //   // some keys are not stored in redis, triggering backfill worker
    //   EventsWorker.send(
    //     {
    //       contract,
    //       address,
    //       eventName,
    //       filter
    //     }
    //   );
    // }


    let events = [];

    // check if query exists on database
    const query = await this.getQuery({address, contract, eventName, normalizedFilter});

    let blockRanges = [];

    if (query.events?.length > 0 && query.lastBlock) {
      // if query already exists, add those events and iterate rpc blocks after that
      blockRanges = await this.getBlockRanges(query.lastBlock + 1);
      events = query.events.map((event) => ({
        address: event.address,
        blockHash: event.blockHash,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
        removed: event.removed,
        transactionHash: event.transactionHash,
        transactionIndex: event.transactionIndex,
        transactionLogIndex: event.transactionLogIndex,
        eventId: event.eventId,
        returnValues: event.returnValues,
        event: event.event,
        signature: event.signature,
        raw: event.raw,
      }));
    } else {
      // if not, iterate rpc blocks
      blockRanges = await this.getBlockRanges();
    }

    // save the ones that were not on the database
    let allBlocksComplete = true;

    for (const blockRange of blockRanges) {
      let blockEvents;

      try {
        blockEvents = await polkamarketsContract.getContract().getPastEvents(eventName, {
          filter,
          ...blockRange
        });
      } catch (err) {
        throw (err);
      }

      // not writing to database if block range is not complete or previous block range not complete
      if (blockRange.toBlock % this.blockConfig['blockCount'] === 0 && allBlocksComplete) {
        await this.addEventsToQuery({events: blockEvents, query, lastBlockToSave: blockRange.toBlock});
      } else {
        allBlocksComplete = false;
      }

      events = events.concat(blockEvents);
    }

    return events;
  }


  public async addEventsToQuery({ events, query, lastBlockToSave }: { events: any, query: Query, lastBlockToSave: number}) {
    const eventsToAdd: Event[] = [];
    for (const eventData of events) {
      if (eventData.blockNumber <= query.lastBlock) {
        // no need to check
        continue;
      }

      let event = await Event.findOne({
        where: {
          transactionHash: eventData.transactionHash,
          logIndex: eventData.logIndex,
        }
      });

      if (!event) {
        // create
        event = new Event;
        event.address = eventData.address;
        event.blockHash = eventData.blockHash;
        event.blockNumber = eventData.blockNumber;
        event.logIndex = eventData.logIndex;
        event.removed = eventData.removed;
        event.transactionHash = eventData.transactionHash;
        event.transactionIndex = eventData.transactionIndex;
        event.transactionLogIndex = eventData.transactionLogIndex;
        event.eventId = eventData.eventId;
        event.returnValues = eventData.returnValues;
        event.event = eventData.event;
        event.signature = eventData.signature;
        event.raw = eventData.raw;

        await event.save();
      }

      eventsToAdd.push(event);
    }

    await query.$add('events', eventsToAdd);

    query.lastBlock = lastBlockToSave;
    await query.save();
  }

  public async getQuery({address, contract, eventName, normalizedFilter}: {address: string, contract: string, eventName: string, normalizedFilter: string} ): Promise<Query> {
    let query = await Query.findOne({
      where: {
        address: address.toLowerCase(),
        contract,
        eventName,
        filter: normalizedFilter,
      },
      include: [Event]
    });

    if (!query) {
      query = new Query;
      query.address = address.toLowerCase();
      query.contract = contract;
      query.eventName = eventName;
      query.filter = normalizedFilter;
      await query.save();
    }

    return query;
  }
}
