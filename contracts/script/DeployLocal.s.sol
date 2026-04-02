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

        // Deploy RegistryFactory (deploys implementation + beacon internally)
        bytes32 vkey = vm.envOr("PROGRAM_V_KEY", bytes32(0x001f3272fa4043ac0b428241e62131888f8ce4b3208f425e46b991c890c57d13));
        // Deploy with no platform fee (free mode for local development)
        RegistryFactory factory = new RegistryFactory(address(verifier), vkey, address(0), 0, address(0));
        console.log("RegistryFactory:", address(factory));
        console.log("Beacon:", address(factory.beacon()));

        // Registry is no longer auto-created. Use SeedLocal.s.sol or the frontend to create one via factory.createRegistry().

        vm.stopBroadcast();
    }
}
