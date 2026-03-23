//! Sorted Merkle Tree for CRL non-inclusion proofs.
//!
//! Instead of a full Sparse Merkle Tree (256-depth), we use a sorted
//! list of revoked serial hashes in a standard Merkle tree. Non-inclusion
//! is proven by showing two adjacent leaves where the target falls between.
//!
//! This is more efficient than SMT for the zkVM:
//! - Tree depth: log2(n) instead of 256
//! - Proof size: 2 * log2(n) hashes (two adjacent proofs)

use sha2::{Digest, Sha256};

pub type Hash = [u8; 32];

/// Sorted pair hash (same as merkle.rs)
fn hash_pair(a: &Hash, b: &Hash) -> Hash {
    let mut hasher = Sha256::new();
    if a <= b {
        hasher.update(a);
        hasher.update(b);
    } else {
        hasher.update(b);
        hasher.update(a);
    }
    hasher.finalize().into()
}

/// Non-inclusion proof: proves a key is NOT in the sorted leaf set.
/// Contains two adjacent leaves (left, right) where left < key < right,
/// plus their Merkle proofs to the root.
#[derive(Clone, Debug)]
pub struct NonInclusionProof {
    /// The leaf immediately before the target (or [0; 32] if target < all leaves)
    pub left_leaf: Hash,
    /// The leaf immediately after the target (or [0xff; 32] if target > all leaves)
    pub right_leaf: Hash,
    /// Merkle proof for left_leaf
    pub left_proof: Vec<Hash>,
    /// Merkle proof for right_leaf
    pub right_proof: Vec<Hash>,
    /// Index of left_leaf in the sorted array
    pub left_index: usize,
    /// Index of right_leaf in the sorted array
    pub right_index: usize,
}

/// CRL Merkle Tree: sorted revoked serial hashes with non-inclusion proofs.
pub struct CrlMerkleTree {
    /// Sorted leaf hashes: H(serial_number) for each revoked serial
    leaves: Vec<Hash>,
    /// All tree layers (layers[0] = leaves, layers[last] = [root])
    layers: Vec<Vec<Hash>>,
}

/// Sentinel values for boundary proofs
const MIN_SENTINEL: Hash = [0u8; 32];
const MAX_SENTINEL: Hash = [0xffu8; 32];

impl CrlMerkleTree {
    /// Build from a list of revoked serial numbers (raw bytes).
    /// Serials are hashed and sorted for deterministic ordering.
    pub fn from_revoked_serials(serials: &[Vec<u8>]) -> Self {
        let mut leaves: Vec<Hash> = serials
            .iter()
            .map(|s| Sha256::digest(s).into())
            .collect();

        // Add sentinels for boundary proofs
        leaves.push(MIN_SENTINEL);
        leaves.push(MAX_SENTINEL);

        // Sort for deterministic ordering + binary search
        leaves.sort();
        leaves.dedup();

        let layers = build_layers(&leaves);

        Self { leaves, layers }
    }

    /// Build from an empty CRL (no revoked serials).
    pub fn empty() -> Self {
        Self::from_revoked_serials(&[])
    }

    /// Get the Merkle root.
    pub fn root(&self) -> Hash {
        self.layers.last().unwrap()[0]
    }

    /// Check if a serial number is revoked (in the tree).
    pub fn is_revoked(&self, serial: &[u8]) -> bool {
        let key: Hash = Sha256::digest(serial).into();
        self.leaves.binary_search(&key).is_ok()
    }

    /// Generate a non-inclusion proof for a serial number.
    /// Panics if the serial IS in the revoked list.
    pub fn prove_non_inclusion(&self, serial: &[u8]) -> NonInclusionProof {
        let key: Hash = Sha256::digest(serial).into();

        // Binary search: find where key would be inserted
        let insert_pos = match self.leaves.binary_search(&key) {
            Ok(_) => panic!("Serial is revoked — cannot generate non-inclusion proof"),
            Err(pos) => pos,
        };

        // Adjacent leaves: left < key < right
        let left_index = insert_pos - 1; // MIN_SENTINEL guarantees this exists
        let right_index = insert_pos;     // MAX_SENTINEL guarantees this exists

        let left_leaf = self.leaves[left_index];
        let right_leaf = self.leaves[right_index];

        let left_proof = self.merkle_proof(left_index);
        let right_proof = self.merkle_proof(right_index);

        NonInclusionProof {
            left_leaf,
            right_leaf,
            left_proof,
            right_proof,
            left_index,
            right_index,
        }
    }

    /// Generate Merkle proof for a leaf at given index.
    fn merkle_proof(&self, leaf_index: usize) -> Vec<Hash> {
        let mut proof = Vec::new();
        let mut idx = leaf_index;

        for layer in &self.layers[..self.layers.len() - 1] {
            let sibling_idx = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
            let sibling = if sibling_idx < layer.len() {
                layer[sibling_idx]
            } else {
                layer[idx] // odd: duplicate
            };
            proof.push(sibling);
            idx /= 2;
        }

        proof
    }
}

/// Build Merkle tree layers from leaves.
fn build_layers(leaves: &[Hash]) -> Vec<Vec<Hash>> {
    assert!(!leaves.is_empty());

    let mut layers: Vec<Vec<Hash>> = vec![leaves.to_vec()];

    while layers.last().unwrap().len() > 1 {
        let current = layers.last().unwrap();
        let mut next = Vec::with_capacity((current.len() + 1) / 2);
        for i in (0..current.len()).step_by(2) {
            if i + 1 < current.len() {
                next.push(hash_pair(&current[i], &current[i + 1]));
            } else {
                next.push(hash_pair(&current[i], &current[i]));
            }
        }
        layers.push(next);
    }

    layers
}

