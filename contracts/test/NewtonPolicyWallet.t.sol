// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {Test} from "forge-std/Test.sol";
import {NewtonPolicyWallet} from "../src/NewtonPolicyWallet.sol";
import {INewtonProverTaskManager} from "newton-contracts/src/interfaces/INewtonProverTaskManager.sol";
import {NewtonMessage} from "newton-contracts/src/core/NewtonMessage.sol";
import {INewtonPolicy} from "newton-contracts/src/interfaces/INewtonPolicy.sol";

contract MockTaskManager {
    bool public result;
    function setResult(bool _result) external {
        result = _result;
    }
    function validateAttestationDirect(
        INewtonProverTaskManager.Task calldata task,
        INewtonProverTaskManager.TaskResponse calldata taskResponse,
        bytes calldata signatureData
    ) external view returns (bool) {
        return result;
    }
}

contract MockTarget {
    uint256 public value;
    function succeed(uint256 newValue) external payable returns (uint256) {
        value = newValue;
        return newValue;
    }
    function fail() external pure {
        revert("target failed");
    }
}

contract NewtonPolicyWalletTest is Test {
    NewtonPolicyWallet wallet;
    MockTaskManager taskManager;
    MockTarget target;
    address ownerAddr = address(this);
    address signer = address(0xABCD);

    function setUp() public {
        taskManager = new MockTaskManager();
        wallet = new NewtonPolicyWallet();
        wallet.initialize(address(taskManager), ownerAddr);
        target = new MockTarget();
    }

    function _emptyIntent(address from) internal view returns (NewtonMessage.Intent memory) {
        return NewtonMessage.Intent({
            from: from,
            to: address(target),
            value: 0,
            data: "",
            chainId: block.chainid,
            functionSignature: ""
        });
    }

    function _emptyPolicyTaskData() internal pure returns (NewtonMessage.PolicyTaskData memory) {
        return NewtonMessage.PolicyTaskData({
            policyId: bytes32(0),
            policyAddress: address(0),
            policy: "",
            policyData: new NewtonMessage.PolicyData[](0)
        });
    }

    function _emptyPolicyConfig() internal pure returns (INewtonPolicy.PolicyConfig memory) {
        return INewtonPolicy.PolicyConfig({
            policyParams: "",
            expireAfter: 0
        });
    }

    function _buildTask(address from) internal view returns (INewtonProverTaskManager.Task memory) {
        return INewtonProverTaskManager.Task({
            taskId: bytes32(uint256(1)),
            policyClient: address(wallet),
            taskCreatedBlock: uint32(block.number),
            quorumThresholdPercentage: 100,
            intent: _emptyIntent(from),
            intentSignature: "",
            wasmArgs: "",
            quorumNumbers: "",
            initializationTimestamp: block.timestamp
        });
    }

    function _buildTaskResponse(address from, bytes32 policyId) internal view returns (INewtonProverTaskManager.TaskResponse memory) {
        return INewtonProverTaskManager.TaskResponse({
            taskId: bytes32(uint256(1)),
            policyClient: address(wallet),
            policyId: policyId,
            policyAddress: address(0),
            intent: _emptyIntent(from),
            intentSignature: "",
            evaluationResult: "",
            policyTaskData: _emptyPolicyTaskData(),
            policyConfig: _emptyPolicyConfig(),
            initializationTimestamp: block.timestamp
        });
    }

    function testSupportsNewtonPolicyClientInterface() public view {
        assertTrue(wallet.supportsInterface(0xdbdcaa9c));
    }

    function testValidateAndExecuteDirectRevertsOnZeroAddress() public {
        INewtonProverTaskManager.Task memory task = _buildTask(signer);
        INewtonProverTaskManager.TaskResponse memory taskResponse = _buildTaskResponse(signer, bytes32(0));
        vm.prank(signer);
        vm.expectRevert(NewtonPolicyWallet.ZeroAddress.selector);
        wallet.validateAndExecuteDirect(address(0), 0, "", task, taskResponse, "");
    }

    function testValidateAndExecuteDirectRevertsOnInvalidAttestation() public {
        taskManager.setResult(false);
        INewtonProverTaskManager.Task memory task = _buildTask(signer);
        INewtonProverTaskManager.TaskResponse memory taskResponse = _buildTaskResponse(signer, bytes32(0));
        vm.prank(signer);
        vm.expectRevert(NewtonPolicyWallet.InvalidAttestation.selector);
        wallet.validateAndExecuteDirect(address(target), 0, abi.encodeCall(MockTarget.succeed, (5)), task, taskResponse, "");
    }

    function testValidateAndExecuteDirectRevertsOnWrongPolicyId() public {
        taskManager.setResult(true);
        INewtonProverTaskManager.Task memory task = _buildTask(signer);
        INewtonProverTaskManager.TaskResponse memory taskResponse = _buildTaskResponse(signer, bytes32(uint256(999)));
        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(NewtonMessage.Unauthorized.selector, "Policy ID does not match"));
        wallet.validateAndExecuteDirect(address(target), 0, abi.encodeCall(MockTarget.succeed, (5)), task, taskResponse, "");
    }

    function testValidateAndExecuteDirectRevertsOnWrongSender() public {
        taskManager.setResult(true);
        INewtonProverTaskManager.Task memory task = _buildTask(signer);
        INewtonProverTaskManager.TaskResponse memory taskResponse = _buildTaskResponse(signer, bytes32(0));
        vm.prank(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(NewtonMessage.Unauthorized.selector, "Not authorized intent sender"));
        wallet.validateAndExecuteDirect(address(target), 0, abi.encodeCall(MockTarget.succeed, (5)), task, taskResponse, "");
    }

    function testValidateAndExecuteDirectRevertsOnWrongChainId() public {
        taskManager.setResult(true);
        INewtonProverTaskManager.Task memory task = _buildTask(signer);
        INewtonProverTaskManager.TaskResponse memory taskResponse = _buildTaskResponse(signer, bytes32(0));
        taskResponse.intent.chainId = 999;
        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSelector(NewtonMessage.Unauthorized.selector, "Chain ID does not match"));
        wallet.validateAndExecuteDirect(address(target), 0, abi.encodeCall(MockTarget.succeed, (5)), task, taskResponse, "");
    }

    function testValidateAndExecuteDirectSucceedsAndEmitsEvent() public {
        taskManager.setResult(true);
        INewtonProverTaskManager.Task memory task = _buildTask(signer);
        INewtonProverTaskManager.TaskResponse memory taskResponse = _buildTaskResponse(signer, bytes32(0));
        bytes memory callData = abi.encodeCall(MockTarget.succeed, (42));
        vm.prank(signer);
        vm.expectEmit(true, false, false, true);
        emit NewtonPolicyWallet.Executed(address(target), 0, callData, task.taskId);
        wallet.validateAndExecuteDirect(address(target), 0, callData, task, taskResponse, "");
        assertEq(target.value(), 42);
    }

    function testValidateAndExecuteDirectRevertsOnExecutionFailure() public {
        taskManager.setResult(true);
        INewtonProverTaskManager.Task memory task = _buildTask(signer);
        INewtonProverTaskManager.TaskResponse memory taskResponse = _buildTaskResponse(signer, bytes32(0));
        bytes memory callData = abi.encodeCall(MockTarget.fail, ());
        vm.prank(signer);
        vm.expectRevert(NewtonPolicyWallet.ExecutionFailed.selector);
        wallet.validateAndExecuteDirect(address(target), 0, callData, task, taskResponse, "");
    }

    function testWalletCanReceiveEther() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(wallet).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(wallet).balance, 1 ether);
    }
}
