// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {NewtonPolicyClient} from "newton-contracts/src/mixins/NewtonPolicyClient.sol";
import {INewtonProverTaskManager} from "newton-contracts/src/interfaces/INewtonProverTaskManager.sol";

contract NewtonPolicyWallet is NewtonPolicyClient {
    event Executed(address indexed to, uint256 value, bytes data, bytes32 taskId);
    error InvalidAttestation();
    error ExecutionFailed();

    constructor() {}

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xdbdcaa9c || super.supportsInterface(interfaceId);
    }

    function initialize(
        address policyTaskManager,
        address owner
    ) external {
        _initNewtonPolicyClient(policyTaskManager, owner);
    }

    function validateAndExecuteDirect(
        address to,
        uint256 value,
        bytes calldata data,
        INewtonProverTaskManager.Task calldata task,
        INewtonProverTaskManager.TaskResponse calldata taskResponse,
        bytes calldata signatureData
    ) external returns (bytes memory) {
        require(_validateAttestationDirect(task, taskResponse, signatureData), InvalidAttestation());

        (bool success, bytes memory result) = to.call{value: value}(data);
        if (!success) revert ExecutionFailed();

        emit Executed(to, value, data, task.taskId);
        return result;
    }

    receive() external payable {}
}
