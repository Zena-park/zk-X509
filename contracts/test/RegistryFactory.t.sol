// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RegistryFactory} from "../src/RegistryFactory.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

/// @dev Minimal mock SP1 verifier that accepts all proofs.
contract MockSP1Verifier {
    function verifyProof(bytes32, bytes calldata, bytes calldata) external pure {}
}

contract RegistryFactoryTest is Test {
    RegistryFactory public factory;
    MockSP1Verifier public mockVerifier;
    bytes32 constant PROGRAM_V_KEY = bytes32(uint256(0x1234));

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        mockVerifier = new MockSP1Verifier();
        factory = new RegistryFactory(address(mockVerifier), PROGRAM_V_KEY);
    }

    function test_CreateRegistry() public {
        vm.prank(alice);
        address reg = factory.createRegistry("Test", 1, 0, 3600);

        assertTrue(factory.isRegistry(reg));
        assertEq(factory.getRegistryCount(), 1);

        IdentityRegistry registry = IdentityRegistry(reg);
        assertEq(registry.owner(), alice);
        assertEq(registry.MAX_WALLETS_PER_CERT(), 1);
        assertEq(registry.MIN_DISCLOSURE_MASK(), 0);
    }

    function test_CreateRegistryWithDisclosure() public {
        vm.prank(alice);
        address reg = factory.createRegistry("DeFi KYC", 3, 0x01, 3600);

        IdentityRegistry registry = IdentityRegistry(reg);
        assertEq(registry.MAX_WALLETS_PER_CERT(), 3);
        assertEq(registry.MIN_DISCLOSURE_MASK(), 0x01);
    }

    function test_CreateMultipleRegistries() public {
        vm.prank(alice);
        factory.createRegistry("Test", 1, 0, 3600);

        vm.prank(bob);
        factory.createRegistry("Registry B", 3, 0x03, 3600);

        assertEq(factory.getRegistryCount(), 2);

        address[] memory all = factory.getRegistries();
        assertEq(all.length, 2);
        assertTrue(factory.isRegistry(all[0]));
        assertTrue(factory.isRegistry(all[1]));

        // Different owners
        assertEq(IdentityRegistry(all[0]).owner(), alice);
        assertEq(IdentityRegistry(all[1]).owner(), bob);
    }

    function test_RegistryInfo() public {
        vm.prank(alice);
        address reg = factory.createRegistry("My Service", 2, 0x01, 3600);

        (address creator, string memory name, uint32 maxWallets, uint8 mask, uint256 proofAge, uint256 createdAt, uint256 vKeyVer) =
            factory.registryInfo(reg);

        assertEq(creator, alice);
        assertEq(name, "My Service");
        assertEq(maxWallets, 2);
        assertEq(mask, 0x01);
        assertEq(proofAge, 3600);
        assertGt(createdAt, 0);
        assertEq(vKeyVer, 0);
    }

    function test_OwnerCanManageCA() public {
        vm.prank(alice);
        address reg = factory.createRegistry("Test", 1, 0, 3600);

        IdentityRegistry registry = IdentityRegistry(reg);

        // Alice (owner) can add CA
        bytes32 caHash = bytes32(uint256(0xCAFE));
        vm.prank(alice);
        registry.addCA(caHash);
        assertEq(registry.getCaCount(), 1);
    }

    function test_FactoryCannotManageRegistry() public {
        vm.prank(alice);
        address reg = factory.createRegistry("Test", 1, 0, 3600);

        IdentityRegistry registry = IdentityRegistry(reg);

        // Factory is NOT the owner — should revert
        bytes32 caHash = bytes32(uint256(0xCAFE));
        vm.prank(address(factory));
        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.addCA(caHash);
    }

    function test_RevertZeroMaxWallets() public {
        vm.expectRevert(RegistryFactory.ZeroMaxWallets.selector);
        factory.createRegistry("Test", 0, 0, 3600);
    }

    function test_RevertInvalidDisclosureMask() public {
        vm.expectRevert(RegistryFactory.InvalidDisclosureMask.selector);
        factory.createRegistry("Bad", 1, 0x10, 3600);
    }

    function test_RegistriesAreIndependent() public {
        vm.prank(alice);
        address regA = factory.createRegistry("Test", 1, 0, 3600);

        vm.prank(bob);
        address regB = factory.createRegistry("B", 3, 0x01, 3600);

        // Add CA to registry A only
        bytes32 caHash = bytes32(uint256(0xCAFE));
        vm.prank(alice);
        IdentityRegistry(regA).addCA(caHash);

        // Registry A has 1 CA, Registry B has 0
        assertEq(IdentityRegistry(regA).getCaCount(), 1);
        assertEq(IdentityRegistry(regB).getCaCount(), 0);
    }

    function test_BeaconExists() public view {
        // Beacon should be deployed by the factory
        assertTrue(address(factory.beacon()) != address(0));
    }

    function test_UpgradeImplementation() public {
        // Deploy a new implementation
        IdentityRegistry newImpl = new IdentityRegistry();

        // Only factory owner can upgrade
        vm.prank(alice);
        vm.expectRevert(RegistryFactory.OnlyOwner.selector);
        factory.upgradeImplementation(address(newImpl));

        // Factory owner (this contract) can upgrade
        factory.upgradeImplementation(address(newImpl));
    }

    function test_UpgradedRegistryStillWorks() public {
        // Create a registry and configure it
        vm.prank(alice);
        address reg = factory.createRegistry("Test", 1, 0, 3600);

        IdentityRegistry registry = IdentityRegistry(reg);
        bytes32 caHash = bytes32(uint256(0xCAFE));
        vm.prank(alice);
        registry.addCA(caHash);
        assertEq(registry.getCaCount(), 1);

        // Upgrade implementation
        IdentityRegistry newImpl = new IdentityRegistry();
        factory.upgradeImplementation(address(newImpl));

        // State should be preserved after upgrade
        assertEq(registry.getCaCount(), 1);
        assertEq(registry.owner(), alice);
        assertEq(registry.MAX_WALLETS_PER_CERT(), 1);
    }

    function test_InitialVKeyVersion() public view {
        assertEq(factory.currentProgramVKey(), PROGRAM_V_KEY);
        assertEq(factory.vKeyVersionCount(), 1);
        assertEq(factory.vKeyVersions(0), PROGRAM_V_KEY);
    }

    function test_UpdateProgramVKey() public {
        bytes32 newVKey = bytes32(uint256(0x5678));

        factory.updateProgramVKey(newVKey);

        assertEq(factory.currentProgramVKey(), newVKey);
        assertEq(factory.vKeyVersionCount(), 2);
        assertEq(factory.vKeyVersions(0), PROGRAM_V_KEY);
        assertEq(factory.vKeyVersions(1), newVKey);
    }

    function test_UpdateVKeyOnlyOwner() public {
        bytes32 newVKey = bytes32(uint256(0x5678));

        vm.prank(alice);
        vm.expectRevert(RegistryFactory.OnlyOwner.selector);
        factory.updateProgramVKey(newVKey);
    }

    function test_UpdateVKeyRevertZero() public {
        vm.expectRevert(RegistryFactory.ZeroVKey.selector);
        factory.updateProgramVKey(bytes32(0));
    }

    function test_UpdateVKeyRevertDuplicate() public {
        // Current VKey rejected
        vm.expectRevert(RegistryFactory.DuplicateVKey.selector);
        factory.updateProgramVKey(PROGRAM_V_KEY);
    }

    function test_UpdateVKeyRevertHistoricalDuplicate() public {
        // Update to v1
        bytes32 v1 = bytes32(uint256(0x5678));
        factory.updateProgramVKey(v1);

        // Try to re-introduce v0 (deprecated) — should fail
        vm.expectRevert(RegistryFactory.DuplicateVKey.selector);
        factory.updateProgramVKey(PROGRAM_V_KEY);
    }

    function test_NewRegistryUsesLatestVKey() public {
        // Create registry with initial VKey
        vm.prank(alice);
        address reg1 = factory.createRegistry("V1", 1, 0, 3600);

        // Update VKey
        bytes32 newVKey = bytes32(uint256(0x5678));
        factory.updateProgramVKey(newVKey);

        // Create registry with new VKey
        vm.prank(bob);
        address reg2 = factory.createRegistry("V2", 1, 0, 3600);

        // reg1 has old VKey, reg2 has new VKey
        assertEq(IdentityRegistry(reg1).PROGRAM_V_KEY(), PROGRAM_V_KEY);
        assertEq(IdentityRegistry(reg2).PROGRAM_V_KEY(), newVKey);

        // RegistryInfo tracks version numbers
        (,,,,,,uint256 v1) = factory.registryInfo(reg1);
        (,,,,,,uint256 v2) = factory.registryInfo(reg2);
        assertEq(v1, 0);
        assertEq(v2, 1);
    }
}
