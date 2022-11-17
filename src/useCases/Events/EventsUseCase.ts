import { ContractProvider } from '@providers/ContractProvider';
import { EventsDTO } from './EventsDTO';

export class EventsUseCase {
  constructor(public contractProvider: ContractProvider) {}

  async execute({ contract, eventName, filter, address, providerIndex, page, perPage }: EventsDTO) {
    const events = await this.contractProvider.getContractEvents(contract, address, providerIndex, eventName, filter, page, perPage);

    return events;
  }
}
