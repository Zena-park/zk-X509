// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "sp1-contracts/ISP1Verifier.sol";

/// @title IdentityRegistry
/// @notice On-chain registry for ZK-verified X.509 certificate identities.
/// @dev Users prove they hold a valid certificate (signed by a trusted CA)
///      without revealing any personal data. A nullifier prevents double registration.
contract IdentityRegistry {
    // ============ State ============

    /// @notice The SP1 on-chain verifier contract.
    ISP1Verifier public immutable SP1_VERIFIER;

    /// @notice The verification key for the ZK X.509 program.
    bytes32 public immutable PROGRAM_V_KEY;

    /// @notice Merkle root of allowed CA set (hides which specific CA issued the cert).
    ///         Auto-computed from caLeaves[] when using addCA/removeCA.
    bytes32 public caMerkleRoot;

    /// @notice On-chain list of trusted CA hashes (SHA-256 of CA public key SPKI DER).
    ///         Anyone can read this to compute Merkle proofs for proof generation.
    bytes32[] public caLeaves;

    /// @notice CRL Merkle root (bytes32(0) = CRL checking disabled).
    bytes32 public crlMerkleRoot;

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

    /// @notice Maximum allowed age of a proof (adjustable by owner).
    uint256 public maxProofAge = 1 hours;

    uint256 public constant MIN_PROOF_AGE = 5 minutes;
    uint256 public constant MAX_PROOF_AGE_LIMIT = 24 hours;

    /// @notice Max wallets per certificate (1 = strict 1:1, N = multi-wallet).
    uint32 public immutable MAX_WALLETS_PER_CERT;

    // ============ Events ============

    event UserRegistered(address indexed user, bytes32 nullifier);
    event UserReRegistered(address indexed oldUser, address indexed newUser, bytes32 nullifier);
    event CaMerkleRootUpdated(bytes32 indexed newRoot);
    event CaAdded(bytes32 indexed caHash, uint256 index);
    event CaRemoved(bytes32 indexed caHash, uint256 index);
    event CrlMerkleRootUpdated(bytes32 indexed newRoot);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event IdentityRevoked(address indexed user, bytes32 indexed nullifier, bytes32 reason);
    event MaxProofAgeUpdated(uint256 oldAge, uint256 newAge);
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
    error CertAlreadyExpired(uint64 notAfter, uint256 blockTimestamp);
    error ChainIdMismatch(uint64 proofChainId, uint256 expectedChainId);
    error RegistryAddressMismatch(address proofRegistry, address expectedRegistry);
    error InvalidCrlMerkleRoot(bytes32 proofRoot, bytes32 expectedRoot);
    error ProofAgeOutOfRange(uint256 age, uint256 min, uint256 max);
    error ZeroCaHash();
    error CaIndexOutOfBounds(uint256 index, uint256 length);

    // ============ Modifiers ============

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert OnlyOwner();
    }

    modifier whenNotPaused() {
        _whenNotPaused();
        _;
    }

    function _whenNotPaused() internal view {
        if (paused) revert ContractPaused();
    }

    // ============ Constructor ============

    /// @param _sp1Verifier Address of the SP1 verifier contract.
    /// @param _programVKey The verification key for the ZK X.509 SP1 program.
    /// @param _maxWallets Max wallets per certificate (1 for DAO/voting, N for DeFi).
    constructor(address _sp1Verifier, bytes32 _programVKey, uint32 _maxWallets) {
        SP1_VERIFIER = ISP1Verifier(_sp1Verifier);
        PROGRAM_V_KEY = _programVKey;
        MAX_WALLETS_PER_CERT = _maxWallets;
        owner = msg.sender;
    }

    // ============ Internal ============

    /// @dev Shared validation: decode, check registrant, timestamp, CA, walletIndex, and verify proof.
    function _validateProof(
        bytes calldata proof,
        bytes calldata publicValues
    ) internal view returns (bytes32 nullifier, uint64 notAfter) {
        // Decode in two steps to avoid "stack too deep"
        bytes32 proofMerkleRoot;
        address registrant;
        uint64 proofTimestamp;
        uint32 walletIndex;
        (nullifier, proofMerkleRoot, proofTimestamp, registrant, walletIndex, notAfter) =
            abi.decode(publicValues, (bytes32, bytes32, uint64, address, uint32, uint64));

        if (registrant != msg.sender) revert RegistrantMismatch(registrant, msg.sender);
        if (proofTimestamp > block.timestamp) revert ProofInFuture(proofTimestamp, block.timestamp);
        if (block.timestamp - proofTimestamp > maxProofAge) revert ProofTooOld(proofTimestamp, block.timestamp);
        if (proofMerkleRoot != caMerkleRoot) revert InvalidCaMerkleRoot(proofMerkleRoot, caMerkleRoot);
        if (walletIndex >= MAX_WALLETS_PER_CERT) revert WalletIndexOutOfRange(walletIndex, MAX_WALLETS_PER_CERT);
        if (notAfter < block.timestamp) revert CertAlreadyExpired(notAfter, block.timestamp);

        // Decode remaining fields (chainId, registryAddress) in separate scope
        {
            // Skip first 6 fields (32+32+8+20+4+8 = 104 bytes padded to 6*32 = 192)
            (, , , , , , uint64 proofChainId, address proofRegistry) =
                abi.decode(publicValues, (bytes32, bytes32, uint64, address, uint32, uint64, uint64, address));
            if (proofChainId != uint64(block.chainid)) revert ChainIdMismatch(proofChainId, block.chainid);
            if (proofRegistry != address(this)) revert RegistryAddressMismatch(proofRegistry, address(this));
        }

        // Verify CRL Merkle root (if CRL checking is enabled)
        if (crlMerkleRoot != bytes32(0)) {
            (, , , , , , , , bytes32 proofCrlRoot) =
                abi.decode(publicValues, (bytes32, bytes32, uint64, address, uint32, uint64, uint64, address, bytes32));
            if (proofCrlRoot != crlMerkleRoot) revert InvalidCrlMerkleRoot(proofCrlRoot, crlMerkleRoot);
        }

        SP1_VERIFIER.verifyProof(PROGRAM_V_KEY, publicValues, proof);
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

    /// @notice Add a trusted CA to the on-chain list. Automatically recomputes caMerkleRoot.
    /// @param caHash SHA-256 hash of the CA's public key (SPKI DER format).
    function addCA(bytes32 caHash) external onlyOwner {
        if (caHash == bytes32(0)) revert ZeroCaHash();
        caLeaves.push(caHash);
        _recomputeCaMerkleRoot();
        emit CaAdded(caHash, caLeaves.length - 1);
    }

    /// @notice Remove a trusted CA by index. Swaps with last element and pops.
    ///         Automatically recomputes caMerkleRoot.
    /// @param index Index of the CA to remove in caLeaves array.
    function removeCA(uint256 index) external onlyOwner {
        uint256 len = caLeaves.length;
        if (index >= len) revert CaIndexOutOfBounds(index, len);
        bytes32 removed = caLeaves[index];
        caLeaves[index] = caLeaves[len - 1];
        caLeaves.pop();
        _recomputeCaMerkleRoot();
        emit CaRemoved(removed, index);
    }

    /// @notice Get the number of trusted CAs.
    function getCaCount() external view returns (uint256) {
        return caLeaves.length;
    }

    /// @notice Get all trusted CA hashes. Useful for off-chain Merkle proof generation.
    function getCaLeaves() external view returns (bytes32[] memory) {
        return caLeaves;
    }

    /// @notice Update the CRL Merkle root. Set bytes32(0) to disable CRL checking.
    /// @param newRoot The new CRL SMT root (from off-chain Relayer).
    function updateCrlMerkleRoot(bytes32 newRoot) external onlyOwner {
        crlMerkleRoot = newRoot;
        emit CrlMerkleRootUpdated(newRoot);
    }

    /// @notice Adjust the maximum proof age (bounded: 5 min to 24 hours).
    /// @param newAge New max proof age in seconds.
    function setMaxProofAge(uint256 newAge) external onlyOwner {
        if (newAge < MIN_PROOF_AGE || newAge > MAX_PROOF_AGE_LIMIT) {
            revert ProofAgeOutOfRange(newAge, MIN_PROOF_AGE, MAX_PROOF_AGE_LIMIT);
        }
        uint256 oldAge = maxProofAge;
        maxProofAge = newAge;
        emit MaxProofAgeUpdated(oldAge, newAge);
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

    // ============ Internal ============

    /// @dev Recompute caMerkleRoot from caLeaves[] using SHA-256 sorted-pair Merkle tree.
    ///      Same algorithm as zkVM (program/src/main.rs verify_merkle_membership).
    function _recomputeCaMerkleRoot() internal {
        uint256 len = caLeaves.length;
        if (len == 0) {
            caMerkleRoot = bytes32(0);
            emit CaMerkleRootUpdated(bytes32(0));
            return;
        }

        // Copy leaves to memory
        bytes32[] memory layer = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            layer[i] = caLeaves[i];
        }

        // Build tree bottom-up
        while (layer.length > 1) {
            uint256 newLen = (layer.length + 1) / 2;
            bytes32[] memory next = new bytes32[](newLen);
            for (uint256 i = 0; i < newLen; i++) {
                bytes32 left = layer[i * 2];
                bytes32 right = (i * 2 + 1 < layer.length) ? layer[i * 2 + 1] : left;
                // Sorted-pair hash: H(min(a,b) || max(a,b))
                if (left <= right) {
                    next[i] = sha256(abi.encodePacked(left, right));
                } else {
                    next[i] = sha256(abi.encodePacked(right, left));
                }
            }
            layer = next;
        }

        caMerkleRoot = layer[0];
        emit CaMerkleRootUpdated(layer[0]);
    }
}
