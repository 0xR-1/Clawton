// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {Test} from "forge-std/Test.sol";
import {ClawtonSpendTracker} from "../src/ClawtonSpendTracker.sol";
contract ClawtonSpendTrackerTest is Test {
    ClawtonSpendTracker tracker;
    address executor = address(this);
    function setUp() public {
        tracker = new ClawtonSpendTracker();
    }
    function testOwnerCanRecordSpend() public {
        tracker.recordSpend(1 ether);
        assertEq(tracker.recordCount(), 1);
    }
    function testNonOwnerCannotRecordSpend() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert("not owner");
        tracker.recordSpend(1 ether);
    }
    function testRecordSpendEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit ClawtonSpendTracker.SpendRecorded(executor, 1 ether, block.timestamp);
        tracker.recordSpend(1 ether);
    }
    function testCumulativeSpendZeroRecords() public {
        assertEq(tracker.getCumulativeSpend(3600), 0);
    }
    function testCumulativeSpendAllWithinWindow() public {
        tracker.recordSpend(1 ether);
        tracker.recordSpend(2 ether);
        assertEq(tracker.getCumulativeSpend(3600), 3 ether);
    }
    function testCumulativeSpendExcludesOldRecords() public {
        tracker.recordSpend(1 ether);
        vm.warp(block.timestamp + 7200);
        tracker.recordSpend(2 ether);
        assertEq(tracker.getCumulativeSpend(3600), 2 ether);
    }
    function testCumulativeSpendWindowLargerThanTimestamp() public {
        vm.warp(100);
        tracker.recordSpend(1 ether);
        assertEq(tracker.getCumulativeSpend(1000), 1 ether);
    }
    function testCumulativeSpendBoundaryAtCutoffIsIncluded() public {
        vm.warp(1000);
        tracker.recordSpend(1 ether);
        vm.warp(1000 + 3600);
        assertEq(tracker.getCumulativeSpend(3600), 1 ether);
    }
    function testCumulativeSpendBoundaryJustAfterCutoffIsExcluded() public {
        vm.warp(1000);
        tracker.recordSpend(1 ether);
        vm.warp(1000 + 3601);
        assertEq(tracker.getCumulativeSpend(3600), 0);
    }
    function testRecordCount() public {
        assertEq(tracker.recordCount(), 0);
        tracker.recordSpend(1 ether);
        tracker.recordSpend(1 ether);
        assertEq(tracker.recordCount(), 2);
    }
}
