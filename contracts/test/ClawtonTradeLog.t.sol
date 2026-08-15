// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {Test} from "forge-std/Test.sol";
import {ClawtonTradeLog} from "../src/ClawtonTradeLog.sol";
contract ClawtonTradeLogTest is Test {
    ClawtonTradeLog tradeLog;
    address executor = address(this);
    function setUp() public {
        tradeLog = new ClawtonTradeLog();
    }
    function testOwnerCanLogAllowedDecision() public {
        tradeLog.logDecision("ALLOWED", "BTCUSDT", "BUY", "0.0002", "within limits");
    }
    function testOwnerCanLogDeniedDecision() public {
        tradeLog.logDecision("DENIED", "BTCUSDT", "BUY", "0.01", "exceeds single limit");
    }
    function testNonOwnerCannotLogDecision() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert("not owner");
        tradeLog.logDecision("ALLOWED", "BTCUSDT", "BUY", "0.0002", "within limits");
    }
    function testLogDecisionEmitsEventWithCorrectData() public {
        vm.expectEmit(true, false, true, true);
        emit ClawtonTradeLog.Decision(executor, "ALLOWED", "BTCUSDT", "BUY", "0.0002", "within limits", block.timestamp);
        tradeLog.logDecision("ALLOWED", "BTCUSDT", "BUY", "0.0002", "within limits");
    }
    function testMultipleDecisionsCanBeLogged() public {
        tradeLog.logDecision("ALLOWED", "BTCUSDT", "BUY", "0.0002", "within limits");
        tradeLog.logDecision("DENIED", "ETHUSDT", "SELL", "5", "exceeds daily limit");
        tradeLog.logDecision("ALLOWED", "BTCUSDT", "SELL", "0.0001", "within limits");
    }
    function testLogDecisionWithEmptyStrings() public {
        tradeLog.logDecision("", "", "", "", "");
    }
}
