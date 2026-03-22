// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "./ISP1Verifier.sol";

/// @title IdentityRegistry
/// @notice On-chain registry for ZK-verified X.509 certificate identities.
/// @dev Users prove they hold a valid certificate (signed by a trusted CA)
///      without revealing any personal data. A nullifier prevents double registration.
contract IdentityRegistry {
    // ============ State ============

    /// @notice The SP1 on-chain verifier contract.
    ISP1Verifier public immutable sp1Verifier;

    /// @notice The verification key for the ZK X.509 program.
    bytes32 public immutable programVKey;

    /// @notice Whitelisted CA root hashes (SHA-256 of CA public key).
    mapping(bytes32 => bool) public validCARoots;

    /// @notice Used nullifiers (prevents double registration).
    mapping(bytes32 => bool) public nullifiers;

    /// @notice Verified wallet addresses.
    mapping(address => bool) public verifiedUsers;

    /// @notice Contract owner (for CA management).
    address public owner;

    // ============ Events ============

    event UserRegistered(address indexed user, bytes32 nullifier, bytes32 caRootHash);
    event CARootAdded(bytes32 indexed caRootHash);
    event CARootRemoved(bytes32 indexed caRootHash);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ Errors ============

    error UnsupportedCA(bytes32 caRootHash);
    error AlreadyRegistered(bytes32 nullifier);
    error UserAlreadyVerified(address user);
    error ProofTooOld(uint64 proofTimestamp, uint256 blockTimestamp);
    error ProofInFuture(uint64 proofTimestamp, uint256 blockTimestamp);
    error OnlyOwner();
    error ZeroAddress();

    /// @notice Maximum allowed age of a proof (1 hour).
    uint256 public constant MAX_PROOF_AGE = 1 hours;

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ============ Constructor ============

    /// @param _sp1Verifier Address of the SP1 verifier contract.
    /// @param _programVKey The verification key for the ZK X.509 SP1 program.
    constructor(address _sp1Verifier, bytes32 _programVKey) {
        sp1Verifier = ISP1Verifier(_sp1Verifier);
        programVKey = _programVKey;
        owner = msg.sender;
    }

    // ============ External Functions ============

    /// @notice Register a verified identity using a ZK proof of X.509 certificate ownership.
    /// @param proof The serialized ZK proof bytes.
    /// @param publicValues The ABI-encoded public values (nullifier, caRootHash, timestamp).
    function register(bytes calldata proof, bytes calldata publicValues) external {
        // 1. Decode public values
        (bytes32 nullifier, bytes32 caRootHash, uint64 proofTimestamp) =
            abi.decode(publicValues, (bytes32, bytes32, uint64));

        // 2. Verify proof timestamp is within acceptable range
        if (proofTimestamp > block.timestamp) revert ProofInFuture(proofTimestamp, block.timestamp);
        if (block.timestamp - proofTimestamp > MAX_PROOF_AGE) revert ProofTooOld(proofTimestamp, block.timestamp);

        // 3. Check CA is whitelisted
        if (!validCARoots[caRootHash]) revert UnsupportedCA(caRootHash);

        // 4. Check nullifier hasn't been used (no double registration)
        if (nullifiers[nullifier]) revert AlreadyRegistered(nullifier);

        // 5. Check user isn't already verified
        if (verifiedUsers[msg.sender]) revert UserAlreadyVerified(msg.sender);

        // 6. Verify the ZK proof on-chain
        sp1Verifier.verifyProof(programVKey, publicValues, proof);

        // 7. Update state
        nullifiers[nullifier] = true;
        verifiedUsers[msg.sender] = true;

        emit UserRegistered(msg.sender, nullifier, caRootHash);
    }

    /// @notice Check if a wallet address is verified.
    /// @param user The wallet address to check.
    /// @return True if the user has been verified.
    function isVerified(address user) external view returns (bool) {
        return verifiedUsers[user];
    }

    // ============ Admin Functions ============

    /// @notice Add a trusted CA root hash.
    /// @param caRootHash SHA-256 hash of the CA's public key.
    function addCARoot(bytes32 caRootHash) external onlyOwner {
        validCARoots[caRootHash] = true;
        emit CARootAdded(caRootHash);
    }

    /// @notice Remove a CA root hash from the whitelist.
    /// @param caRootHash SHA-256 hash of the CA's public key to remove.
    function removeCARoot(bytes32 caRootHash) external onlyOwner {
        validCARoots[caRootHash] = false;
        emit CARootRemoved(caRootHash);
    }

    /// @notice Transfer contract ownership.
    /// @param newOwner The new owner address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
