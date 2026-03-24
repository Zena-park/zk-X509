# zk-X509 Testing Guide

> 로컬 환경 구축 및 사용자 테스트는 [local-setup.md](local-setup.md) 참조.

## 1. Unit Tests

### Rust (46 tests)
```bash
cargo test -p zk-x509-script --lib
```

### Foundry (40 tests)
```bash
cd contracts && forge test
```

## 2. Execute Mode (proof 없이 zkVM 실행)

```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/signCert.der \
  --key certs/signPri.key \
  --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

ECDSA도 가능: `ec_signCert.der` / `ec_signPri.key` / `ec_ca_pub.der` (P-256)

## 3. 벤치마크

```bash
bash script/bench.sh
```

## 4. Core Proof 생성 + 검증

```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --prove \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

## Troubleshooting

| 에러 | 해결 |
|------|------|
| Failed to read cert file | `cd certs && bash generate-test-certs.sh` |
| CRL signature verification failed | `cd certs && bash generate-test-crl.sh` |
| SP1 proof generation failed | `--release` 플래그 확인, 메모리 부족 |
| InvalidCaMerkleRoot | CA Root 불일치. `updateCaMerkleRoot` 확인 |
| RegistrantMismatch | proof의 registrant와 트랜잭션 sender 불일치 |
| Docker ARM64 에러 | `docker pull --platform linux/amd64 ghcr.io/succinctlabs/sp1-gnark:v6.0.0` |
| Anvil "nonce too high" | Anvil 재시작 |
