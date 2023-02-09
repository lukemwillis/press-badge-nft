import { System } from "@koinos/sdk-as";

export namespace Constants {
  export const NAME: string = "Koin Press Badge";
  export const SYMBOL: string = "KPB";
  export const PRICE: u64 = 50000000000;
  export const MAX: u64 = 50;
  export const URI: string = "ipfs://bafybeiaiynisgaa3eqf3bxuseh4yh4nzjz4g3nvocoh3zlz7eypjx3p5wm";
  export const ROYALTIES: u64 = 0;

  let contractId: Uint8Array | null = null;
  let koinContractId: Uint8Array | null = null;

  export function ContractId(): Uint8Array {
    if (contractId == null) {
      contractId = System.getContractId();
    }
    return contractId!;
  }

  export function KoinContractId(): Uint8Array {
    if (koinContractId == null) {
      koinContractId = System.getContractAddress('koin');
    }
    return koinContractId!;
  }
}
