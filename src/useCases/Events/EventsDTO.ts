import { Contract } from '@types/contract';

export interface EventsDTO {
  contract: Contract;
  eventName: string;
  filter: {
    [key: string]: string;
  };
  address: string;
  providerIndex: any;
  page?: number,
  perPage?: number
}
