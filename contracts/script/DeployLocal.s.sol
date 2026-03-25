// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {RegistryFactory} from "../src/RegistryFactory.sol";
import {SP1Verifier} from "sp1-contracts/v6.0.0/SP1VerifierGroth16.sol";

contract DeployLocalScript is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy real SP1 Verifier
        SP1Verifier verifier = new SP1Verifier();
        console.log("SP1VerifierGroth16 (v6.0.0):", address(verifier));

        // Deploy RegistryFactory (deploys implementation + beacon internally)
        bytes32 vkey = vm.envOr("PROGRAM_V_KEY", bytes32(0x0072633ccccee97a9e508e3c73306048284a98ee1f7c32bd6a0eed5a407522f5));
        RegistryFactory factory = new RegistryFactory(address(verifier), vkey);
        console.log("RegistryFactory:", address(factory));
        console.log("Beacon:", address(factory.beacon()));

        // Deploy a standalone IdentityRegistry via the factory for backward compatibility
        uint32 maxWallets = uint32(vm.envOr("MAX_WALLETS_PER_CERT", uint256(1)));
        uint256 rawMask = vm.envOr("MIN_DISCLOSURE_MASK", uint256(0));
        require(rawMask <= 0x0F, "MIN_DISCLOSURE_MASK must be <= 0x0F");
        // casting to 'uint8' is safe because rawMask is validated <= 0x0F above
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 minDisclosureMask = uint8(rawMask);

        uint256 maxProofAge = vm.envOr("MAX_PROOF_AGE", uint256(3600));
        address registry = factory.createRegistry("Default", maxWallets, minDisclosureMask, maxProofAge);
        console.log("IdentityRegistry (proxy):", registry);

        // Set CA Merkle root if provided
        bytes32 caMerkleRoot = vm.envOr("CA_MERKLE_ROOT", bytes32(0));
        if (caMerkleRoot != bytes32(0)) {
            IdentityRegistry(registry).updateCaMerkleRoot(caMerkleRoot);
            console.log("CA Merkle Root:", vm.toString(caMerkleRoot));
        } else {
            console.log("CA Merkle Root: not set (use updateCaMerkleRoot after deployment)");
        }

        vm.stopBroadcast();
    }
}
