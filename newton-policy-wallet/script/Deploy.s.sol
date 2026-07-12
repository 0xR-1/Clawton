// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {NewtonPolicyWallet} from "../src/NewtonPolicyWallet.sol";
import {INewtonPolicy} from "newton-contracts/src/interfaces/INewtonPolicy.sol";

contract DeployScript is Script {
    address constant NEWTON_TASK_MANAGER = 0xecb741F4875770f9A5F060cb30F6c9eb5966eD13;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address policy = vm.envAddress("POLICY");
        uint32 expireAfter = uint32(vm.envUint("EXPIRE_AFTER"));
        address owner = vm.addr(deployerPrivateKey);

        string memory paramsJson = vm.readFile("policy_params.json");
        bytes memory policyParams = bytes(paramsJson);

        vm.startBroadcast(deployerPrivateKey);

        NewtonPolicyWallet wallet = new NewtonPolicyWallet();
        wallet.initialize(NEWTON_TASK_MANAGER, owner);
        wallet.setPolicyAddress(policy);

        bytes32 policyId = wallet.setPolicy(
            INewtonPolicy.PolicyConfig({
                policyParams: policyParams,
                expireAfter: expireAfter
            })
        );

        console.log("NewtonPolicyWallet deployed at:", address(wallet));
        console.log("Policy:", policy);
        console.log("Owner:", owner);
        console.log("Policy ID:");
        console.logBytes32(policyId);

        vm.stopBroadcast();
    }
}
