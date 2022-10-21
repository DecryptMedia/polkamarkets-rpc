import { Job, JobsOptions } from 'bullmq';

import { BaseWorker } from './BaseWorker';

import { PolkamarketsContractProvider } from '@providers/implementations/PolkamarketsContractProvider';

import { Etherscan } from '@services/Etherscan';

export interface EventsWorkerInput {
  contract: string,
  address: string,
  eventName: string,
  filter: Object
  blockRange?: Object,
  startBlock?: number,
}
export class EventsWorker extends BaseWorker {
  static QUEUE_NAME = 'events';
  static concurrency = 5;

  static async run(job: Job<EventsWorkerInput>): Promise<any> {
    const polkamarketsContractProvider = new PolkamarketsContractProvider();

    const { contract, address, eventName, filter, blockRange, startBlock } = job.data;
    const providerIndex = 0;
    const useEtherscan = !!(process.env.ETHERSCAN_URL && process.env.ETHERSCAN_API_KEY);
    const blockConfig = process.env.WEB3_PROVIDER_BLOCK_CONFIG ? JSON.parse(process.env.WEB3_PROVIDER_BLOCK_CONFIG) : null;
    const polkamarketsContract = polkamarketsContractProvider.getContract(contract, address, providerIndex);
    let data;

    // if blockRange is not provided, the whole set will try to be fetched
    const fromBlock = blockRange && blockRange['fromBlock'] || startBlock || (blockConfig && blockConfig['fromBlock']) || 0
    const toBlock = blockRange ? blockRange['toBlock'] : 'latest';
    // return;
    if (useEtherscan) {
      try {
        data = await (
          new Etherscan().getEvents(
            polkamarketsContract,
            address,
            fromBlock,
            toBlock,
            eventName,
            filter
          )
        );
      } catch (err) {
        // error fetching data from etherscan, taking RPC route
        console.log('etherscan error!')
        console.log(err);
      }
    }

    const currentBlockNumber = await polkamarketsContractProvider.getCurrentBlockNumber();
    const normalizedFilter = polkamarketsContractProvider.normalizeFilter(filter);

    if (!blockRange) {
      if (!data) {
        const blockRanges = await polkamarketsContractProvider.getBlockRanges(currentBlockNumber);
        // triggering worker with all block ranges, one at a time
        if (blockRanges.length > 0) {
          EventsWorker.send(
            {
              contract,
              address,
              eventName,
              filter,
              blockRange: blockRanges[0],
            }
          );
        }

        return;
      } else {
        // save the data
        const query = await polkamarketsContractProvider.getQuery({ address, contract, eventName, normalizedFilter });

        const lastBlock = data.result[data.result.length - 1].blockNumber;
        const lastBlockToSave = data.maxLimitReached ? lastBlock : currentBlockNumber;
        await polkamarketsContractProvider.addEventsToQuery({ events: data.result, query, lastBlockToSave });

        if (data.maxLimitReached) {
          // if max limit is reached, the data will be re-fetched starting from the last block range
          const startBlock = lastBlock + 1;
          // const startBlock = (lastBlock - lastBlock % blockConfig['blockCount']);

          // triggering worker with next block range
          EventsWorker.send(
            {
              contract,
              address,
              eventName,
              filter,
              startBlock
            },
            {
              priority: 1
            }
          );
        }

        return;
      }
    } else {
      let result;
      // if there's no data or limit reached get from contract
      if (!data || data.maxLimitReached) {
        result = await polkamarketsContract.getContract().getPastEvents(eventName, {
          filter,
          ...blockRange
        });
      } else {
        result = data.result;
      }

      // save data
      const query = await polkamarketsContractProvider.getQuery({ address, contract, eventName, normalizedFilter });
      await polkamarketsContractProvider.addEventsToQuery({ events: result, query, lastBlockToSave: toBlock });

      // trigger next block
      const blockRanges = await polkamarketsContractProvider.getBlockRanges(currentBlockNumber, toBlock + 1);
      // triggering worker with all block ranges, one at a time
      if (blockRanges.length > 0) {
        EventsWorker.send(
          {
            contract,
            address,
            eventName,
            filter,
            blockRange: blockRanges[0],
          }
        );
      }

      return;
    }
  }
}
