import { Contract } from '@types/contract';

export interface CallDTO {
  contract: Contract;
  method: any;
  args: any;
  address: any;
  providerIndex: any;
}
