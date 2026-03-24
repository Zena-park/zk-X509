# zk-X509 로컬 환경 구축

## 1. 필수 도구 설치

### Rust + SP1 toolchain
```bash
curl -L https://sp1.succinct.xyz | bash
sp1up
```

### Foundry (Forge + Anvil)
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Docker (Groth16 proof 생성에 필요)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치 및 실행

Apple Silicon (M1/M2/M3):
```bash
docker pull --platform linux/amd64 ghcr.io/succinctlabs/sp1-gnark:v6.0.0
```

### Node.js (프론트엔드)
```bash
# Node.js 18+ 필요
node --version
```

## 2. 테스트 인증서 생성

```bash
cd certs && bash generate-test-certs.sh && cd ..
```

생성되는 파일:

| 파일 | 용도 |
|------|------|
| `ca_pub.der` | RSA CA 공개키 |
| `signCert.der` | RSA 사용자 인증서 |
| `signPri.key` | RSA 사용자 개인키 |
| `ec_ca_pub.der` | ECDSA P-256 CA 공개키 |
| `ec_signCert.der` | ECDSA P-256 사용자 인증서 |
| `ec_signPri.key` | ECDSA P-256 사용자 개인키 |
| `ec384_ca_pub.der` | ECDSA P-384 CA 공개키 |
| `ec384_signCert.der` | ECDSA P-384 사용자 인증서 |
| `ec384_signPri.key` | ECDSA P-384 사용자 개인키 |
| `test_crl.der` | CRL (사용자 인증서 미포함) |
| `test_crl_revoked.der` | CRL (사용자 인증서 포함 — 폐기 테스트용) |

> 인증서를 재생성하면 CA 키가 바뀌므로 CRL도 자동 재생성된다.

## 3. Unit Tests

### Rust (46 tests)
```bash
cargo test -p zk-x509-script --lib
```

Ownership 서명, Merkle tree, NPKI 스캐너, CRL SMT 테스트.

### Foundry (40 tests)
```bash
cd contracts && forge test
```

IdentityRegistry 등록, 재등록, revoke, 만료, multi-wallet 등.

## 4. 빌드 확인

### Rust
```bash
cargo check --workspace
```

### Solidity
```bash
cd contracts && forge build
```

### Frontend
```bash
cd frontend && npm install && npm run build
```

## 5. Execute Mode (빠른 검증)

proof 없이 zkVM 프로그램을 실행하여 로직을 검증한다.

```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/signCert.der \
  --key certs/signPri.key \
  --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

ECDSA: `ec_signCert.der` / `ec_signPri.key` / `ec_ca_pub.der` (P-256)

전체 벤치마크: `bash script/bench.sh`

## 6. Core Proof 생성 (로컬 검증용)

```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --prove \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

Core proof는 on-chain 제출 불가. on-chain용은 Groth16 (testing-guide 참조).
