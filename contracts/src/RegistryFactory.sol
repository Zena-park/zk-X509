// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IdentityRegistry} from "./IdentityRegistry.sol";
import {ISP1Verifier} from "sp1-contracts/ISP1Verifier.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

/// @title RegistryFactory
/// @notice Factory for deploying independent IdentityRegistry instances as Beacon Proxies.
/// @dev Each deployed registry is fully independent with its own owner,
///      CA list, and configuration. The factory shares the SP1 verifier
///      and ZK program verification key across all registries.
///      All proxies share a single implementation via UpgradeableBeacon,
///      allowing the factory owner to upgrade all registries at once.
contract RegistryFactory {
    /// @notice Factory owner (can upgrade implementation and update settings).
    address public owner;

    /// @notice The shared SP1 verifier contract.
    ISP1Verifier public immutable SP1_VERIFIER;

    /// @notice The shared ZK program verification key.
    bytes32 public immutable PROGRAM_V_KEY;

    /// @notice The beacon that all registry proxies point to.
    UpgradeableBeacon public beacon;

    /// @notice All deployed registries (for enumeration).
    address[] public registries;

    /// @notice Quick lookup: is this address a registry deployed by this factory?
    mapping(address => bool) public isRegistry;

    /// @notice Metadata for each registry (immutable config snapshot at creation time).
    /// @dev `owner` reflects the initial creator. For current owner, call registry.owner() directly.
    struct RegistryInfo {
        address creator;
        string name;
        uint32 maxWallets;
        uint8 minDisclosureMask;
        uint256 maxProofAge;
        uint256 createdAt;
    }

    /// @notice Registry address → metadata.
    mapping(address => RegistryInfo) public registryInfo;

    // ============ Events ============

    event RegistryCreated(
        address indexed registry,
        address indexed owner,
        string name,
        uint32 maxWallets,
        uint8 minDisclosureMask
    );

    event ImplementationUpgraded(address indexed newImplementation);

    // ============ Errors ============

    error ZeroMaxWallets();
    error ZeroMaxProofAge();
    error InvalidDisclosureMask();
    error OnlyOwner();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ============ Constructor ============

    /// @param _sp1Verifier Address of the shared SP1 verifier contract.
    /// @param _programVKey The shared ZK program verification key.
    constructor(address _sp1Verifier, bytes32 _programVKey) {
        owner = msg.sender;
        SP1_VERIFIER = ISP1Verifier(_sp1Verifier);
        PROGRAM_V_KEY = _programVKey;

        // Deploy implementation + beacon (factory is beacon admin)
        address implementation = address(new IdentityRegistry());
        beacon = new UpgradeableBeacon(implementation, address(this));
    }

    // ============ External Functions ============

    /// @notice Deploy a new IdentityRegistry as a Beacon Proxy with the given configuration.
    /// @param name Human-readable name for the registry (e.g., "DAO Voting").
    /// @param maxWallets Max wallets per certificate (1 = strict, N = multi-wallet).
    /// @param minDisclosureMask Minimum disclosure bitmask (0x00 = none required).
    /// @param maxProofAge Maximum proof age in seconds (e.g., 3600 = 1 hour). Cannot be changed after deployment.
    /// @return registry The address of the newly deployed registry proxy.
    function createRegistry(
        string calldata name,
        uint32 maxWallets,
        uint8 minDisclosureMask,
        uint256 maxProofAge
    ) external returns (address registry) {
        if (maxWallets == 0) revert ZeroMaxWallets();
        if (minDisclosureMask > 0x0F) revert InvalidDisclosureMask();
        if (maxProofAge < 5 minutes || maxProofAge > 24 hours) revert ZeroMaxProofAge();

        // Encode the initialize call for the proxy
        bytes memory initData = abi.encodeCall(
            IdentityRegistry.initialize,
            (address(SP1_VERIFIER), PROGRAM_V_KEY, maxWallets, minDisclosureMask, maxProofAge, msg.sender)
        );

        BeaconProxy proxy = new BeaconProxy(address(beacon), initData);
        registry = address(proxy);

        registries.push(registry);
        isRegistry[registry] = true;
        registryInfo[registry] = RegistryInfo({
            creator: msg.sender,
            name: name,
            maxWallets: maxWallets,
            minDisclosureMask: minDisclosureMask,
            maxProofAge: maxProofAge,
            createdAt: block.timestamp
        });

        emit RegistryCreated(registry, msg.sender, name, maxWallets, minDisclosureMask);
    }

    /// @notice Upgrade all registries to a new implementation.
    /// @param newImplementation Address of the new IdentityRegistry implementation.
    function upgradeImplementation(address newImplementation) external onlyOwner {
        beacon.upgradeTo(newImplementation);
        emit ImplementationUpgraded(newImplementation);
    }

    // ============ View Functions ============

    /// @notice Get the total number of deployed registries.
    function getRegistryCount() external view returns (uint256) {
        return registries.length;
    }

    /// @notice Get all deployed registry addresses.
    /// @dev For large lists, use getRegistriesPaginated() to avoid gas limits.
    function getRegistries() external view returns (address[] memory) {
        return registries;
    }

    /// @notice Get a paginated slice of deployed registry addresses.
    /// @param offset Starting index.
    /// @param limit Maximum number of registries to return.
    function getRegistriesPaginated(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 total = registries.length;
        if (offset >= total) return new address[](0);
        uint256 remaining = total - offset;
        uint256 count = remaining < limit ? remaining : limit;
        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = registries[offset + i];
        }
        return result;
    }
}
