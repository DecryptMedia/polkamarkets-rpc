export interface ContractProvider {
  getContract: (contract: string, address: string, providerIndex: number) => any;
  getContractEvents: (
    contract: string,
    address: string,
    providerIndex: number,
    eventName: string,
    filter: Object,
    page?: number,
    perPage?: number,
  ) => any;
  web3Providers: string[];
}
