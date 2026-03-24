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

## 3. 빌드 확인

```bash
cargo check --workspace           # Rust
cd contracts && forge build        # Solidity
cd frontend && npm install && npm run build  # Frontend
```

## 4. 로컬 환경 배포

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

출력에서 `IdentityRegistry:` 주소를 `REGISTRY_ADDR`로 저장.

### Step 3: 관리자 — CA 등록

CA 공개키의 SHA-256 해시로 Merkle Root를 계산하고 컨트랙트에 등록한다.

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

### Step 4: 사용자 등록 테스트

Groth16 Proof 생성 후 등록:
```bash
# proof 생성 (--registrant 주소 = 등록할 지갑 주소)
cargo run --release --bin evm -- --system groth16 \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --chain-id 31337 \
  --registry-address $REGISTRY_ADDR
# 출력에서 Proof: 0x... 와 Public Values: 0x... 복사

# 등록 (--private-key의 지갑 주소와 --registrant가 반드시 일치해야 함)
cast send $REGISTRY_ADDR \
  "register(bytes,bytes)" $PROOF $PUBLIC_VALUES \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

등록 확인:
```bash
# 인증 여부
cast call $REGISTRY_ADDR \
  "isVerified(address)(bool)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
# → true

# 인증 만료일 (unix timestamp)
cast call $REGISTRY_ADDR \
  "verifiedUntil(address)(uint64)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
```

### Step 5: 프론트엔드 실행 (터미널 3)
```bash
cd frontend && npm run dev
```

`http://localhost:3000` 접속.

> 프론트엔드 컨트랙트 주소: `frontend/src/contracts/IdentityRegistry.ts`에서 수정.

배포 완료 후 추가 테스트는 [testing-guide.md](testing-guide.md) 참조.
