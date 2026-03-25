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

## 3. 빌드 + Verification Key 확인

```bash
# Rust 전체 빌드
cargo build --release --workspace

# Verification Key 확인 (배포에 필요)
cargo run --release --bin vkey
# 출력: Verification Key: 0x...

# Solidity 빌드
cd contracts && forge build

# Frontend 빌드
cd frontend && npm install && npm run build
```

> 프로그램 코드(`program/src/main.rs`)를 수정하면 Verification Key가 변경됩니다.
> 이 값은 컨트랙트의 `PROGRAM_V_KEY`와 일치해야 합니다. 불일치 시 proof 검증이 실패합니다(`ProofInvalid`).
> 확인: `cast call $REGISTRY_ADDR "PROGRAM_V_KEY()(bytes32)" --rpc-url http://localhost:8545`

## 4. 로컬 환경 배포

### Step 1: Anvil 실행 (터미널 1)
```bash
anvil
```

기본 계정 10개 + 10000 ETH씩 제공됨.

### Step 2: 컨트랙트 배포 (터미널 2)
```bash
cd contracts

# vkey를 자동으로 가져와서 배포
PROGRAM_V_KEY=$(cargo run --release --bin vkey 2>&1 | grep "Verification Key:" | awk '{print $3}') \
MAX_WALLETS_PER_CERT=3 \
forge script script/DeployLocal.s.sol --tc DeployLocalScript \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

출력에서 `IdentityRegistry:` 주소를 저장:
```bash
export REGISTRY_ADDR=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

> `MAX_WALLETS_PER_CERT`: 인증서당 최대 지갑 수 (기본값 1, 배포 후 변경 불가).
>
> 실제 SP1VerifierGroth16이 배포됩니다. Production Groth16 proof가 필요합니다 (Docker 필요).

### Step 3: 관리자 — CA 등록 (on-chain)

**방법 A: Admin 웹페이지 (권장)**

`http://localhost:3000/admin` → Management 탭 → CA 파일(`.der`) 업로드 → "ADD TO REGISTRY" 또는 "ADD ALL"

**방법 B: CLI**

```bash
# 단일 CA 등록
CA_HASH=$(cargo run --release --bin zk-x509 -- --ca-root --ca-cert certs/ca_pub.der 2>&1 | grep "CA Merkle Root:" | awk '{print $4}')
cast send $REGISTRY_ADDR "addCA(bytes32)" $CA_HASH \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

등록 확인:
```bash
cast call $REGISTRY_ADDR "getCaCount()" --rpc-url http://localhost:8545
cast call $REGISTRY_ADDR "caMerkleRoot()" --rpc-url http://localhost:8545
```

> CA는 on-chain에 저장되며 Merkle root가 자동 계산됩니다.
> `addCA()`, `addCAs()`, `removeCA()`, `removeCAs()` 함수로 관리합니다.

### Step 4: 사용자 — Groth16 Proof 생성

두 가지 방법으로 proof를 생성할 수 있습니다.

**방법 A: Interactive CLI (권장 — 가이드 방식)**

```bash
# macOS: 키체인 지원 + 깔끔한 출력 (권장)
./script/run-interactive.sh

