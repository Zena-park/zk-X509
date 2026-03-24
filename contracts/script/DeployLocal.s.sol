// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ISP1Verifier} from "../src/ISP1Verifier.sol";
import {SP1Verifier} from "sp1-contracts/v6.0.0/SP1VerifierGroth16.sol";

/// Mock verifier for local testing (always passes)
contract MockSP1Verifier is ISP1Verifier {
    function verifyProof(bytes32, bytes calldata, bytes calldata) external pure {}
}

contract DeployLocalScript is Script {
    function run() external {
        bool useMock = vm.envOr("USE_MOCK_VERIFIER", false);

        vm.startBroadcast();

        address verifierAddr;
        if (useMock) {
            MockSP1Verifier mockVerifier = new MockSP1Verifier();
            verifierAddr = address(mockVerifier);
            console.log("MockSP1Verifier:", verifierAddr);
        } else {
            SP1Verifier realVerifier = new SP1Verifier();
            verifierAddr = address(realVerifier);
            console.log("SP1VerifierGroth16 (v6.0.0):", verifierAddr);
        }

        // Deploy IdentityRegistry
        bytes32 vkey = 0x008382f44d5f06fc1f6280e9584abc5945d185352389fbab4dda8e40436fbdd8;
        uint32 maxWallets = uint32(vm.envOr("MAX_WALLETS_PER_CERT", uint256(1)));
        IdentityRegistry registry = new IdentityRegistry(verifierAddr, vkey, maxWallets);
        console.log("IdentityRegistry:", address(registry));

        // Set CA Merkle root if provided (otherwise owner calls updateCaMerkleRoot later)
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
