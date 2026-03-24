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

## Proof 종류

| 바이너리 | proof 형식 | 용도 | 비고 |
|----------|-----------|------|------|
| `zk-x509 --execute` | proof 없음 | 로직 검증 + cycle 측정 | 가장 빠름 |
| `zk-x509 --prove` | Core proof | 로컬 검증 | on-chain 제출 불가 |
| `evm --system groth16` | Groth16 proof | **on-chain 제출** | SP1 network prover 또는 CPU |

로컬 Anvil에서도 실제 SP1Verifier를 배포하여 Groth16 proof를 검증한다.
`USE_MOCK_VERIFIER=true` 환경변수로 Mock 모드 선택 가능.

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

전체 벤치마크: `bash script/bench.sh`

## 3. Core Proof 생성 (로컬 검증용)

```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --prove \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

## 4. Groth16 Proof 생성 (on-chain 제출용)

### Apple Silicon (M1/M2/M3) 사전 준비

Groth16 wrapping에 Docker gnark 이미지가 필요. ARM64 이미지가 없으므로 x86 이미지를 먼저 pull:

```bash
docker pull --platform linux/amd64 ghcr.io/succinctlabs/sp1-gnark:v6.0.0
```

```bash
cargo run --release --bin evm -- --system groth16 \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xYOUR_WALLET \
  --chain-id 31337 \
  --registry-address $REGISTRY_ADDR
```

`=== Frontend Input ===` 아래에 Proof와 Public Values hex가 출력됨.
이 값을 프론트엔드에 붙여넣어 트랜잭션 제출.

## 5. CA Merkle Root 관리

컨트랙트는 신뢰하는 CA 목록을 Merkle Root로 저장한다.
CA를 추가/변경하면 root를 재계산하여 컨트랙트에 업데이트해야 한다.

### 단일 CA (테스트용)
```bash
# CA public key의 SHA-256 해시 → Merkle leaf → root
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```
출력에서 `CA Merkle Root: 0x...` 확인.

### 복수 CA
여러 CA를 신뢰할 경우, 각 CA public key의 SHA-256 해시를 leaf로 Merkle Tree를 구성한다.
```
leaves = [SHA256(ca_pub_A.der), SHA256(ca_pub_B.der), SHA256(ca_pub_C.der)]
    ↓ Merkle Tree
caMerkleRoot = 0x...
```

현재 CLI는 단일 CA만 지원. 복수 CA는 off-chain에서 root를 계산 후 배포/업데이트:
```bash
# CA 추가 후 root 갱신
cast send $REGISTRY_ADDR \
  "updateCaMerkleRoot(bytes32)" 0xNEW_ROOT \
  --rpc-url http://localhost:8545 \
  --private-key $OWNER_PRIVATE_KEY
```

> `updateCaMerkleRoot`는 owner만 호출 가능. 기존 root로 생성된 proof는 업데이트 후 거부된다.

## 6. 로컬 E2E Test (Anvil)

### Step 1: Anvil 실행 (터미널 1)
```bash
anvil
```

### Step 2: CA Merkle Root 확인
Section 5 참조. 출력에서 `CA Merkle Root: 0x...` 확인.

### Step 3: 컨트랙트 배포 (터미널 2)
```bash
cd contracts

CA_MERKLE_ROOT=0x위에서_확인한_값 \
forge script script/DeployLocal.s.sol --tc DeployLocalScript \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

출력에서 `IdentityRegistry:` 주소를 `REGISTRY_ADDR`로 저장.

### Step 4: Groth16 Proof 생성
```bash
SP1_DEV=true cargo run --release --bin evm -- --system groth16 \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --chain-id 31337 \
  --registry-address $REGISTRY_ADDR
```

출력에서 `Proof: 0x...`와 `Public Values: 0x...` 복사.

### Step 5: 등록
```bash
cast send $REGISTRY_ADDR \
  "register(bytes,bytes)" $PROOF $PUBLIC_VALUES \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Step 6: 확인
```bash
cast call $REGISTRY_ADDR \
  "isVerified(address)(bool)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
# → true
```

## 7. Frontend E2E Test (브라우저)

Section 6의 Step 1~4 완료 후:

```bash
cd frontend && npm run dev
```

1. MetaMask → `localhost:8545` (Chain ID 31337) 네트워크 추가
2. Anvil PK `0xac0974...` import
3. `http://localhost:3000` → 지갑 연결
4. Step 4에서 출력된 **Proof**와 **Public Values** hex 붙여넣기
5. 트랜잭션 전송 → "등록 완료!" 확인

> 프론트엔드 컨트랙트 주소: `frontend/src/contracts/IdentityRegistry.ts`에서 수정.

## 8. Interactive Mode (NPKI 인증서)

```bash
cargo run --release --bin interactive
```

로컬 NPKI 인증서 스캔 → 비밀번호 입력 → proof 생성. 한국 NPKI 인증서 필요.

## 9. HTTP Server Mode

```bash
cargo run --release --bin server
```

- `GET  /certs` — NPKI 인증서 목록
- `POST /prove` — ZK proof 생성
- `POST /execute` — proof 없이 실행 (테스트)
- `GET  /health` — 상태 확인

## Troubleshooting

| 에러 | 해결 |
|------|------|
| Failed to read cert file | `cd certs && bash generate-test-certs.sh` |
| CRL signature verification failed | `cd certs && bash generate-test-crl.sh` (CA 재생성 후 CRL도 재생성) |
| SP1 proof generation failed | `--release` 플래그 확인, 메모리 부족 |
| Anvil "nonce too high" | Anvil 재시작 |
| Forge "stack too deep" | `foundry.toml`에 `via_ir = true` |
