//! SHA-256 Merkle tree for CA root anonymous verification.
//!
//! Builds a binary Merkle tree from CA root hashes.
//! Sorted pair hashing: H(min(a,b) ‖ max(a,b)) prevents second preimage attacks.
//! Compatible with the zkVM program's verification logic.

use sha2::{Digest, Sha256};

/// A leaf is a 32-byte SHA-256 hash of a CA's public key (SPKI DER).
pub type Hash = [u8; 32];

/// Sorted-pair hash: H(min(a,b) ‖ max(a,b)).
/// Ensures the same result regardless of child ordering.
pub fn hash_pair(a: &Hash, b: &Hash) -> Hash {
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

/// Build a Merkle tree from a list of leaf hashes.
/// Returns all layers: layers[0] = leaves, layers[last] = [root].
/// If the number of nodes at any level is odd, the last node is duplicated.
pub fn build_tree(leaves: &[Hash]) -> Result<Vec<Vec<Hash>>, String> {
    if leaves.is_empty() {
        return Err("Cannot build Merkle tree from empty leaves".to_string());
    }

    let mut layers: Vec<Vec<Hash>> = vec![leaves.to_vec()];

    while layers.last().unwrap().len() > 1 {
        let current = layers.last().unwrap();
        let mut next = Vec::with_capacity((current.len() + 1) / 2);
        for i in (0..current.len()).step_by(2) {
            if i + 1 < current.len() {
                next.push(hash_pair(&current[i], &current[i + 1]));
            } else {
                // Odd node: duplicate
                next.push(hash_pair(&current[i], &current[i]));
            }
        }
        layers.push(next);
    }

    Ok(layers)
}

/// Compute the Merkle root from a list of leaf hashes.
pub fn merkle_root(leaves: &[Hash]) -> Result<Hash, String> {
    let layers = build_tree(leaves)?;
    Ok(layers.last().unwrap()[0])
}

/// Generate Merkle root + proof in a single tree build.
pub fn merkle_root_and_proof(leaves: &[Hash], leaf_index: usize) -> Result<(Hash, Vec<Hash>), String> {
    if leaf_index >= leaves.len() {
        return Err(format!("leaf_index {} out of range (len {})", leaf_index, leaves.len()));
    }
    let layers = build_tree(leaves)?;
    let root = layers.last().unwrap()[0];
    let proof = extract_proof_from_layers(&layers, leaf_index);
    Ok((root, proof))
}

/// Generate a Merkle proof (sibling hashes) for a leaf at the given index.
/// For the zkVM, we only need the sibling hashes — direction is implicit
/// from sorted-pair hashing.
pub fn merkle_proof(leaves: &[Hash], leaf_index: usize) -> Result<Vec<Hash>, String> {
    if leaf_index >= leaves.len() {
        return Err(format!("leaf_index {} out of range (len {})", leaf_index, leaves.len()));
    }
    let layers = build_tree(leaves)?;
    Ok(extract_proof_from_layers(&layers, leaf_index))
}

/// Extract proof path from pre-built tree layers.
fn extract_proof_from_layers(layers: &[Vec<Hash>], leaf_index: usize) -> Vec<Hash> {
    let mut proof = Vec::new();
    let mut idx = leaf_index;

    for layer in &layers[..layers.len() - 1] {
        let sibling_idx = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
        let sibling = if sibling_idx < layer.len() {
            layer[sibling_idx]
        } else {
            layer[idx]
        };
        proof.push(sibling);
        idx /= 2;
    }

    proof
}

/// Hash a CA public key (SPKI DER), build a Merkle tree, and return (leaf, root, proof).
/// The CA leaf is placed at index 0; any `extra_ca_hashes` are appended as additional leaves.
/// If `extra_ca_hashes` is empty, root == leaf and proof is empty.
pub fn ca_merkle_tree(ca_pub_key: &[u8], extra_ca_hashes: &[Hash]) -> Result<(Hash, Hash, Vec<Hash>), String> {
    let ca_leaf: Hash = Sha256::digest(ca_pub_key).into();
    let mut leaves = vec![ca_leaf];
    leaves.extend_from_slice(extra_ca_hashes);
    let (root, proof) = merkle_root_and_proof(&leaves, 0)?;
    Ok((ca_leaf, root, proof))
}

/// Verify a Merkle proof: recompute root from leaf + proof, compare to expected.
pub fn verify_proof(leaf: &Hash, proof: &[Hash], expected_root: &Hash) -> bool {
    let mut current = *leaf;
    for sibling in proof {
        current = hash_pair(&current, sibling);
    }
    current == *expected_root
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hash_ca(data: &[u8]) -> Hash {
        Sha256::digest(data).into()
    }

    #[test]
    fn test_empty_leaves_returns_error() {
        assert!(build_tree(&[]).is_err());
        assert!(merkle_root(&[]).is_err());
    }

    #[test]
    fn test_single_leaf() {
        let leaf = hash_ca(b"CA_ROOT_1");
        let root = merkle_root(&[leaf]).unwrap();
        // Single leaf: root IS the leaf (no hashing needed)
        assert_eq!(root, leaf);

        let proof = merkle_proof(&[leaf], 0).unwrap();
        assert!(proof.is_empty());
        assert!(verify_proof(&leaf, &proof, &root));
    }

    #[test]
    fn test_two_leaves() {
        let a = hash_ca(b"CA_ROOT_1");
        let b = hash_ca(b"CA_ROOT_2");
        let root = merkle_root(&[a, b]).unwrap();
        assert_eq!(root, hash_pair(&a, &b));
    }

    #[test]
    fn test_proof_two_leaves() {
        let a = hash_ca(b"CA_ROOT_1");
        let b = hash_ca(b"CA_ROOT_2");
        let root = merkle_root(&[a, b]).unwrap();

        let proof_a = merkle_proof(&[a, b], 0).unwrap();
        assert!(verify_proof(&a, &proof_a, &root));

        let proof_b = merkle_proof(&[a, b], 1).unwrap();
        assert!(verify_proof(&b, &proof_b, &root));
    }

    #[test]
    fn test_proof_three_leaves() {
        let a = hash_ca(b"CA_KR");
        let b = hash_ca(b"CA_US");
        let c = hash_ca(b"CA_JP");
        let leaves = [a, b, c];
        let root = merkle_root(&leaves).unwrap();

        for i in 0..3 {
            let proof = merkle_proof(&leaves, i).unwrap();
            assert!(verify_proof(&leaves[i], &proof, &root),
                "Proof failed for leaf {}", i);
        }
    }

    #[test]
    fn test_proof_four_leaves() {
        let leaves: Vec<Hash> = (0..4u8)
            .map(|i| hash_ca(&[i]))
            .collect();
        let root = merkle_root(&leaves).unwrap();

        for i in 0..4 {
            let proof = merkle_proof(&leaves, i).unwrap();
            assert!(verify_proof(&leaves[i], &proof, &root),
                "Proof failed for leaf {}", i);
        }
    }

    #[test]
    fn test_wrong_leaf_fails() {
        let a = hash_ca(b"CA_REAL");
        let b = hash_ca(b"CA_OTHER");
        let root = merkle_root(&[a, b]).unwrap();

        let fake = hash_ca(b"CA_FAKE");
        let proof = merkle_proof(&[a, b], 0).unwrap();
        assert!(!verify_proof(&fake, &proof, &root));
    }

    #[test]
    fn test_sorted_pair_commutative() {
        let a = hash_ca(b"X");
        let b = hash_ca(b"Y");
        assert_eq!(hash_pair(&a, &b), hash_pair(&b, &a));
    }

    #[test]
    fn test_large_tree() {
        let leaves: Vec<Hash> = (0..17u8)
            .map(|i| hash_ca(&[i]))
            .collect();
        let root = merkle_root(&leaves).unwrap();

        for i in 0..17 {
            let proof = merkle_proof(&leaves, i).unwrap();
            assert!(verify_proof(&leaves[i], &proof, &root),
                "Proof failed for leaf {}", i);
        }
    }

    #[test]
    fn test_ca_merkle_tree_single() {
        let ca_pub = b"TEST_CA_PUBLIC_KEY";
        let (leaf, root, proof) = ca_merkle_tree(ca_pub, &[]).unwrap();
        let expected: Hash = Sha256::digest(ca_pub).into();
        assert_eq!(leaf, expected);
        assert_eq!(root, leaf);
        assert!(proof.is_empty());
    }

    #[test]
    fn test_ca_merkle_tree_with_extras() {
        let ca_pub = b"TEST_CA_PUBLIC_KEY";
        let extra1 = hash_ca(b"EXTRA_CA_1");
        let extra2 = hash_ca(b"EXTRA_CA_2");
        let (leaf, root, proof) = ca_merkle_tree(ca_pub, &[extra1, extra2]).unwrap();

        // Root should match building tree manually
        let expected_root = merkle_root(&[leaf, extra1, extra2]).unwrap();
        assert_eq!(root, expected_root);

        // Proof should verify for index 0
        assert!(verify_proof(&leaf, &proof, &root));
    }

    #[test]
    fn test_leaf_index_out_of_range() {
        let leaf = hash_ca(b"CA");
        assert!(merkle_proof(&[leaf], 1).is_err());
        assert!(merkle_root_and_proof(&[leaf], 1).is_err());
    }
}
