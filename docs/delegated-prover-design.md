# Delegated Prover API Design

## 1. Overview

현재 서버가 비밀번호를 받아 서명+증명을 모두 수행하는 구조에서,
**사용자가 서명만 생성하고 서버는 증명만 수행**하는 구조로 전환.

```
Before:
  User → { password, cert_index } → Server → 복호화+서명+증명 → proof

After:
  User → 로컬에서 서명 생성 (1초)
  User → { cert_der, ownership_sig, nullifier_sig, ... } → Server
  Server → 증명 생성 (1~2분 GPU) + CRL 강제 적용 → proof
  User → proof를 블록체인에 제출
```

## 2. API 변경

### 기존 API (폐기)

```
POST /prove
{
  "cert_index": 0,           // 서버에 저장된 인증서 인덱스
  "password": "mypass",      // 비밀번호 (서버로 전송!)
  "registrant": "0xAAA...",
  "wallet_index": 0,
  "max_wallets": 1,
  "disclosure_mask": 15
}
```

**문제:** 비밀번호가 서버로 전송됨 → 서버가 개인키에 접근 가능

### 신규 API

```
POST /prove
{
  "cert_der": "base64...",           // 인증서 DER (공개 데이터)
  "ownership_sig": "base64...",      // 사용자가 로컬에서 생성한 서명
  "nullifier_sig": "base64...",      // 사용자가 로컬에서 생성한 서명
  "registrant": "0xAAA...",
  "wallet_index": 0,
  "max_wallets": 1,
  "disclosure_mask": 15,
  "chain_id": 1,
  "contract_address": "0xBBB..."
}

Response:
{
  "proof": "0x...",
  "public_values": "0x...",
  "nullifier": "0x...",
  "ca_merkle_root": "0x...",
  "cycles": 11803639
}
```

**개선:** 비밀번호/개인키 불필요 → 서버는 서명값만 받음

### POST /execute (테스트용, 동일 구조)

```
POST /execute
{
  ... (위와 동일)
}
```

### GET /certs (유지)

기존과 동일 — NPKI 인증서 스캔 결과 반환.
단, 사용자가 로컬에서 서명하므로 cert_index 대신 cert_der를 직접 제공.

## 3. 시퀀스 다이어그램

```
┌──────────┐              ┌──────────────┐            ┌──────────┐
│  User    │              │ Cloud Prover │            │ Contract │
│ (브라우저) │              │  (server.rs)  │            │(on-chain) │
└────┬─────┘              └──────┬───────┘            └────┬─────┘
     │                           │                         │
     │  1. 인증서+비밀번호로       │                         │
     │     로컬에서 서명 생성      │                         │
     │     (ownership_sig,       │                         │
     │      nullifier_sig)       │                         │
     │                           │                         │
     │  2. POST /prove           │                         │
     │  { cert_der,              │                         │
     │    ownership_sig,         │                         │
     │    nullifier_sig, ... }   │                         │
     │ ─────────────────────────>│                         │
     │                           │                         │
     │                           │  3. CA에서 최신 CRL      │
     │                           │     다운로드 (캐시)       │
     │                           │                         │
     │                           │  4. build_stdin()       │
     │                           │     (CRL 포함)           │
     │                           │                         │
     │                           │  5. SP1 proof 생성       │
     │                           │     (~1~2분 GPU)         │
     │                           │                         │
     │  6. { proof,              │                         │
     │       public_values }     │                         │
     │ <─────────────────────────│                         │
     │                           │                         │
     │  7. register(proof, pv)   │                         │
     │ ─────────────────────────────────────────────────>  │
     │                           │                         │
     │  8. verified ✅            │                         │
     │ <─────────────────────────────────────────────────  │
```

## 4. 보안 분석

### 서버가 보는 것
| 데이터 | 민감도 | 비고 |
|--------|--------|------|
| cert_der | 공개 | 은행/정부에도 전송하는 데이터 |
| ownership_sig | 낮음 | addr+timestamp+chain에 바인딩, 재사용 불가 |
| nullifier_sig | 낮음 | contract+chain에 바인딩 |
| registrant | 공개 | 지갑 주소 |

### 서버가 못 보는 것
| 데이터 | 이유 |
|--------|------|
| 개인키 | 사용자 로컬에서만 사용 |
| 비밀번호 | 전송하지 않음 |

### 공격 시나리오
| 공격 | 방어 |
|------|------|
| 서버가 다른 지갑으로 등록 | ownership_sig에 addr 바인딩 |
| 서버가 나중에 재사용 | timestamp 바인딩 (maxProofAge) |
| 서버가 다른 체인에서 사용 | chain_id 바인딩 |
| 서버가 다른 앱에서 사용 | contract_address 바인딩 |
| 서버가 CRL 제외 | 서버가 CRL을 관리하므로 불가 |

### 프라이버시 트레이드오프
서버는 인증서 내용(이름, 소속, 국가)을 볼 수 있음.
이는 웹 로그인 시 서버에 인증서를 제출하는 것과 동일한 수준.
on-chain에는 해시만 올라가므로 **블록체인 프라이버시는 유지**.

## 5. CRL 강제 적용

```
서버 시작 시:
  1. 환경변수 CRL_URL 또는 CA 인증서에서 CRL Distribution Point 추출
  2. CRL 다운로드 → 메모리 캐시
  3. nextUpdate 기록

요청 시 (prepare_stdin):
  1. now > nextUpdate? → 재다운로드
  2. crl_der = 캐시된 CRL (빈 Vec이 아님)
  3. build_stdin에 전달

CRL URL 접근 불가 시:
  - 환경변수 CRL_REQUIRED=true → 에러 반환 (등록 거부)
  - CRL_REQUIRED=false → 빈 CRL로 fallback (기존 동작)
```

## 6. 코드 변경 범위

| 파일 | 변경 |
|------|------|
| `script/src/bin/server.rs` | 신규 API (cert_der + 서명 직접 수신), CRL 다운로드/캐시 |
| `script/Cargo.toml` | `reqwest` 추가 (CRL HTTP 다운로드) |
| `frontend/` | 로컬 서명 생성 로직 (JavaScript/WASM) |

### server.rs 변경 상세

```rust
// 기존 ProveRequest — 비밀번호 기반 (deprecated)
struct ProveRequestLegacy {
    cert_index: usize,
    password: String,
    ...
}

// 신규 ProveRequest — 서명 기반
struct ProveRequest {
    cert_der: String,         // base64
    ownership_sig: String,    // base64
    nullifier_sig: String,    // base64
    registrant: String,
    wallet_index: u32,
    max_wallets: u32,
    disclosure_mask: u8,
    chain_id: u64,
    contract_address: String,
}

// AppState에 CRL 캐시 추가
struct AppState {
    client: EnvProver,
    default_ca_pub_key: Vec<u8>,
    certs: RwLock<Vec<NpkiCertEntry>>,
    crl_cache: RwLock<CrlCache>,          // 신규
}

struct CrlCache {
    crl_der: Vec<u8>,
    next_update: u64,
    crl_url: Option<String>,
}
```

## 7. 마이그레이션

1단계: 신규 API 추가 (`POST /prove/v2`)
2단계: 기존 API deprecated 경고
3단계: 프론트엔드에서 로컬 서명 구현
4단계: 기존 API 제거
