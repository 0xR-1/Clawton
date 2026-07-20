// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {NewtonPolicyWallet} from "../src/NewtonPolicyWallet.sol";
import {INewtonPolicy} from "newton-contracts/src/interfaces/INewtonPolicy.sol";

contract SetPolicyScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address walletAddress = vm.envAddress("WALLET_ADDRESS");
        uint32 expireAfter = uint32(vm.envUint("EXPIRE_AFTER"));

        string memory paramsJson = vm.readFile("policy_params.json");
        bytes memory policyParams = bytes(paramsJson);

        vm.startBroadcast(deployerPrivateKey);

        NewtonPolicyWallet wallet = NewtonPolicyWallet(payable(walletAddress));

        bytes32 newPolicyId = wallet.setPolicy(
            INewtonPolicy.PolicyConfig({
                policyParams: policyParams,
                expireAfter: expireAfter
            })
        );

        console.log("Policy set with ID:");
        console.logBytes32(newPolicyId);

        vm.stopBroadcast();
    }
}