# 또는 직접 실행 (빌드 경고 포함)
cargo run --release --bin interactive
```

순차적으로 안내합니다:
```
Step 1/5: Settings
  RPC URL [http://localhost:8545]:              ← Enter (기본값)
  Registry address [0xe7f1...0512]:             ← Enter (기본값)
  Chain ID [31337]:                             ← Enter
  ✓ MAX_WALLETS_PER_CERT: 3 (from on-chain)    ← 자동 조회

Step 2/5: Select Certificate
  [File]     1. Test User (Test CA)                     ← 파일 기반 인증서
  [Keychain] 2. 박영주 (yessignCA Class 3)               ← macOS 키체인 인증서
  Select certificate [1-2]: 1

Step 3/5: Credentials
  Certificate password (empty if unencrypted):  ← 파일 인증서: 비밀번호 입력
                                                   키체인 인증서: 자동 (macOS 다이얼로그)
  ✓ Auto-matched CA: Test CA (on-chain verified) ← CA 공개키 자동 매칭
  Your wallet address (0x...): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Wallet index (0-2) [0]:                       ← Enter
  Disclosure mask (0=hide all, 15=show all) [0]: ← Enter (기본: 전부 숨김)

Step 4/5: Generate Proof
  [1] Execute (fast test) / [2] Groth16 (production) [2]: ← Enter = Groth16
  Generating Groth16 proof (Docker 필요, 수 분 소요)...

Step 5/5: Copy to Dashboard
  Proof: 0x...
  Public Values: 0x...
  → Dashboard에 붙여넣기
```

> **인증서 소스:** 파일 기반 NPKI 디렉토리(`~/Library/Preferences/NPKI/`, `certs/`)와 macOS 키체인을 모두 스캔합니다.
> - **파일 인증서:** 비밀번호를 입력하여 개인키를 복호화합니다.
> - **키체인 인증서:** 개인키가 프로세스 메모리에 올라오지 않으며, macOS가 서명을 수행합니다.
>
> **CA 자동 매칭:** `data/ca-certs/` 디렉토리의 CA 인증서와 on-chain 등록 목록을 대조하여 자동 선택합니다.
> CA가 on-chain에 미등록인 경우 경고를 표시하며, 관리자에게 등록을 요청해야 합니다.

**방법 B: EVM CLI (한 줄 명령어)**

```bash
cargo run --release --bin evm -- --system groth16 \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --wallet-index 0 \
  --max-wallets 3 \
  --chain-id 31337 \
  --registry-address $REGISTRY_ADDR \
  --rpc-url http://localhost:8545
```

출력에서 `Proof: 0x...`와 `Public Values: 0x...`를 복사합니다.

> **`--rpc-url`**: on-chain CA 목록을 자동 조회하여 Merkle proof를 생성합니다.
> 지정하지 않으면 `--extra-ca`로 수동 지정해야 합니다 (on-chain CA 목록과 정확히 일치해야 함).

**주요 파라미터:**

| 파라미터 | 설명 | 기본값 |
|---------|------|--------|
| `--registrant` | 등록할 지갑 주소 (MetaMask 주소와 일치해야 함) | 필수 |
| `--wallet-index` | 슬롯 번호 (0부터 시작) | 0 |
| `--max-wallets` | 컨트랙트의 MAX_WALLETS_PER_CERT | 1 |
| `--chain-id` | EIP-155 체인 ID | 31337 |
| `--disclosure-mask` | 선택적 공개 (0=전부 숨김, 15=전부 공개) | 0 |
| `--rpc-url` | on-chain CA 자동 조회용 RPC URL | 없음 |

**같은 인증서로 여러 지갑 등록:**
```bash
# 첫 번째 지갑 (wallet-index 0)
--wallet-index 0 --registrant 0xFirstWallet

# 두 번째 지갑 (wallet-index 1)
--wallet-index 1 --registrant 0xSecondWallet
```

**Groth16 proof 생성 요구사항:**
- Docker Desktop 실행 중이어야 함
- Apple Silicon: `docker pull --platform linux/amd64 ghcr.io/succinctlabs/sp1-gnark:v6.0.0` 필요
- 생성 시간: 약 3~10분 (하드웨어에 따라 다름)

**Execute 모드 (빠른 테스트):**
```bash
cargo run --release --bin zk-x509 -- --execute \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --registry-address $REGISTRY_ADDR \
  --rpc-url http://localhost:8545
```
> Execute 모드는 ZK 프로그램을 실행하여 검증만 합니다 (proof 미생성, on-chain 등록 불가).
> 인증서/키 유효성을 빠르게 확인할 때 사용합니다.

### Step 5: 사용자 — on-chain 등록

**방법 A: Dashboard 웹페이지 (권장)**

`http://localhost:3000/dashboard` → MetaMask 연결 → Proof/Public Values 붙여넣기 → Register

**방법 B: CLI**

```bash
# --private-key의 지갑 주소와 --registrant가 반드시 일치해야 함
cast send $REGISTRY_ADDR \
  "register(bytes,bytes)" $PROOF $PUBLIC_VALUES \
  --rpc-url http://localhost:8545 \
  --private-key 사용자_개인키
```

등록 확인:
```bash
cast call $REGISTRY_ADDR \
  "isVerified(address)(bool)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
# → true

cast call $REGISTRY_ADDR \
  "verifiedUntil(address)(uint64)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
```

### Step 6: 프론트엔드 실행 (터미널 3)
```bash
cd frontend && npm run dev
```

`http://localhost:3000` 접속.

| 페이지 | 용도 |
|--------|------|
| `/` | 랜딩 페이지 |
| `/dashboard` | 사용자: proof 제출 + 인증 확인 |
| `/admin` | 관리자: CA 관리, 컨트랙트 설정 |

> 프론트엔드 컨트랙트 주소: `frontend/.env.local`에서 `NEXT_PUBLIC_REGISTRY_ADDRESS` 설정.
> 기본값은 Anvil 로컬 주소 `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`.

배포 완료 후 추가 테스트는 [testing-guide.md](testing-guide.md) 참조.
