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
        address reg = factory.createRegistry("DAO Voting", 1, 0);

        assertTrue(factory.isRegistry(reg));
        assertEq(factory.getRegistryCount(), 1);

        IdentityRegistry registry = IdentityRegistry(reg);
        assertEq(registry.owner(), alice);
        assertEq(registry.MAX_WALLETS_PER_CERT(), 1);
        assertEq(registry.MIN_DISCLOSURE_MASK(), 0);
    }

    function test_CreateRegistryWithDisclosure() public {
        vm.prank(alice);
        address reg = factory.createRegistry("DeFi KYC", 3, 0x01);

        IdentityRegistry registry = IdentityRegistry(reg);
        assertEq(registry.MAX_WALLETS_PER_CERT(), 3);
        assertEq(registry.MIN_DISCLOSURE_MASK(), 0x01);
    }

    function test_CreateMultipleRegistries() public {
        vm.prank(alice);
        factory.createRegistry("Registry A", 1, 0);

        vm.prank(bob);
        factory.createRegistry("Registry B", 3, 0x03);

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
        address reg = factory.createRegistry("My Service", 2, 0x01);

        (address creator, string memory name, uint32 maxWallets, uint8 mask, uint256 createdAt) =
            factory.registryInfo(reg);

        assertEq(creator, alice);
        assertEq(name, "My Service");
        assertEq(maxWallets, 2);
        assertEq(mask, 0x01);
        assertGt(createdAt, 0);
    }

    function test_OwnerCanManageCA() public {
        vm.prank(alice);
        address reg = factory.createRegistry("Test", 1, 0);

        IdentityRegistry registry = IdentityRegistry(reg);

        // Alice (owner) can add CA
        bytes32 caHash = bytes32(uint256(0xCAFE));
        vm.prank(alice);
        registry.addCA(caHash);
        assertEq(registry.getCaCount(), 1);
    }

    function test_FactoryCannotManageRegistry() public {
        vm.prank(alice);
        address reg = factory.createRegistry("Test", 1, 0);

        IdentityRegistry registry = IdentityRegistry(reg);

        // Factory is NOT the owner — should revert
        bytes32 caHash = bytes32(uint256(0xCAFE));
        vm.expectRevert(IdentityRegistry.OnlyOwner.selector);
        registry.addCA(caHash);
    }

    function test_RevertZeroMaxWallets() public {
        vm.expectRevert(RegistryFactory.ZeroMaxWallets.selector);
        factory.createRegistry("Bad", 0, 0);
    }

    function test_RevertInvalidDisclosureMask() public {
        vm.expectRevert(RegistryFactory.InvalidDisclosureMask.selector);
        factory.createRegistry("Bad", 1, 0x10);
    }

    function test_RegistriesAreIndependent() public {
        vm.prank(alice);
        address regA = factory.createRegistry("A", 1, 0);

        vm.prank(bob);
        address regB = factory.createRegistry("B", 3, 0x01);

        // Add CA to registry A only
        bytes32 caHash = bytes32(uint256(0xCAFE));
        vm.prank(alice);
        IdentityRegistry(regA).addCA(caHash);

        // Registry A has 1 CA, Registry B has 0
        assertEq(IdentityRegistry(regA).getCaCount(), 1);
        assertEq(IdentityRegistry(regB).getCaCount(), 0);
    }
}
