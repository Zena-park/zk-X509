// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ISP1Verifier} from "../src/ISP1Verifier.sol";

/// Mock verifier for local testing (always passes)
contract MockSP1Verifier is ISP1Verifier {
    function verifyProof(bytes32, bytes calldata, bytes calldata) external pure {}
}

contract DeployLocalScript is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy mock verifier
        MockSP1Verifier mockVerifier = new MockSP1Verifier();
        console.log("MockSP1Verifier:", address(mockVerifier));

        // Deploy IdentityRegistry
        bytes32 vkey = 0x008382f44d5f06fc1f6280e9584abc5945d185352389fbab4dda8e40436fbdd8;
        uint32 maxWallets = uint32(vm.envOr("MAX_WALLETS_PER_CERT", uint256(1)));
        IdentityRegistry registry = new IdentityRegistry(address(mockVerifier), vkey, maxWallets);
        console.log("IdentityRegistry:", address(registry));

        // Set CA Merkle root (compute off-chain from allowed CA hashes)
        bytes32 caMerkleRoot = vm.envOr("CA_MERKLE_ROOT", bytes32(0x5dfedc0a984f5720b81b7f2a73ed6028858ce6c4c6305e8abff0aba33dd0d468));
        registry.updateCaMerkleRoot(caMerkleRoot);
        console.log("Set CA Merkle root");

        vm.stopBroadcast();
    }
}
