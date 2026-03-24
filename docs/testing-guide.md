# zk-X509 Testing Guide

## Prerequisites

```bash
# Rust + SP1 toolchain
curl -L https://sp1.succinct.xyz | bash
sp1up

# Foundry (Forge + Anvil)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Generate test certificates
cd certs && bash generate-test-certs.sh && bash generate-test-crl.sh && cd ..
```

## 1. Unit Tests (가장 빠름)

### Rust tests (44 tests, ~10초)
```bash
cargo test -p zk-x509-script --lib
```

Ownership 서명, Merkle tree, NPKI 스캐너, CRL SMT 테스트.

### Foundry contract tests (40 tests, ~1초)
```bash
cd contracts && forge test
```

IdentityRegistry 등록, 재등록, revoke, 만료, multi-wallet 등.

## 2. Execute Mode (zkVM 실행, proof 없음, ~2분)

zkVM에서 프로그램을 실제 실행하고 cycle count를 측정합니다.
Proof는 생성하지 않아 빠릅니다.

### RSA-2048
```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/signCert.der \
  --key certs/signPri.key \
  --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

### ECDSA P-256
```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/ec_signCert.der \
  --key certs/ec_signPri.key \
  --ca-cert certs/ec_ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

### 전체 벤치마크
```bash
bash script/bench.sh
```

## 3. Proof Generation (실제 ZK proof, ~2분)

```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --prove \
  --cert certs/signCert.der \
  --key certs/signPri.key \
  --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

성공 시 출력:
```
Successfully generated proof!
Successfully verified proof!
Nullifier: 0x...
```

## 4. Local Blockchain (Anvil) E2E Test

### Step 1: Anvil 실행 (터미널 1)
```bash
anvil
```

기본 계정 10개 + 10000 ETH씩 제공됨.

### Step 2: 컨트랙트 배포 (터미널 2)
```bash
cd contracts

forge script script/DeployLocal.s.sol --tc DeployLocalScript \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

출력에서 IdentityRegistry 주소 확인:
```
IdentityRegistry: 0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
```

### Step 3: ZK Proof 생성 + 등록

```bash
# Proof 생성 (registry_address와 chain_id 지정)
cargo run --release -p zk-x509-script --bin zk-x509 -- --prove \
  --cert certs/signCert.der \
  --key certs/signPri.key \
  --ca-cert certs/ca_pub.der \
  --registrant 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --chain-id 31337 \
  --registry-address 0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
```

### Step 4: 등록 확인

```bash
# isVerified 호출
cast call 0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496 \
  "isVerified(address)(bool)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
```

## 5. Interactive Mode (NPKI 인증서 사용)

```bash
cargo run --release --bin interactive
```

로컬 PC에서 NPKI 인증서를 스캔하여 선택 → 비밀번호 입력 → proof 생성.
한국 NPKI 인증서가 있어야 동작합니다.

## 6. HTTP Server Mode

```bash
cargo run --release --bin server
```

API 엔드포인트:
- `GET  /certs`    — NPKI 인증서 목록
- `POST /execute`  — proof 없이 실행 (테스트)
- `POST /prove`    — ZK proof 생성
- `GET  /health`   — 상태 확인

## Troubleshooting

### "Failed to read cert file"
인증서 경로 확인. `cd certs && bash generate-test-certs.sh` 실행.

### "SP1 proof generation failed"
메모리 부족. `--release` 플래그 확인.

### Anvil "nonce too high"
Anvil 재시작: `anvil` 다시 실행.

### Forge "stack too deep"
`foundry.toml`에 `via_ir = true` 설정 확인.
