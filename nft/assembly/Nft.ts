import { Base58, Protobuf, System, SafeMath, authority } from "@koinos/sdk-as";
import { Constants } from "./Constants";
import { nft } from "./proto/nft";
import { State } from "./State";
import { Tokens } from "./Tokens";

export class Nft {
  name(args: nft.name_arguments): nft.name_result {
    return new nft.name_result(Constants.NAME);
  }

  symbol(args: nft.symbol_arguments): nft.symbol_result {
    return new nft.symbol_result(Constants.SYMBOL);
  }

  balance_of(args: nft.balance_of_arguments): nft.balance_of_result {
    const owner = args.owner as Uint8Array;

    const balanceObj = State.GetBalance(owner);

    const res = new nft.balance_of_result();
    res.value = balanceObj.value;

    return res;
  }

  owner_of(args: nft.owner_of_arguments): nft.owner_of_result {
    const token_id = args.token_id;
    const res = new nft.owner_of_result();

    const token = State.GetToken(token_id);

    if (token) {
      res.value = token.owner;
    }

    return res;
  }

  get_approved(args: nft.get_approved_arguments): nft.get_approved_result {
    const token_id = args.token_id;

    const res = new nft.get_approved_result();

    const approval = State.GetTokenApproval(token_id);

    if (approval) {
      res.value = approval.address;
    }

    return res;
  }

  is_approved_for_all(
    args: nft.is_approved_for_all_arguments
  ): nft.is_approved_for_all_result {
    const owner = args.owner as Uint8Array;
    const operator = args.operator as Uint8Array;

    const res = new nft.is_approved_for_all_result();

    const approval = State.GetOperatorApproval(owner, operator);

    if (approval) {
      res.value = approval.approved;
    }

    return res;
  }

  mint(args: nft.mint_arguments): nft.mint_result {
    const to = args.to as Uint8Array;
    const token_id = args.token_id;

    const res = new nft.mint_result(false);

    if (token_id < 1 || token_id > Constants.MAX) {
      System.log("token id out of bounds");
      return res;
    }

    let token = State.GetToken(token_id);

    // check that the token has not already been minted
    if (token) {
      System.log("token already minted");
      return res;
    }

    // check whitelist
    const whitelist = State.GetWhitelist(to);
    if (whitelist.value > 0) {
      const reserved = State.GetReserved();
      reserved.value = SafeMath.sub(reserved.value, 1);

      whitelist.value = SafeMath.sub(whitelist.value, 1);

      State.SaveReserved(reserved);
      State.SaveWhitelist(to, whitelist);
    } else {
      System.require(
        Tokens.Koin().transfer(to, Constants.ContractId(), Constants.PRICE),
        "Failed to transfer KOIN"
      );
    }

    // assign the new token's owner
    token = new nft.token_object(to);

    // update the owner's balance
    const balance = State.GetBalance(to);
    balance.value = SafeMath.add(balance.value, 1);

    // increment supply
    const supply = State.GetSupply();
    supply.value = SafeMath.add(supply.value, 1);

    State.SaveBalance(to, balance);
    State.SaveToken(token_id, token);
    State.SaveSupply(supply);

    // generate event
    const mintEvent = new nft.mint_event(to, token_id);
    const impacted = [to];

    System.event(
      "nft.mint",
      Protobuf.encode(mintEvent, nft.mint_event.encode),
      impacted
    );

    res.value = true;

    return res;
  }

  transfer(args: nft.transfer_arguments): nft.transfer_result {
    const from = args.from as Uint8Array;
    const to = args.to as Uint8Array;
    const token_id = args.token_id;

    const b58From = Base58.encode(from);

    const res = new nft.transfer_result(false);

    // require authority of the from address
    System.requireAuthority(authority.authorization_type.contract_call, from);

    // check that the token exists
    let token = State.GetToken(token_id);

    if (!token) {
      System.log("nonexistent token");
      return res;
    }

    const owner = token.owner as Uint8Array;
    const b58Owner = Base58.encode(owner);

    if (b58Owner != b58From) {
      let isTokenApproved = false;

      const tokenApproval = State.GetTokenApproval(token_id);

      if (tokenApproval) {
        const approvedAddress = tokenApproval.address as Uint8Array;

        isTokenApproved = Base58.encode(approvedAddress) == b58From;
      }

      if (!isTokenApproved) {
        const operatorApproval = State.GetOperatorApproval(owner, from);

        if (!operatorApproval.approved) {
          System.log("transfer caller is not owner nor approved");
          return res;
        }
      }
    }

    // clear the token approval
    State.DeleteTokenApproval(token_id);

    // update the balances
    // from
    const fromBalance = State.GetBalance(from);
    fromBalance.value = SafeMath.sub(fromBalance.value, 1);
    State.SaveBalance(from, fromBalance);

    // to
    const toBalance = State.GetBalance(to);
    toBalance.value = SafeMath.add(toBalance.value, 1);
    State.SaveBalance(to, toBalance);

    // update token owner
    token.owner = to;
    State.SaveToken(token_id, token);

    // generate event
    const transferEvent = new nft.transfer_event(from, to, token_id);
    const impacted = [to, from];

    System.event(
      "nft.transfer",
      Protobuf.encode(transferEvent, nft.transfer_event.encode),
      impacted
    );

    res.value = true;

    return res;
  }

