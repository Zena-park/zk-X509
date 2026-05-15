// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RegistryFactory} from "../src/RegistryFactory.sol";
import {SP1Verifier} from "sp1-contracts/v6.0.0/SP1VerifierGroth16.sol";

contract DeployLocalScript is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy real SP1 Verifier
        SP1Verifier verifier = new SP1Verifier();
        console.log("SP1VerifierGroth16 (v6.0.0):", address(verifier));

        // Deploy RegistryFactory (deploys implementation + beacon internally).
        //
        // PROGRAM_V_KEY is REQUIRED — no in-script default. A baked-in literal
        // here goes stale every time the SP1 program is rebuilt (the ELF VK is
        // derived from program bytecode and the SP1 SDK version), and a stale
        // VK on the factory makes every Groth16 proof revert with
        // `ProofInvalid()` from the underlying verifier when users try to
        // register — an opaque failure mode that wastes time tracing.
        //
        // Callers (notably `script/deploy-on-existing-anvil.sh`) must extract
        // the live ELF VK first via the `script::vkey` binary and pass it:
        //   PROGRAM_V_KEY=0x… forge script script/DeployLocal.s.sol …
        // Without it, `vm.envBytes32` reverts the script before any contract
        // is deployed — fail-fast beats deploying a registry that will only
        // surface the mismatch much later inside a user's wallet UI.
        bytes32 vkey = vm.envBytes32("PROGRAM_V_KEY");
        // Deploy with no platform fee (free mode for local development)
        RegistryFactory factory = new RegistryFactory(address(verifier), vkey, address(0), 0, address(0));
        console.log("RegistryFactory:", address(factory));
        console.log("Beacon:", address(factory.beacon()));

        // Registry is no longer auto-created. Use SeedLocal.s.sol or the frontend to create one via factory.createRegistry().

        vm.stopBroadcast();
    }
}
