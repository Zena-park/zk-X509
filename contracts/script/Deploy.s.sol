// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

/// @notice Deployment script for the IdentityRegistry contract.
/// @dev Usage:
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
///
/// Environment variables:
///   SP1_VERIFIER_ADDRESS - Address of the deployed SP1 verifier contract
///   PROGRAM_VKEY         - Verification key from `cargo run --bin vkey`
///   CA_ROOT_HASH         - SHA-256 hash of the trusted CA public key
contract DeployScript is Script {
    function run() external {
        // Read configuration from environment
        address sp1Verifier = vm.envAddress("SP1_VERIFIER_ADDRESS");
        bytes32 programVKey = vm.envBytes32("PROGRAM_VKEY");

        console.log("SP1 Verifier:", sp1Verifier);
        console.log("Program VKey:");
        console.logBytes32(programVKey);

        vm.startBroadcast();

        // Deploy IdentityRegistry
        uint32 maxWallets = uint32(vm.envOr("MAX_WALLETS_PER_CERT", uint256(1)));
        IdentityRegistry registry = new IdentityRegistry(sp1Verifier, programVKey, maxWallets);
        console.log("Max wallets per cert:", maxWallets);
        console.log("IdentityRegistry deployed at:", address(registry));

        // Set CA Merkle root (if provided)
        try vm.envBytes32("CA_MERKLE_ROOT") returns (bytes32 merkleRoot) {
            registry.updateCaMerkleRoot(merkleRoot);
            console.log("Set CA Merkle root:");
            console.logBytes32(merkleRoot);
        } catch {
            console.log("WARNING: No CA_MERKLE_ROOT provided. register() will revert until set.");
        }

        vm.stopBroadcast();
    }
}
