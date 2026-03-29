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
        // Deploy with no platform fee (free mode for local development)
        RegistryFactory factory = new RegistryFactory(address(verifier), vkey, address(0), 0, address(0));
        console.log("RegistryFactory:", address(factory));
        console.log("Beacon:", address(factory.beacon()));

        // Registry is no longer auto-created. Use the frontend or CLI to create one via factory.createRegistry().

        vm.stopBroadcast();
    }
}
