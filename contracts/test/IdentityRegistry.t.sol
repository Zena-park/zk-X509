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

    function _publicValues(bytes32 nullifier, bytes32 caHash) internal view returns (bytes memory) {
        return abi.encode(nullifier, caHash, uint64(block.timestamp));
    }

    function setUp() public {
        mockVerifier = new MockSP1Verifier();
        registry = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY);
        registry.addCARoot(CA_ROOT_HASH);
    }

    function test_Register() public {
        bytes memory publicValues = _publicValues(NULLIFIER, CA_ROOT_HASH);
        bytes memory proof = hex"1234";

        vm.prank(alice);
        registry.register(proof, publicValues);

        assertTrue(registry.isVerified(alice));
        assertTrue(registry.nullifiers(NULLIFIER));
    }

    function test_RevertDoubleRegistration() public {
        bytes memory publicValues = _publicValues(NULLIFIER, CA_ROOT_HASH);
        bytes memory proof = hex"1234";

        vm.prank(alice);
        registry.register(proof, publicValues);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.AlreadyRegistered.selector, NULLIFIER)
        );
        registry.register(proof, publicValues);
    }

    function test_RevertUserAlreadyVerified() public {
        bytes memory publicValues1 = _publicValues(NULLIFIER, CA_ROOT_HASH);
        bytes memory proof = hex"1234";

        vm.prank(alice);
        registry.register(proof, publicValues1);

        bytes32 nullifier2 = bytes32(uint256(0xBEEF));
        bytes memory publicValues2 = _publicValues(nullifier2, CA_ROOT_HASH);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UserAlreadyVerified.selector, alice)
        );
        registry.register(proof, publicValues2);
    }

    function test_RevertUnsupportedCA() public {
        bytes32 unknownCA = bytes32(uint256(0xBAD));
        bytes memory publicValues = _publicValues(NULLIFIER, unknownCA);
        bytes memory proof = hex"1234";

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UnsupportedCA.selector, unknownCA)
        );
        registry.register(proof, publicValues);
    }

    function test_RevertProofTooOld() public {
        vm.warp(1700000000); // Set block.timestamp to a realistic value
        // Proof from 2 hours ago
        uint64 oldTimestamp = uint64(block.timestamp - 2 hours);
        bytes memory publicValues = abi.encode(NULLIFIER, CA_ROOT_HASH, oldTimestamp);
        bytes memory proof = hex"1234";

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IdentityRegistry.ProofTooOld.selector, oldTimestamp, block.timestamp
            )
        );
        registry.register(proof, publicValues);
    }

    function test_RevertProofInFuture() public {
        // Proof from 1 hour in the future
        uint64 futureTimestamp = uint64(block.timestamp + 1 hours);
        bytes memory publicValues = abi.encode(NULLIFIER, CA_ROOT_HASH, futureTimestamp);
        bytes memory proof = hex"1234";

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IdentityRegistry.ProofInFuture.selector, futureTimestamp, block.timestamp
            )
        );
        registry.register(proof, publicValues);
    }

    function test_AddRemoveCARoot() public {
        bytes32 newCA = bytes32(uint256(0xFACE));

        registry.addCARoot(newCA);
        assertTrue(registry.validCARoots(newCA));

        registry.removeCARoot(newCA);
        assertFalse(registry.validCARoots(newCA));
    }

    function test_OnlyOwnerCanManageCA() public {
        bytes32 newCA = bytes32(uint256(0xFACE));

        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.addCARoot(newCA);
    }

    function test_TransferOwnership() public {
        registry.transferOwnership(alice);
        assertEq(registry.owner(), alice);

        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.addCARoot(bytes32(uint256(0xFACE)));

        vm.prank(alice);
        registry.addCARoot(bytes32(uint256(0xFACE)));
    }

    function test_PauseBlocksRegistration() public {
        registry.pause();
        assertTrue(registry.paused());

        bytes memory publicValues = _publicValues(NULLIFIER, CA_ROOT_HASH);
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.ContractPaused.selector);
        registry.register(hex"1234", publicValues);
    }

    function test_UnpauseAllowsRegistration() public {
        registry.pause();
        registry.unpause();
        assertFalse(registry.paused());

        bytes memory publicValues = _publicValues(NULLIFIER, CA_ROOT_HASH);
        vm.prank(alice);
        registry.register(hex"1234", publicValues);
        assertTrue(registry.isVerified(alice));
    }

    function test_OnlyOwnerCanPause() public {
        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.pause();
    }

    function test_RevokeUser() public {
        // Register alice first
        bytes memory publicValues = _publicValues(NULLIFIER, CA_ROOT_HASH);
        vm.prank(alice);
        registry.register(hex"1234", publicValues);
        assertTrue(registry.isVerified(alice));

        // Revoke alice
        registry.revokeUser(alice, "Certificate expired");
        assertFalse(registry.isVerified(alice));
    }

    function test_RevertRevokeUnverifiedUser() public {
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UserNotVerified.selector, alice)
        );
        registry.revokeUser(alice, "test");
    }

    function test_RevokedUserCanReRegister() public {
        // Register, revoke, then re-register with new nullifier
        bytes memory publicValues1 = _publicValues(NULLIFIER, CA_ROOT_HASH);
        vm.prank(alice);
        registry.register(hex"1234", publicValues1);

        registry.revokeUser(alice, "Re-issue");

        // Re-register with different nullifier (new cert)
        bytes32 nullifier2 = bytes32(uint256(0xBEEF));
        bytes memory publicValues2 = _publicValues(nullifier2, CA_ROOT_HASH);
        vm.prank(alice);
        registry.register(hex"1234", publicValues2);
        assertTrue(registry.isVerified(alice));
    }
}
