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

    /// @notice Nullifier → registered wallet address (address(0) = unused).
    mapping(bytes32 => address) public nullifierOwner;

    /// @notice Nullifiers that have been permanently revoked by admin.
    mapping(bytes32 => bool) public revokedNullifiers;

    /// @notice Verified wallet addresses.
    mapping(address => bool) public verifiedUsers;

    /// @notice Contract owner (for CA management).
    address public owner;

    /// @notice Pending owner for 2-step transfer.
    address public pendingOwner;

    /// @notice Whether the contract is paused.
    bool public paused;

    /// @notice Maximum allowed age of a proof (1 hour).
    uint256 public constant MAX_PROOF_AGE = 1 hours;

    // ============ Events ============

    event UserRegistered(address indexed user, bytes32 nullifier, bytes32 caRootHash);
    event UserReRegistered(address indexed oldUser, address indexed newUser, bytes32 nullifier);
    event CARootAdded(bytes32 indexed caRootHash);
    event CARootRemoved(bytes32 indexed caRootHash);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event UserRevoked(address indexed user, bytes32 reason);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============ Errors ============

    error UnsupportedCA(bytes32 caRootHash);
    error AlreadyRegistered(bytes32 nullifier);
    error UserAlreadyVerified(address user);
    error ProofTooOld(uint64 proofTimestamp, uint256 blockTimestamp);
    error ProofInFuture(uint64 proofTimestamp, uint256 blockTimestamp);
    error RegistrantMismatch(address proofRegistrant, address actualSender);
    error OnlyOwner();
    error ZeroAddress();
    error ContractPaused();
    error UserNotVerified(address user);
    error NotPendingOwner();
    error NullifierNotRegistered(bytes32 nullifier);
    error NullifierRevoked(bytes32 nullifier);

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

    // ============ Internal ============

    /// @dev Shared validation: decode, check registrant, timestamp, CA, and verify proof.
    function _validateProof(
        bytes calldata proof,
        bytes calldata publicValues
    ) internal view returns (bytes32 nullifier, bytes32 caRootHash) {
        address registrant;
        uint64 proofTimestamp;
        (nullifier, caRootHash, proofTimestamp, registrant) =
            abi.decode(publicValues, (bytes32, bytes32, uint64, address));

        if (registrant != msg.sender) revert RegistrantMismatch(registrant, msg.sender);
        if (proofTimestamp > block.timestamp) revert ProofInFuture(proofTimestamp, block.timestamp);
        if (block.timestamp - proofTimestamp > MAX_PROOF_AGE) revert ProofTooOld(proofTimestamp, block.timestamp);
        if (!validCARoots[caRootHash]) revert UnsupportedCA(caRootHash);

        sp1Verifier.verifyProof(programVKey, publicValues, proof);
    }

    // ============ External Functions ============

    /// @notice Register a verified identity using a ZK proof of X.509 certificate ownership.
    function register(bytes calldata proof, bytes calldata publicValues) external whenNotPaused {
        (bytes32 nullifier, bytes32 caRootHash) = _validateProof(proof, publicValues);

        if (revokedNullifiers[nullifier]) revert NullifierRevoked(nullifier);
        if (nullifierOwner[nullifier] != address(0)) revert AlreadyRegistered(nullifier);
        if (verifiedUsers[msg.sender]) revert UserAlreadyVerified(msg.sender);

        nullifierOwner[nullifier] = msg.sender;
        verifiedUsers[msg.sender] = true;

        emit UserRegistered(msg.sender, nullifier, caRootHash);
    }

    /// @notice Re-register: move an existing certificate to a new wallet address.
    /// @dev No admin required. User proves ownership of the same certificate with a new wallet.
    ///      The old wallet is unverified and the new wallet takes over.
    ///      WARNING: If certificate files are compromised, an attacker could re-register
    ///      to their own wallet. This is by design — the certificate is the identity anchor.
    function reRegister(bytes calldata proof, bytes calldata publicValues) external whenNotPaused {
        (bytes32 nullifier, ) = _validateProof(proof, publicValues);

        if (revokedNullifiers[nullifier]) revert NullifierRevoked(nullifier);
        address oldOwner = nullifierOwner[nullifier];
        if (oldOwner == address(0)) revert NullifierNotRegistered(nullifier);
        if (verifiedUsers[msg.sender]) revert UserAlreadyVerified(msg.sender);

        if (oldOwner != msg.sender) {
            verifiedUsers[oldOwner] = false;
            nullifierOwner[nullifier] = msg.sender;
        }
        verifiedUsers[msg.sender] = true;

        emit UserReRegistered(oldOwner, msg.sender, nullifier);
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

    /// @notice Revoke an identity by nullifier. Permanently disables the nullifier
    ///         and unverifies the associated wallet. Cannot be undone.
    /// @param nullifier The nullifier to revoke.
    /// @param reason Reason code (e.g., keccak256("CERT_REVOKED")).
    function revokeIdentity(bytes32 nullifier, bytes32 reason) external onlyOwner {
        address user = nullifierOwner[nullifier];
        if (user == address(0)) revert NullifierNotRegistered(nullifier);
        verifiedUsers[user] = false;
        revokedNullifiers[nullifier] = true;
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
