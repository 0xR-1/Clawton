// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {Test} from "forge-std/Test.sol";
import {NewtonPolicyWallet} from "../src/NewtonPolicyWallet.sol";
contract NewtonPolicyWalletInitTest is Test {
    NewtonPolicyWallet wallet;
    function setUp() public {
        wallet = new NewtonPolicyWallet();
        wallet.initialize(address(0x1234), address(this));
    }
    function testCannotReinitialize() public {
        vm.expectRevert(NewtonPolicyWallet.AlreadyInitialized.selector);
        wallet.initialize(address(0x5678), address(0xdead));
    }
}
