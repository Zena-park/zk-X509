// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ISP1Verifier} from "../src/ISP1Verifier.sol";

/// @notice Mock SP1 verifier that always passes (for unit testing).
contract MockSP1Verifier is ISP1Verifier {
    function verifyProof(bytes32, bytes calldata, bytes calldata) external pure {}
}

contract IdentityRegistryTest is Test {
    IdentityRegistry public registry;
    MockSP1Verifier public mockVerifier;

    bytes32 constant PROGRAM_VKEY = bytes32(uint256(0x1234));
    bytes32 constant CA_ROOT_HASH = bytes32(uint256(0xCAFE));
    bytes32 constant NULLIFIER = bytes32(uint256(0xDEAD));

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function _pv(bytes32 nullifier, bytes32 caHash, address sender) internal view returns (bytes memory) {
        return abi.encode(nullifier, caHash, uint64(block.timestamp), sender);
    }

    function setUp() public {
        mockVerifier = new MockSP1Verifier();
        registry = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY);
        registry.addCARoot(CA_ROOT_HASH);
    }

    function test_Register() public {
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));
        assertTrue(registry.nullifiers(NULLIFIER));
    }

    function test_RevertRegistrantMismatch() public {
        // Proof bound to alice, but bob tries to submit it (front-running)
        bytes memory publicValues = _pv(NULLIFIER, CA_ROOT_HASH, alice);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.RegistrantMismatch.selector, alice, bob)
        );
        registry.register(hex"1234", publicValues);
    }

    function test_RevertRegistrantMismatchReverse() public {
        // Proof bound to bob, but alice tries to submit it
        bytes memory publicValues = _pv(NULLIFIER, CA_ROOT_HASH, bob);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.RegistrantMismatch.selector, bob, alice)
        );
        registry.register(hex"1234", publicValues);
    }

    function test_RevertDoubleRegistration() public {
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));

        // Bob tries with same nullifier but his own address
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.AlreadyRegistered.selector, NULLIFIER)
        );
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, bob));
    }

    function test_RevertUserAlreadyVerified() public {
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));

        bytes32 nullifier2 = bytes32(uint256(0xBEEF));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UserAlreadyVerified.selector, alice)
        );
        registry.register(hex"1234", _pv(nullifier2, CA_ROOT_HASH, alice));
    }

    function test_RevertUnsupportedCA() public {
        bytes32 unknownCA = bytes32(uint256(0xBAD));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UnsupportedCA.selector, unknownCA)
        );
        registry.register(hex"1234", _pv(NULLIFIER, unknownCA, alice));
    }

    function test_RevertProofTooOld() public {
        vm.warp(1700000000);
        uint64 oldTimestamp = uint64(block.timestamp - 2 hours);
        bytes memory publicValues = abi.encode(NULLIFIER, CA_ROOT_HASH, oldTimestamp, alice);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IdentityRegistry.ProofTooOld.selector, oldTimestamp, block.timestamp
            )
        );
        registry.register(hex"1234", publicValues);
    }

    function test_RevertProofInFuture() public {
        uint64 futureTimestamp = uint64(block.timestamp + 1 hours);
        bytes memory publicValues = abi.encode(NULLIFIER, CA_ROOT_HASH, futureTimestamp, alice);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IdentityRegistry.ProofInFuture.selector, futureTimestamp, block.timestamp
            )
        );
        registry.register(hex"1234", publicValues);
    }

    function test_AddRemoveCARoot() public {
        bytes32 newCA = bytes32(uint256(0xFACE));
        registry.addCARoot(newCA);
        assertTrue(registry.validCARoots(newCA));
        registry.removeCARoot(newCA);
        assertFalse(registry.validCARoots(newCA));
    }

    function test_OnlyOwnerCanManageCA() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.addCARoot(bytes32(uint256(0xFACE)));
    }

    function test_TwoStepOwnershipTransfer() public {
        registry.transferOwnership(alice);
        assertEq(registry.owner(), address(this));
        assertEq(registry.pendingOwner(), alice);

        vm.prank(bob);
        vm.expectRevert(IdentityRegistry.NotPendingOwner.selector);
        registry.acceptOwnership();

        vm.prank(alice);
        registry.acceptOwnership();
        assertEq(registry.owner(), alice);
        assertEq(registry.pendingOwner(), address(0));

        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.addCARoot(bytes32(uint256(0xFACE)));

        vm.prank(alice);
        registry.addCARoot(bytes32(uint256(0xFACE)));
    }

    function test_PauseBlocksRegistration() public {
        registry.pause();
        assertTrue(registry.paused());
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.ContractPaused.selector);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
    }

    function test_UnpauseAllowsRegistration() public {
        registry.pause();
        registry.unpause();
        assertFalse(registry.paused());
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));
    }

    function test_OnlyOwnerCanPause() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.pause();
    }

    function test_RevokeUser() public {
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));
        registry.revokeUser(alice, keccak256("CERT_EXPIRED"));
        assertFalse(registry.isVerified(alice));
    }

    function test_RevertRevokeUnverifiedUser() public {
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UserNotVerified.selector, alice)
        );
        registry.revokeUser(alice, keccak256("TEST"));
    }

    function test_RevokedUserCanReRegister() public {
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        registry.revokeUser(alice, keccak256("RE_ISSUE"));

        bytes32 nullifier2 = bytes32(uint256(0xBEEF));
        vm.prank(alice);
        registry.register(hex"1234", _pv(nullifier2, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));
    }
}
