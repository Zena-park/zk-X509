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

    /// @notice Merkle root of allowed CA set (hides which specific CA issued the cert).
    bytes32 public caMerkleRoot;

    /// @notice Nullifier → registered wallet address (address(0) = unused).
    mapping(bytes32 => address) public nullifierOwner;

    /// @notice Nullifiers that have been permanently revoked by admin.
    mapping(bytes32 => bool) public revokedNullifiers;

    /// @notice Verified wallet addresses → certificate expiry timestamp (0 = unverified).
    mapping(address => uint64) public verifiedUntil;

    /// @notice Contract owner (for CA management).
    address public owner;

    /// @notice Pending owner for 2-step transfer.
    address public pendingOwner;

    /// @notice Whether the contract is paused.
    bool public paused;

    /// @notice Maximum allowed age of a proof (1 hour).
    uint256 public constant MAX_PROOF_AGE = 1 hours;

    /// @notice Max wallets per certificate (1 = strict 1:1, N = multi-wallet).
    uint32 public immutable maxWalletsPerCert;

    // ============ Events ============

    event UserRegistered(address indexed user, bytes32 nullifier);
    event UserReRegistered(address indexed oldUser, address indexed newUser, bytes32 nullifier);
    event CaMerkleRootUpdated(bytes32 indexed newRoot);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event IdentityRevoked(address indexed user, bytes32 indexed nullifier, bytes32 reason);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============ Errors ============

    error InvalidCaMerkleRoot(bytes32 proofRoot, bytes32 expectedRoot);
    error ZeroMerkleRoot();
    error AlreadyRegistered(bytes32 nullifier);
    error UserAlreadyVerified(address user);
    error ProofTooOld(uint64 proofTimestamp, uint256 blockTimestamp);
    error ProofInFuture(uint64 proofTimestamp, uint256 blockTimestamp);
    error RegistrantMismatch(address proofRegistrant, address actualSender);
    error OnlyOwner();
    error ZeroAddress();
    error ContractPaused();
    error NotPendingOwner();
    error NullifierNotRegistered(bytes32 nullifier);
    error NullifierRevoked(bytes32 nullifier);
    error WalletIndexOutOfRange(uint32 walletIndex, uint32 maxAllowed);

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
    /// @param _maxWallets Max wallets per certificate (1 for DAO/voting, N for DeFi).
    constructor(address _sp1Verifier, bytes32 _programVKey, uint32 _maxWallets) {
        sp1Verifier = ISP1Verifier(_sp1Verifier);
        programVKey = _programVKey;
        maxWalletsPerCert = _maxWallets;
        owner = msg.sender;
    }

    // ============ Internal ============

    /// @dev Shared validation: decode, check registrant, timestamp, CA, walletIndex, and verify proof.
    function _validateProof(
        bytes calldata proof,
        bytes calldata publicValues
    ) internal view returns (bytes32 nullifier, uint64 notAfter) {
        bytes32 proofMerkleRoot;
        address registrant;
        uint64 proofTimestamp;
        uint32 walletIndex;
        (nullifier, proofMerkleRoot, proofTimestamp, registrant, walletIndex, notAfter) =
            abi.decode(publicValues, (bytes32, bytes32, uint64, address, uint32, uint64));

        if (registrant != msg.sender) revert RegistrantMismatch(registrant, msg.sender);
        if (proofTimestamp > block.timestamp) revert ProofInFuture(proofTimestamp, block.timestamp);
        if (block.timestamp - proofTimestamp > MAX_PROOF_AGE) revert ProofTooOld(proofTimestamp, block.timestamp);
        if (proofMerkleRoot != caMerkleRoot) revert InvalidCaMerkleRoot(proofMerkleRoot, caMerkleRoot);
        if (walletIndex >= maxWalletsPerCert) revert WalletIndexOutOfRange(walletIndex, maxWalletsPerCert);

        sp1Verifier.verifyProof(programVKey, publicValues, proof);
    }

    // ============ External Functions ============

    /// @notice Register a verified identity using a ZK proof of X.509 certificate ownership.
    function register(bytes calldata proof, bytes calldata publicValues) external whenNotPaused {
        // Check sender not already verified first (cheapest common revert, avoids proof verification gas)
        if (verifiedUntil[msg.sender] >= block.timestamp) revert UserAlreadyVerified(msg.sender);

        (bytes32 nullifier, uint64 notAfter) = _validateProof(proof, publicValues);

        if (revokedNullifiers[nullifier]) revert NullifierRevoked(nullifier);
        if (nullifierOwner[nullifier] != address(0)) revert AlreadyRegistered(nullifier);

        nullifierOwner[nullifier] = msg.sender;
        verifiedUntil[msg.sender] = notAfter;

        emit UserRegistered(msg.sender, nullifier);
    }

    /// @notice Re-register: move an existing nullifier slot to a new wallet address.
    /// @dev No admin required. User proves ownership of the same certificate with a new wallet.
    ///      The old wallet's verification is cleared and the new wallet takes over.
    ///      WARNING: If certificate files are compromised, an attacker could re-register
    ///      to their own wallet. This is by design — the certificate is the identity anchor.
    function reRegister(bytes calldata proof, bytes calldata publicValues) external whenNotPaused {
        // Early revert before expensive proof verification (same pattern as register)
        if (verifiedUntil[msg.sender] >= block.timestamp) revert UserAlreadyVerified(msg.sender);

        (bytes32 nullifier, uint64 notAfter) = _validateProof(proof, publicValues);

        if (revokedNullifiers[nullifier]) revert NullifierRevoked(nullifier);
        address oldOwner = nullifierOwner[nullifier];
        if (oldOwner == address(0)) revert NullifierNotRegistered(nullifier);

        if (oldOwner != msg.sender) {
            verifiedUntil[oldOwner] = 0;
            nullifierOwner[nullifier] = msg.sender;
        }
        verifiedUntil[msg.sender] = notAfter;

        emit UserReRegistered(oldOwner, msg.sender, nullifier);
    }

    /// @notice Check if a wallet address is currently verified (not expired).
    /// @param user The wallet address to check.
    /// @return True if the user is verified and certificate has not expired.
    function isVerified(address user) external view returns (bool) {
        return verifiedUntil[user] >= block.timestamp;
    }

    // ============ Admin Functions ============

    /// @notice Update the Merkle root of the allowed CA set.
    /// @dev Recompute off-chain from the full CA list and submit the new root.
    ///      Existing proofs generated with the old root will be rejected.
    /// @param newRoot The new Merkle root of the allowed CA hashes.
    function updateCaMerkleRoot(bytes32 newRoot) external onlyOwner {
        if (newRoot == bytes32(0)) revert ZeroMerkleRoot();
        caMerkleRoot = newRoot;
        emit CaMerkleRootUpdated(newRoot);
    }

    /// @notice Revoke an identity by nullifier. Permanently disables the nullifier
    ///         and unverifies the associated wallet. Cannot be undone.
    /// @param nullifier The nullifier to revoke.
    /// @param reason Reason code (e.g., keccak256("CERT_REVOKED")).
    function revokeIdentity(bytes32 nullifier, bytes32 reason) external onlyOwner {
        address user = nullifierOwner[nullifier];
        if (user == address(0)) revert NullifierNotRegistered(nullifier);
        verifiedUntil[user] = 0;
        revokedNullifiers[nullifier] = true;
        emit IdentityRevoked(user, nullifier, reason);
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
