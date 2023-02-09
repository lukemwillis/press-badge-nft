import { Protobuf, System, SafeMath, authority, Arrays } from "@koinos/sdk-as";
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

  uri(args: nft.uri_arguments): nft.uri_result {
    return new nft.uri_result(Constants.URI);
  }
  
  total_supply(args: nft.total_supply_arguments): nft.total_supply_result {
    const supply = State.GetSupply();
    return new nft.total_supply_result(supply.value);
  }

  total_reserved(
    args: nft.total_reserved_arguments
  ): nft.total_reserved_result {
    const reserved = State.GetReserved();
    return new nft.total_reserved_result(reserved.value);
  }

  royalties(args: nft.royalties_arguments): nft.royalties_result {
    const res = new Array<nft.royalty_object>(1);
    res[0] =new nft.royalty_object(Constants.ROYALTIES, Constants.ContractId());
    return new nft.royalties_result(res);
  }

  set_royalties(args: nft.set_royalties_arguments): nft.set_royalties_result {
    // not supported
    return new nft.set_royalties_result(false);
  }

  owner(args: nft.owner_arguments): nft.owner_result {
    return new nft.owner_result(Constants.ContractId());
  }


  transfer_ownership(args: nft.transfer_ownership_arguments): nft.transfer_ownership_result {
    // not supported
    return new nft.transfer_ownership_result(false);
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

  is_approved_for_all(args: nft.is_approved_for_all_arguments): nft.is_approved_for_all_result {
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

    System.require(
      token_id > 0 && token_id <= Constants.MAX,
      "Token id out of bounds"
    );

    let token = State.GetToken(token_id);

    System.require(token == null, "Token already minted");

    // check whitelist
    const whitelist = State.GetWhitelist(to);
    const reserved = State.GetReserved();

    if (whitelist.value > 0) {
      reserved.value = SafeMath.sub(reserved.value, 1);
      whitelist.value = SafeMath.sub(whitelist.value, 1);

      State.SaveReserved(reserved);
      State.SaveWhitelist(to, whitelist);
    } else {
      const supply = State.GetSupply();

      System.require(
        reserved.value + supply.value < Constants.MAX,
        "Token is reserved for whitelist"
      );

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

    const res = new nft.transfer_result(false);

    // require authority of the from address
    System.requireAuthority(authority.authorization_type.contract_call, from);

    // check that the token exists
    let token = State.GetToken(token_id);

    if (!token) {
      System.log("nonexistent token");
      return res;
    }

    if (!Arrays.equal(from, token.owner)) {
      let isTokenApproved = false;

      const tokenApproval = State.GetTokenApproval(token_id);

      if (tokenApproval) {
        const approvedAddress = tokenApproval.address as Uint8Array;

        isTokenApproved = !!Arrays.equal(approvedAddress, from);
      }

      if (!isTokenApproved) {
        const operatorApproval = State.GetOperatorApproval(token.owner!, from);

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

    // check that the to is not the owner
    if(Arrays.equal(token.owner, to)) {
      System.log("approve to current owner");
      return res;
    }

    // check that the approver_address is allowed to approve the token
    if(!Arrays.equal(token.owner, approver_address)) {
      let approval = State.GetOperatorApproval(token.owner!, approver_address);
      if (!approval || !approval.approved) {
        System.log("approver_address is not owner nor approved");
        return res;
      }
    }

    // update approval
    let approval = State.GetTokenApproval(token_id);
    if (!approval) {
      approval = new nft.token_approval_object(to);
    }
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

  set_approval_for_all(args: nft.set_approval_for_all_arguments): nft.set_approval_for_all_result {
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
    if(Arrays.equal(approver_address, operator_address)) {
      System.log("approve to operator_address");
      return res;
    }

    // update the approval
    let approval = State.GetOperatorApproval(approver_address, operator_address);
    if(!approval) {
      approval = new nft.operator_approval_object();
    }
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
