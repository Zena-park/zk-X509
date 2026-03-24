# zk-X509 E2E Testing Guide

> 환경 구축, Unit Tests, Execute/Core Proof는 [local-setup.md](local-setup.md) 참조.

## Proof 종류

| 바이너리 | proof 형식 | 용도 | 비고 |
|----------|-----------|------|------|
| `zk-x509 --execute` | proof 없음 | 로직 검증 + cycle 측정 | 가장 빠름 |
| `zk-x509 --prove` | Core proof | 로컬 검증 | on-chain 제출 불가 |
| `evm --system groth16` | Groth16 proof | **on-chain 제출** | Docker 필요 |

## 1. 로컬 E2E Test (Anvil)

### Step 1: Anvil 실행 (터미널 1)
```bash
anvil
```

### Step 2: 컨트랙트 배포 (터미널 2)
```bash
cd contracts

forge script script/DeployLocal.s.sol --tc DeployLocalScript \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

출력에서 `IdentityRegistry:` 주소를 `REGISTRY_ADDR`로 저장.

### Step 3: 관리자 — CA Merkle Root 계산 + 등록

CA 공개키 파일의 SHA-256 해시로 Merkle Root를 계산하고, 컨트랙트에 등록한다.

```bash
# CA Root 계산 (off-chain)
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
# 출력에서 CA Merkle Root: 0x... 복사

# 컨트랙트에 등록 (owner만 가능)
cast send $REGISTRY_ADDR \
  "updateCaMerkleRoot(bytes32)" 0x위에서_복사한_값 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Step 4: Groth16 Proof 생성 (사용자)
```bash
cargo run --release --bin evm -- --system groth16 \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --chain-id 31337 \
  --registry-address $REGISTRY_ADDR
```

출력에서 `Proof: 0x...`와 `Public Values: 0x...` 복사.

### Step 5: 등록 (사용자)
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

## 2. Frontend E2E Test (브라우저)

Section 1의 Step 1~4 완료 후:

```bash
cd frontend && npm run dev
```

1. MetaMask → `localhost:8545` (Chain ID 31337) 네트워크 추가
2. Anvil PK `0xac0974...` import
3. `http://localhost:3000` → 지갑 연결
4. Step 4에서 출력된 **Proof**와 **Public Values** hex 붙여넣기
5. 트랜잭션 전송 → "등록 완료!" 확인

> 프론트엔드 컨트랙트 주소: `frontend/src/contracts/IdentityRegistry.ts`에서 수정.

## 3. CA Merkle Root 관리 (관리자)

컨트랙트는 신뢰하는 CA 목록을 Merkle Root 하나로 저장한다.
CA를 추가/삭제하면 전체 CA 목록으로 root를 다시 계산하여 업데이트해야 한다.

> 기존 등록 사용자에게는 영향 없음. 새로 등록하려는 사용자만 새 root 기준으로 proof를 생성하면 된다.

### 복수 CA Merkle Root 계산
`--extra-ca`로 추가 CA를 지정:
```bash
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --extra-ca certs/ec_ca_pub.der --extra-ca certs/ec384_ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

### CA Root 갱신
```bash
cast send $REGISTRY_ADDR \
  "updateCaMerkleRoot(bytes32)" 0xNEW_ROOT \
  --rpc-url http://localhost:8545 \
  --private-key $OWNER_PRIVATE_KEY
```

> `updateCaMerkleRoot`는 owner만 호출 가능.

## Troubleshooting

| 에러 | 해결 |
|------|------|
| InvalidCaMerkleRoot | CA Root 불일치. Step 3에서 `updateCaMerkleRoot` 확인 |
| RegistrantMismatch | proof의 registrant와 트랜잭션 sender가 다름 |
| ProofTooOld | proof 만료. 다시 생성 |
| Docker ARM64 에러 | `docker pull --platform linux/amd64 ghcr.io/succinctlabs/sp1-gnark:v6.0.0` |
| Anvil "nonce too high" | Anvil 재시작 |