/// Verify a non-inclusion proof against a root.
/// Used both host-side (testing) and inside zkVM.
pub fn verify_non_inclusion(
    serial: &[u8],
    proof: &NonInclusionProof,
    expected_root: &Hash,
) -> bool {
    let key: Hash = Sha256::digest(serial).into();

    // 1. Check ordering: left < key < right
    if proof.left_leaf >= key || key >= proof.right_leaf {
        return false;
    }

    // 2. Check adjacency: right_index == left_index + 1
    if proof.right_index != proof.left_index + 1 {
        return false;
    }

    // 3. Verify left_leaf's Merkle proof
    let left_root = compute_root(&proof.left_leaf, &proof.left_proof);
    if left_root != *expected_root {
        return false;
    }

    // 4. Verify right_leaf's Merkle proof
    let right_root = compute_root(&proof.right_leaf, &proof.right_proof);
    if right_root != *expected_root {
        return false;
    }

    true
}

/// Recompute Merkle root from a leaf and its proof path.
fn compute_root(leaf: &Hash, proof: &[Hash]) -> Hash {
    let mut current = *leaf;
    for sibling in proof {
        current = hash_pair(&current, sibling);
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_crl() {
        let tree = CrlMerkleTree::empty();
        assert!(!tree.is_revoked(b"any_serial"));

        let proof = tree.prove_non_inclusion(b"any_serial");
        assert!(verify_non_inclusion(b"any_serial", &proof, &tree.root()));
    }

    #[test]
    fn test_single_revoked() {
        let tree = CrlMerkleTree::from_revoked_serials(&[b"revoked_001".to_vec()]);

        assert!(tree.is_revoked(b"revoked_001"));
        assert!(!tree.is_revoked(b"valid_001"));

        let proof = tree.prove_non_inclusion(b"valid_001");
        assert!(verify_non_inclusion(b"valid_001", &proof, &tree.root()));
    }

    #[test]
    #[should_panic(expected = "Serial is revoked")]
    fn test_prove_revoked_panics() {
        let tree = CrlMerkleTree::from_revoked_serials(&[b"revoked_001".to_vec()]);
        tree.prove_non_inclusion(b"revoked_001"); // should panic
    }

    #[test]
    fn test_multiple_revoked() {
        let revoked = vec![
            b"serial_100".to_vec(),
            b"serial_200".to_vec(),
            b"serial_300".to_vec(),
        ];
        let tree = CrlMerkleTree::from_revoked_serials(&revoked);

        // Revoked serials
        assert!(tree.is_revoked(b"serial_100"));
        assert!(tree.is_revoked(b"serial_200"));
        assert!(tree.is_revoked(b"serial_300"));

        // Valid serials — prove non-inclusion
        for valid in &[b"serial_050", b"serial_150", b"serial_250", b"serial_999"] {
            assert!(!tree.is_revoked(*valid));
            let proof = tree.prove_non_inclusion(*valid);
            assert!(
                verify_non_inclusion(*valid, &proof, &tree.root()),
                "Non-inclusion proof failed for {:?}", valid
            );
        }
    }

    #[test]
    fn test_wrong_serial_fails_verification() {
        // Create tree where valid_001 and revoked_001 are on different sides of a revoked entry
        let tree = CrlMerkleTree::from_revoked_serials(&[
            b"aaa".to_vec(), b"mmm".to_vec(), b"zzz".to_vec(),
        ]);
        let proof = tree.prove_non_inclusion(b"bbb"); // between "aaa" and "mmm"

        // A revoked serial should fail verification (ordering check)
        assert!(!verify_non_inclusion(b"aaa", &proof, &tree.root()));
    }

    #[test]
    fn test_wrong_root_fails() {
        let tree = CrlMerkleTree::from_revoked_serials(&[b"revoked_001".to_vec()]);
        let proof = tree.prove_non_inclusion(b"valid_001");

        let fake_root: Hash = [0xAA; 32];
        assert!(!verify_non_inclusion(b"valid_001", &proof, &fake_root));
    }

    #[test]
    fn test_large_crl() {
        let revoked: Vec<Vec<u8>> = (0..1000u32)
            .map(|i| format!("revoked_{:06}", i).into_bytes())
            .collect();
        let tree = CrlMerkleTree::from_revoked_serials(&revoked);

        // Check some revoked
        assert!(tree.is_revoked(b"revoked_000000"));
        assert!(tree.is_revoked(b"revoked_000500"));
        assert!(tree.is_revoked(b"revoked_000999"));

        // Prove non-inclusion for valid serials
        for i in [1001, 2000, 9999] {
            let serial = format!("valid_{:06}", i);
            let proof = tree.prove_non_inclusion(serial.as_bytes());
            assert!(
                verify_non_inclusion(serial.as_bytes(), &proof, &tree.root()),
                "Failed for {}", serial
            );
        }
    }

    #[test]
    fn test_deterministic_root() {
        let revoked = vec![b"a".to_vec(), b"b".to_vec()];
        let tree1 = CrlMerkleTree::from_revoked_serials(&revoked);
        let tree2 = CrlMerkleTree::from_revoked_serials(&revoked);
        assert_eq!(tree1.root(), tree2.root());
    }

    #[test]
    fn test_order_independent() {
        let tree1 = CrlMerkleTree::from_revoked_serials(&[b"b".to_vec(), b"a".to_vec()]);
        let tree2 = CrlMerkleTree::from_revoked_serials(&[b"a".to_vec(), b"b".to_vec()]);
        assert_eq!(tree1.root(), tree2.root(), "Root should be order-independent");
    }
}