  approve(args: nft.approve_arguments): nft.approve_result {
    const approver_address = args.approver_address as Uint8Array;
    const to = args.to as Uint8Array;
    const token_id = args.token_id;

    const res = new nft.approve_result(false);

    // require authority of the approver_address
    System.requireAuthority(
      authority.authorization_type.contract_call,
      approver_address
    );

    // check that the token exists
    let token = State.GetToken(token_id);

    if (!token) {
      System.log("nonexistent token");
      return res;
    }

    const owner = token.owner as Uint8Array;
    const b58Owner = Base58.encode(owner);

    // check that the to is not the owner
    if (Base58.encode(to) == b58Owner) {
      System.log("approve to current owner");

      return res;
    }

    // check that the approver_address is allowed to approve the token
    if (Base58.encode(approver_address) != b58Owner) {
      const approval = State.GetOperatorApproval(owner, approver_address);

      if (!approval.approved) {
        System.log("approver_address is not owner nor approved");
        return res;
      }
    }

    // update approval
    let approval = State.GetTokenApproval(token_id);

    if (!approval) {
      approval = new nft.token_approval_object();
    }

    approval.address = to;
    State.SaveTokenApproval(token_id, approval);

    // generate event
    const approvalEvent = new nft.token_approval_event(
      approver_address,
      to,
      token_id
    );
    const impacted = [to, approver_address];

    System.event(
      "nft.token_approval",
      Protobuf.encode(approvalEvent, nft.token_approval_event.encode),
      impacted
    );

    res.value = true;

    return res;
  }

  set_approval_for_all(
    args: nft.set_approval_for_all_arguments
  ): nft.set_approval_for_all_result {
    const approver_address = args.approver_address as Uint8Array;
    const operator_address = args.operator_address as Uint8Array;
    const approved = args.approved;

    const res = new nft.set_approval_for_all_result(false);

    // only the owner of approver_address can approve an operator for his account
    System.requireAuthority(
      authority.authorization_type.contract_call,
      approver_address
    );

    // check that the approver_address is not the address to approve
    if (Base58.encode(approver_address) == Base58.encode(operator_address)) {
      System.log("approve to operator_address");

      return res;
    }

    // update the approval
    const approval = State.GetOperatorApproval(
      approver_address,
      operator_address
    );
    approval.approved = approved;
    State.SaveOperatorApproval(approver_address, operator_address, approval);

    // generate event
    const approvalEvent = new nft.operator_approval_event(
      approver_address,
      operator_address,
      approved
    );
    const impacted = [operator_address, approver_address];

    System.event(
      "nft.operator_approval",
      Protobuf.encode(approvalEvent, nft.operator_approval_event.encode),
      impacted
    );

    res.value = true;

    return res;
  }

  reserve(args: nft.reserve_arguments): nft.reserve_result {
    System.requireAuthority(
      authority.authorization_type.contract_call,
      Constants.ContractId()
    );

    const reserved = State.GetReserved();

    State.SaveReserved(
      new nft.balance_object(args.amount + (reserved.value || 0))
    );

    return new nft.reserve_result(true);
  }

  whitelist(args: nft.whitelist_arguments): nft.whitelist_result {
    System.requireAuthority(
      authority.authorization_type.contract_call,
      Constants.ContractId()
    );

    const whitelist = State.GetWhitelist(args.address!);

    State.SaveWhitelist(
      args.address!,
      new nft.balance_object(args.amount + (whitelist.value || 0))
    );

    return new nft.whitelist_result(true);
  }

  is_whitelisted(
    args: nft.is_whitelisted_arguments
  ): nft.is_whitelisted_result {
    const whitelist = State.GetWhitelist(args.address!);

    if (whitelist) {
      return new nft.is_whitelisted_result(whitelist.value > 0);
    }

    return new nft.is_whitelisted_result(false);
  }
}
