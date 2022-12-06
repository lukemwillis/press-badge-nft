import { chain, Protobuf, System } from "@koinos/sdk-as";
import { Constants } from "./Constants";
import { nft } from "./proto/nft";

export namespace State {
  const TOKEN_SPACE_ID = 0;
  const BALANCE_SPACE_ID = 1;
  const OPERATOR_APPROVAL_SPACE_ID = 2;
  const TOKEN_APPROVAL_SPACE_ID = 3;

  let tokenSpace: chain.object_space | null = null;
  let balanceSpace: chain.object_space | null = null;
  let operatorApprovalSpace: chain.object_space | null = null;
  let tokenApprovalSpace: chain.object_space | null = null;

  function TokenSpace(): chain.object_space {
    if (tokenSpace == null) {
      tokenSpace = new chain.object_space(
        false,
        Constants.ContractId(),
        TOKEN_SPACE_ID
      );
    }
    return tokenSpace!;
  }

  export function GetToken(tokenId: u64): nft.token_object | null {
    const token = System.getObject<string, nft.token_object>(
      TokenSpace(),
      tokenId.toString(),
      nft.token_object.decode
    );

    return token;
  }

  export function SaveToken(tokenId: u64, token: nft.token_object): void {
    System.putObject(
      TokenSpace(),
      tokenId.toString(),
      token,
      nft.token_object.encode
    );
  }

  function BalanceSpace(): chain.object_space {
    if (balanceSpace == null) {
      balanceSpace = new chain.object_space(
        false,
        Constants.ContractId(),
        BALANCE_SPACE_ID
      );
    }
    return balanceSpace!;
  }

  export function GetBalance(owner: Uint8Array): nft.balance_object {
    const balance = System.getObject<Uint8Array, nft.balance_object>(
      BalanceSpace(),
      owner,
      nft.balance_object.decode
    );

    if (balance) {
      return balance;
    }

    return new nft.balance_object();
  }

  export function SaveBalance(
    owner: Uint8Array,
    balance: nft.balance_object
  ): void {
    System.putObject(BalanceSpace(), owner, balance, nft.balance_object.encode);
  }

  function OperatorApprovalSpace(): chain.object_space {
    if (operatorApprovalSpace == null) {
      operatorApprovalSpace = new chain.object_space(
        false,
        Constants.ContractId(),
        OPERATOR_APPROVAL_SPACE_ID
      );
    }
    return operatorApprovalSpace!;
  }

  export function GetOperatorApproval(
    approver: Uint8Array,
    operator: Uint8Array
  ): nft.operator_approval_object {
    const approvalKey = new nft.operator_approval_key(approver, operator);
    const keyBytes = Protobuf.encode(
      approvalKey,
      nft.operator_approval_key.encode
    );

    const approval = System.getObject<Uint8Array, nft.operator_approval_object>(
      OperatorApprovalSpace(),
      keyBytes,
      nft.operator_approval_object.decode
    );

    if (approval) {
      return approval;
    }

    return new nft.operator_approval_object();
  }

  export function SaveOperatorApproval(
    approver: Uint8Array,
    operator: Uint8Array,
    approval: nft.operator_approval_object
  ): void {
    const approvalKey = new nft.operator_approval_key(approver, operator);
    const keyBytes = Protobuf.encode(
      approvalKey,
      nft.operator_approval_key.encode
    );

    System.putObject(
      OperatorApprovalSpace(),
      keyBytes,
      approval,
      nft.operator_approval_object.encode
    );
  }

  function TokenApprovalSpace(): chain.object_space {
    if (tokenApprovalSpace == null) {
      tokenApprovalSpace = new chain.object_space(
        false,
        Constants.ContractId(),
        TOKEN_APPROVAL_SPACE_ID
      );
    }
    return tokenApprovalSpace!;
  }

  export function GetTokenApproval(
    tokenId: u64
  ): nft.token_approval_object | null {
    const approval = System.getObject<string, nft.token_approval_object>(
      TokenApprovalSpace(),
      tokenId.toString(),
      nft.token_approval_object.decode
    );

    return approval;
  }

  export function SaveTokenApproval(
    tokenId: u64,
    approval: nft.token_approval_object
  ): void {
    System.putObject(
      TokenApprovalSpace(),
      tokenId.toString(),
      approval,
      nft.token_approval_object.encode
    );
  }

  export function DeleteTokenApproval(tokenId: u64): void {
    System.removeObject(TokenApprovalSpace(), tokenId.toString());
  }
}
