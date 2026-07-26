// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
contract ClawtonTradeLog {
    event Decision(
        address indexed executor,
        string verdict,
        string symbol,
        string side,
        string quantity,
        string detail,
        uint256 timestamp
    );
    address public immutable owner;
    constructor() {
        owner = msg.sender;
    }
    function logDecision(
        string calldata verdict,
        string calldata symbol,
        string calldata side,
        string calldata quantity,
        string calldata detail
    ) external {
        require(msg.sender == owner, "not owner");
        emit Decision(msg.sender, verdict, symbol, side, quantity, detail, block.timestamp);
    }
}
