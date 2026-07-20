// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ClawtonTradeLog} from "../src/ClawtonTradeLog.sol";

contract DeployTradeLogScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        ClawtonTradeLog tradeLog = new ClawtonTradeLog();
        console.log("ClawtonTradeLog deployed at:", address(tradeLog));
        vm.stopBroadcast();
    }
}
