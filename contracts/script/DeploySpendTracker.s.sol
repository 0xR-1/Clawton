// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import {Script, console} from "forge-std/Script.sol";
import {ClawtonSpendTracker} from "../src/ClawtonSpendTracker.sol";
contract DeploySpendTrackerScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        ClawtonSpendTracker spendTracker = new ClawtonSpendTracker();
        console.log("ClawtonSpendTracker deployed at:", address(spendTracker));
        vm.stopBroadcast();
    }
}
