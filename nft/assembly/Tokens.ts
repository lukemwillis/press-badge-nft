import { Token } from "@koinos/sdk-as";
import { Constants } from "./Constants";

export namespace Tokens {
  let koin: Token | null = null;

  export function Koin(): Token {
    if (koin == null) {
      koin = new Token(Constants.KoinContractId());
    }
    return koin!;
  }
}
