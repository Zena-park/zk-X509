// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {SP1Verifier} from "sp1-contracts/v6.0.0/SP1VerifierGroth16.sol";

contract DeployLocalScript is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy real SP1 Verifier
        SP1Verifier verifier = new SP1Verifier();
        console.log("SP1VerifierGroth16 (v6.0.0):", address(verifier));

        // Deploy IdentityRegistry
        bytes32 vkey = 0x008382f44d5f06fc1f6280e9584abc5945d185352389fbab4dda8e40436fbdd8;
        uint32 maxWallets = uint32(vm.envOr("MAX_WALLETS_PER_CERT", uint256(1)));
        IdentityRegistry registry = new IdentityRegistry(address(verifier), vkey, maxWallets);
        console.log("IdentityRegistry:", address(registry));

        // Set CA Merkle root if provided
        bytes32 caMerkleRoot = vm.envOr("CA_MERKLE_ROOT", bytes32(0));
        if (caMerkleRoot != bytes32(0)) {
            registry.updateCaMerkleRoot(caMerkleRoot);
            console.log("CA Merkle Root:", vm.toString(caMerkleRoot));
        } else {
            console.log("CA Merkle Root: not set (use updateCaMerkleRoot after deployment)");
        }

        vm.stopBroadcast();
    }
}
