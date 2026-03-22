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

    // Default: expires 1 year from now
    uint64 constant DEFAULT_NOT_AFTER = uint64(365 days);

    function _pv(bytes32 nullifier, bytes32 caHash, address sender) internal view returns (bytes memory) {
        return abi.encode(nullifier, caHash, uint64(block.timestamp), sender, uint32(0),
            uint64(block.timestamp) + DEFAULT_NOT_AFTER,
            bytes32(0), bytes32(0), bytes32(0), bytes32(0)); // selective disclosure: none
    }

    function _pvIdx(bytes32 nullifier, bytes32 caHash, address sender, uint32 idx) internal view returns (bytes memory) {
        return abi.encode(nullifier, caHash, uint64(block.timestamp), sender, idx,
            uint64(block.timestamp) + DEFAULT_NOT_AFTER,
            bytes32(0), bytes32(0), bytes32(0), bytes32(0));
    }

    function setUp() public {
        mockVerifier = new MockSP1Verifier();
        registry = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 1);
        registry.addCARoot(CA_ROOT_HASH);
    }

    function test_Register() public {
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));
        assertTrue(registry.nullifierOwner(NULLIFIER) == alice);
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
        bytes memory publicValues = abi.encode(NULLIFIER, CA_ROOT_HASH, oldTimestamp, alice, uint32(0), uint64(block.timestamp) + DEFAULT_NOT_AFTER);
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
        bytes memory publicValues = abi.encode(NULLIFIER, CA_ROOT_HASH, futureTimestamp, alice, uint32(0), uint64(block.timestamp) + DEFAULT_NOT_AFTER);
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

    function test_RevokeIdentity() public {
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));

        registry.revokeIdentity(NULLIFIER, keccak256("CERT_REVOKED"));
        assertFalse(registry.isVerified(alice));
        assertTrue(registry.revokedNullifiers(NULLIFIER));
    }

    function test_RevertRevokeUnregisteredNullifier() public {
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.NullifierNotRegistered.selector, NULLIFIER)
        );
        registry.revokeIdentity(NULLIFIER, keccak256("TEST"));
    }

    function test_RevokedNullifierCannotReRegister() public {
        // Register then revoke
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        registry.revokeIdentity(NULLIFIER, keccak256("CERT_REVOKED"));

        // Attempt to reRegister the revoked nullifier → should fail
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.NullifierRevoked.selector, NULLIFIER)
        );
        registry.reRegister(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, bob));
    }

    function test_RevokedNullifierCannotRegister() public {
        // Register, revoke, then try to register same nullifier again
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        registry.revokeIdentity(NULLIFIER, keccak256("CERT_REVOKED"));

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.NullifierRevoked.selector, NULLIFIER)
        );
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, bob));
    }

    function test_RevokedUserCanRegisterWithNewCert() public {
        // Alice registers with NULLIFIER, gets revoked
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        registry.revokeIdentity(NULLIFIER, keccak256("RE_ISSUE"));

        // Alice can register with a different cert (different nullifier)
        bytes32 nullifier2 = bytes32(uint256(0xBEEF));
        vm.prank(alice);
        registry.register(hex"1234", _pv(nullifier2, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));
    }

    // ============ reRegister tests ============

    function test_ReRegister() public {
        // Alice registers
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
        assertTrue(registry.isVerified(alice));

        // Alice re-registers to bob's wallet (same cert/nullifier, new wallet)
        vm.prank(bob);
        registry.reRegister(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, bob));

        // Alice unverified, bob verified
        assertFalse(registry.isVerified(alice));
        assertTrue(registry.isVerified(bob));
        assertEq(registry.nullifierOwner(NULLIFIER), bob);
    }

    function test_RevertReRegisterUnregisteredNullifier() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.NullifierNotRegistered.selector, NULLIFIER)
        );
        registry.reRegister(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));
    }

    function test_RevertReRegisterToAlreadyVerifiedWallet() public {
        // Register alice with NULLIFIER
        vm.prank(alice);
        registry.register(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, alice));

        // Register bob with different nullifier
        bytes32 nullifier2 = bytes32(uint256(0xBEEF));
        vm.prank(bob);
        registry.register(hex"1234", _pv(nullifier2, CA_ROOT_HASH, bob));

        // Try to re-register NULLIFIER to bob (already verified)
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UserAlreadyVerified.selector, bob)
        );
        registry.reRegister(hex"1234", _pv(NULLIFIER, CA_ROOT_HASH, bob));
    }

    // ============ Multi-wallet tests ============

    function test_MultiWallet_TwoSlots() public {
        // Deploy a multi-wallet registry (maxWalletsPerCert = 3)
        IdentityRegistry multiReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 3);
        multiReg.addCARoot(CA_ROOT_HASH);

        // Alice registers wallet index 0
        bytes32 null0 = bytes32(uint256(0xA000));
        vm.prank(alice);
        multiReg.register(hex"1234", _pvIdx(null0, CA_ROOT_HASH, alice, 0));
        assertTrue(multiReg.isVerified(alice));

        // Bob registers wallet index 1 (same cert, different wallet)
        bytes32 null1 = bytes32(uint256(0xA001));
        vm.prank(bob);
        multiReg.register(hex"1234", _pvIdx(null1, CA_ROOT_HASH, bob, 1));
        assertTrue(multiReg.isVerified(bob));

        // Both verified
        assertTrue(multiReg.isVerified(alice));
        assertTrue(multiReg.isVerified(bob));
    }

    function test_MultiWallet_RevertIndexOutOfRange() public {
        IdentityRegistry multiReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 2);
        multiReg.addCARoot(CA_ROOT_HASH);

        // Index 2 is out of range for max=2 (valid: 0, 1)
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.WalletIndexOutOfRange.selector, uint32(2), uint32(2))
        );
        multiReg.register(hex"1234", _pvIdx(NULLIFIER, CA_ROOT_HASH, alice, 2));
    }

    function test_MultiWallet_SameAddressTwoSlots_Reverts() public {
        IdentityRegistry multiReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 3);
        multiReg.addCARoot(CA_ROOT_HASH);

        // Alice registers slot 0
        bytes32 null0 = bytes32(uint256(0xB000));
        vm.prank(alice);
        multiReg.register(hex"1234", _pvIdx(null0, CA_ROOT_HASH, alice, 0));

        // Alice tries slot 1 with same address → UserAlreadyVerified
        bytes32 null1 = bytes32(uint256(0xB001));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.UserAlreadyVerified.selector, alice)
        );
        multiReg.register(hex"1234", _pvIdx(null1, CA_ROOT_HASH, alice, 1));
    }

    function test_MultiWallet_SameNullifierTwice_Reverts() public {
        IdentityRegistry multiReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 3);
        multiReg.addCARoot(CA_ROOT_HASH);

        bytes32 null0 = bytes32(uint256(0xC000));
        vm.prank(alice);
        multiReg.register(hex"1234", _pvIdx(null0, CA_ROOT_HASH, alice, 0));

        // Same nullifier again → AlreadyRegistered
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.AlreadyRegistered.selector, null0)
        );
        multiReg.register(hex"1234", _pvIdx(null0, CA_ROOT_HASH, bob, 0));
    }

    function test_MultiWallet_ReRegister() public {
        IdentityRegistry multiReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 3);
        multiReg.addCARoot(CA_ROOT_HASH);

        bytes32 null0 = bytes32(uint256(0xD000));
        vm.prank(alice);
        multiReg.register(hex"1234", _pvIdx(null0, CA_ROOT_HASH, alice, 0));

        // Re-register slot 0 from alice to bob
        vm.prank(bob);
        multiReg.reRegister(hex"1234", _pvIdx(null0, CA_ROOT_HASH, bob, 0));
        assertFalse(multiReg.isVerified(alice));
        assertTrue(multiReg.isVerified(bob));
    }

    function test_MultiWallet_RevokeOneSlot_OtherUnaffected() public {
        IdentityRegistry multiReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 3);
        multiReg.addCARoot(CA_ROOT_HASH);

        bytes32 null0 = bytes32(uint256(0xE000));
        bytes32 null1 = bytes32(uint256(0xE001));

        vm.prank(alice);
        multiReg.register(hex"1234", _pvIdx(null0, CA_ROOT_HASH, alice, 0));
        vm.prank(bob);
        multiReg.register(hex"1234", _pvIdx(null1, CA_ROOT_HASH, bob, 1));

        // Revoke slot 0 only
        multiReg.revokeIdentity(null0, keccak256("REVOKED"));
        assertFalse(multiReg.isVerified(alice));
        assertTrue(multiReg.isVerified(bob)); // slot 1 unaffected
        assertTrue(multiReg.revokedNullifiers(null0));
        assertFalse(multiReg.revokedNullifiers(null1));
    }

    function test_MultiWallet_BoundaryIndices() public {
        IdentityRegistry multiReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 3);
        multiReg.addCARoot(CA_ROOT_HASH);

        // Index 0 (first)
        bytes32 null0 = bytes32(uint256(0xF000));
        vm.prank(alice);
        multiReg.register(hex"1234", _pvIdx(null0, CA_ROOT_HASH, alice, 0));
        assertTrue(multiReg.isVerified(alice));

        // Index 2 (last valid for max=3)
        bytes32 null2 = bytes32(uint256(0xF002));
        vm.prank(bob);
        multiReg.register(hex"1234", _pvIdx(null2, CA_ROOT_HASH, bob, 2));
        assertTrue(multiReg.isVerified(bob));
    }

    function test_MultiWallet_MaxZero_AllReverts() public {
        IdentityRegistry zeroReg = new IdentityRegistry(address(mockVerifier), PROGRAM_VKEY, 0);
        zeroReg.addCARoot(CA_ROOT_HASH);

        // Any index reverts (0 >= 0)
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IdentityRegistry.WalletIndexOutOfRange.selector, uint32(0), uint32(0))
        );
        zeroReg.register(hex"1234", _pvIdx(NULLIFIER, CA_ROOT_HASH, alice, 0));
    }

    // ============ Certificate expiry tests ============

    function test_CertExpiry_VerifiedBeforeExpiry() public {
        vm.warp(1700000000);
        // Cert expires in 1 year
        uint64 notAfter = uint64(block.timestamp) + DEFAULT_NOT_AFTER;
        bytes memory pv = abi.encode(NULLIFIER, CA_ROOT_HASH, uint64(block.timestamp), alice, uint32(0), notAfter);

        vm.prank(alice);
        registry.register(hex"1234", pv);
        assertTrue(registry.isVerified(alice));
        assertEq(registry.verifiedUntil(alice), notAfter);
    }

    function test_CertExpiry_NotVerifiedAfterExpiry() public {
        vm.warp(1700000000);
        uint64 notAfter = uint64(block.timestamp + 1 hours);
        bytes memory pv = abi.encode(NULLIFIER, CA_ROOT_HASH, uint64(block.timestamp), alice, uint32(0), notAfter);

        vm.prank(alice);
        registry.register(hex"1234", pv);
        assertTrue(registry.isVerified(alice));

        // Fast-forward past expiry
        vm.warp(block.timestamp + 2 hours);
        assertFalse(registry.isVerified(alice));
    }

    function test_CertExpiry_CanReRegisterAfterExpiry() public {
        vm.warp(1700000000);
        uint64 notAfter = uint64(block.timestamp + 1 hours);
        bytes memory pv = abi.encode(NULLIFIER, CA_ROOT_HASH, uint64(block.timestamp), alice, uint32(0), notAfter);

        vm.prank(alice);
        registry.register(hex"1234", pv);

        // Fast-forward past expiry
        vm.warp(block.timestamp + 2 hours);
        assertFalse(registry.isVerified(alice));

        // Alice can register with a new cert (different nullifier)
        bytes32 nullifier2 = bytes32(uint256(0xFEED));
        uint64 newNotAfter = uint64(block.timestamp) + DEFAULT_NOT_AFTER;
        bytes memory pv2 = abi.encode(nullifier2, CA_ROOT_HASH, uint64(block.timestamp), alice, uint32(0), newNotAfter);

        vm.prank(alice);
        registry.register(hex"1234", pv2);
        assertTrue(registry.isVerified(alice));
    }
}
