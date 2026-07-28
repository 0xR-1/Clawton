// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
contract ClawtonSpendTracker {
    struct SpendRecord {
        uint256 amountWei;
        uint256 timestamp;
    }
    event SpendRecorded(address indexed executor, uint256 indexed amountWei, uint256 indexed timestamp);
    address public immutable owner;
    SpendRecord[] public records;
    constructor() {
        owner = msg.sender;
    }
    function recordSpend(uint256 amountWei) external {
        require(msg.sender == owner, "not owner");
        records.push(SpendRecord(amountWei, block.timestamp));
        emit SpendRecorded(msg.sender, amountWei, block.timestamp);
    }
    function getCumulativeSpend(uint256 windowSeconds) external view returns (uint256) {
        uint256 total = 0;
        uint256 cutoff = block.timestamp > windowSeconds ? block.timestamp - windowSeconds : 0;
        for (uint256 i = records.length; i > 0; i--) {
            SpendRecord storage r = records[i - 1];
            if (r.timestamp < cutoff) {
                break;
            }
            total += r.amountWei;
        }
        return total;
    }
    function recordCount() external view returns (uint256) {
        return records.length;
    }
}
