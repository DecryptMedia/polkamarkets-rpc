import * as polkamarketsjs from 'polkamarkets-js';

import { ContractProvider } from '@providers/ContractProvider';
import { Etherscan } from '@services/Etherscan';
import { Event } from '@models/Event';
import { Query } from '@models/Query';
import { EventsWorker } from '../../workers/EventsWorker';

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

  public async getBlockRanges(currentBlockNumber, fromBlockInput = null) {
    if (!this.blockConfig) {
      return [];
    }

    if (!this.polkamarkets) {
      this.initializePolkamarkets(0);
    }

    // iterating by block numbers
    let fromBlock = fromBlockInput || this.blockConfig['fromBlock'];
    const blockRanges = [];

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

    const currentBlockNumber = await this.getCurrentBlockNumber();

    const normalizedFilter = this.normalizeFilter(filter);

    // get query on database
    const query = await this.getQuery({ address, contract, eventName, normalizedFilter });

    // successful etherscan call
    if (etherscanData && !etherscanData.maxLimitReached) {

      // write to database.
      await this.addEventsToQuery({ events: etherscanData.result, query, lastBlockToSave: currentBlockNumber });

      return etherscanData.result;
    }

    // Trigger background job to make to save data
    if (providerIndex === 0) {
      EventsWorker.send(
        {
          contract,
          address,
          eventName,
          filter
        }
      );
    }

    // if limit was reached, let's try to use the saved data and get from etherscan one time
    let events = [];
    if (etherscanData && etherscanData.maxLimitReached && query.lastBlock) {
      // limit reached, use saved query and ask for the rest on etherscan
      events = this.mapDBEvents(query.events);

      try {
        etherscanData = await (new Etherscan().getEvents(polkamarketsContract, address, query.lastBlock + 1, 'latest', eventName, filter));
      } catch (err) {
        // error fetching data from etherscan, taking RPC route
      }

      if (etherscanData && !etherscanData.maxLimitReached) {
        return [...events, ...etherscanData.result];
      }
    }

    // last fallback
    let blockRanges = [];
    events = [];

    if (query.lastBlock) {
      // if query already exists, add those events and iterate rpc blocks after that
      blockRanges = await this.getBlockRanges(currentBlockNumber, query.lastBlock + 1);
      events = this.mapDBEvents(query.events);
    } else {
      // if not, iterate rpc blocks
      blockRanges = await this.getBlockRanges(currentBlockNumber);
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

      const [event, created] = await Event.findOrCreate({
        where: {
          transactionHash: eventData.transactionHash,
          logIndex: eventData.logIndex,
        },
        defaults: {
          address: eventData.address,
          blockHash: eventData.blockHash,
          blockNumber: eventData.blockNumber,
          removed: eventData.removed,
          transactionIndex: eventData.transactionIndex,
          transactionLogIndex: eventData.transactionLogIndex,
          eventId: eventData.eventId,
          returnValues: eventData.returnValues,
          event: eventData.event,
          signature: eventData.signature,
          raw: eventData.raw,
        }
      });


      // if already exists, just update the fields
      if (!created) {
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
    const [query, created] = await Query.findOrCreate({
      where: {
        address: address.toLowerCase(),
        contract,
        eventName,
        filter: normalizedFilter,
      },
      include: [Event]
    });

    return query;
  }

  public mapDBEvents(events: Event[]): any[] {
    return events.map((event) => ({
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
  }

  public async getCurrentBlockNumber(): Promise<number> {

    if (!this.polkamarkets) {
      this.initializePolkamarkets(0);
    }

    return await this.polkamarkets.web3.eth.getBlockNumber();
  }
}
