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

    /// @notice Pending owner for 2-step transfer.
    address public pendingOwner;

    /// @notice Whether the contract is paused.
    bool public paused;

    // ============ Events ============

    event UserRegistered(address indexed user, bytes32 nullifier, bytes32 caRootHash);
    event CARootAdded(bytes32 indexed caRootHash);
    event CARootRemoved(bytes32 indexed caRootHash);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event UserRevoked(address indexed user, string reason);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============ Errors ============

    error UnsupportedCA(bytes32 caRootHash);
    error AlreadyRegistered(bytes32 nullifier);
    error UserAlreadyVerified(address user);
    error ProofTooOld(uint64 proofTimestamp, uint256 blockTimestamp);
    error ProofInFuture(uint64 proofTimestamp, uint256 blockTimestamp);
    error OnlyOwner();
    error ZeroAddress();
    error ContractPaused();
    error UserNotVerified(address user);
    error NotPendingOwner();

    /// @notice Maximum allowed age of a proof (1 hour).
    uint256 public constant MAX_PROOF_AGE = 1 hours;

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
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
    function register(bytes calldata proof, bytes calldata publicValues) external whenNotPaused {
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

    /// @notice Revoke a verified user's identity (e.g., cert expired/revoked).
    /// @param user The wallet address to revoke.
    /// @param reason Human-readable reason for revocation.
    function revokeUser(address user, string calldata reason) external onlyOwner {
        if (!verifiedUsers[user]) revert UserNotVerified(user);
        verifiedUsers[user] = false;
        emit UserRevoked(user, reason);
    }

    /// @notice Pause the contract (emergency stop).
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Unpause the contract.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Initiate ownership transfer (2-step: propose then accept).
    /// @param newOwner The proposed new owner address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
    }

    /// @notice Accept ownership transfer (must be called by pendingOwner).
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
