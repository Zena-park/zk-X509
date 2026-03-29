// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {RegistryFactory} from "../src/RegistryFactory.sol";

/// @notice Creates a sample registry + optional CA registration for local testing.
///         Run AFTER DeployLocal.s.sol.
///
/// Usage:
///   FACTORY=0x... forge script script/SeedLocal.s.sol --tc SeedLocalScript \
///     --rpc-url http://localhost:8545 --broadcast \
///     --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
contract SeedLocalScript is Script {
    function run() external {
        address factoryAddr = vm.envAddress("FACTORY");
        RegistryFactory factory = RegistryFactory(factoryAddr);

        // Registry parameters (configurable via env)
        string memory name = vm.envOr("SERVICE_NAME", string("Default"));
        uint32 maxWallets = uint32(vm.envOr("MAX_WALLETS_PER_CERT", uint256(1)));
        uint256 rawMask = vm.envOr("MIN_DISCLOSURE_MASK", uint256(0));
        require(rawMask <= 0x0F, "MIN_DISCLOSURE_MASK must be <= 0x0F");
        // forge-lint: disable-next-line(unsafe-typecast)        uint8 minDisclosureMask = uint8(rawMask);
        uint256 maxProofAge = vm.envOr("MAX_PROOF_AGE", uint256(3600));

        vm.startBroadcast();

        address registry = factory.createRegistry(name, maxWallets, minDisclosureMask, maxProofAge);
        console.log("IdentityRegistry (proxy):", registry);
        console.log("  Name:", name);
        console.log("  Max Wallets:", maxWallets);
        console.log("  Min Disclosure Mask:", rawMask);
        console.log("  Max Proof Age:", maxProofAge);

        // Optional: set CA Merkle root
        bytes32 caMerkleRoot = vm.envOr("CA_MERKLE_ROOT", bytes32(0));
        if (caMerkleRoot != bytes32(0)) {
            IdentityRegistry(registry).updateCaMerkleRoot(caMerkleRoot);
            console.log("  CA Merkle Root:", vm.toString(caMerkleRoot));
        } else {
            console.log("  CA Merkle Root: not set (register CAs via frontend or CLI)");
        }

        vm.stopBroadcast();
    }
}
