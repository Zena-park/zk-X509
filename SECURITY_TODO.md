# zk-X509 보안 이슈 트래커

## 완료

| # | 이슈 | PR |
|---|------|----|
| 1 | 개인키 평문 전송 → NPKI 파일 스캔 + 서버 직접 읽기로 해결 | [#6](https://github.com/tokamak-network/zk-X509/pull/6) |
| 2 | Ownable2Step (2단계 소유권 이전) | merged |
| 3 | 인증서 체인 검증 (3단계 NPKI) | merged |
| 4 | CRL 기반 인증서 폐지 확인 | merged |
| 5 | 비상 정지 (pause/unpause) | merged |
| 6 | 인증 취소 (revokeUser) | merged |
| 7 | Timestamp 검증 (±1시간) | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 8 | Nullifier brute-force 방지 (serial+privkey) | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 9 | msg.sender 바인딩 (front-running 방어) | [#2](https://github.com/tokamak-network/zk-X509/pull/2) |
| 10 | CORS 제한 (localhost only) | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 11 | Request body 1MB 제한 | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 12 | Debug derive 제거 (키 로깅 방지) | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 13 | Password 메모리 즉시 삭제 | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 14 | Mock proof 코드 제거 | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 15 | CRL 서명 검증 (zkVM 내부, issuer-scoped, freshness) | [#5](https://github.com/tokamak-network/zk-X509/pull/5) |
| 16 | SEED-CBC 복호화 (kisaseed) | [#4](https://github.com/tokamak-network/zk-X509/pull/4) |
| 17 | NPKI 파일 스캔 + MetaMask 웹 플로우 | [#6](https://github.com/tokamak-network/zk-X509/pull/6) |
| 24 | 서명 기반 소유 증명 (개인키가 zkVM에 진입하지 않음) | feat/signature-ownership |
| 25 | reRegister() — 관리자 없이 지갑 변경 | feat/configurable-policy |
| 26 | Configurable Registration Policy (maxWalletsPerCert) | feat/configurable-policy |
| 19 | ECDSA (P-256, P-384) 서명 지원 | feat/ecdsa-support |
| 29 | 인증서 만료일 기반 자동 인증 만료 (notAfter → verifiedUntil) | feat/selective-disclosure |
| 30 | 선택적 공개 (Selective Disclosure) — 필드별 해싱+마스크 | feat/selective-disclosure |
| 31 | Merkle tree 기반 CA 익명 검증 | merged |
| 32 | Selective Disclosure → 평문 bytes32 (salt 제거) | [#99](https://github.com/tokamak-network/zk-X509/pull/99) |
| 33 | Semi-formal security model (논문용) | merged |
| 34 | Cycle 벤치마크 테이블 | merged |
| 36 | Nullifier 서명 기반 변경 (brute-force 방지) | merged |
| 37 | Ownership 챌린지에 timestamp 추가 | merged |
| 38 | CRL zkVM 검증 현실성 (논문 기술) | merged |
| 39 | Abstract Gas 비용 수정 (논문) | merged |
| 40 | 동적 MAX_PROOF_AGE + L2 timestamp 방어 | merged |
| 41 | CA Merkle root 갱신 시 grace period | merged |
| 44 | Nullifier 교차 앱 추적 방지 (Cross-DApp) | merged |
| 45 | Cross-Chain Replay 방지 (chain_id) | merged |
| 46 | CRL 논문 톤다운 | merged |
| 48 | 기존 시스템 대비 정량 비교 테이블 | merged |
| 55 | ARIA-CBC 지원 | merged |
| 28 | LICENSE 파일 추가 | merged |
| — | vkey 중앙 관리 (Factory cross-contract call) | [#97](https://github.com/tokamak-network/zk-X509/pull/97) |
| — | CA Registry PR 서명 인증 (백엔드) | [#98](https://github.com/tokamak-network/zk-X509/pull/98) |
| — | 멀티 테넌트 플랫폼 (RegistryFactory) | merged |
| — | 위임 증명 시스템 (consent protocol, prover-server) | [#100](https://github.com/tokamak-network/zk-X509/pull/100) |
| — | vkey 자동 감지 + E2E 테스트 가이드 | [#102](https://github.com/tokamak-network/zk-X509/pull/102) |
| — | prover-server 버그 수정 (spawn_blocking, empty PV) | [#103](https://github.com/tokamak-network/zk-X509/pull/103) |
| 42 | 컨트랙트 업그레이드 → Beacon Proxy 패턴으로 해결 | [#100](https://github.com/tokamak-network/zk-X509/pull/100) |

## 미해결

### HIGH — 기능 개발

#### 56. Disclosure 필터링 (2단계 인증 정책)

서비스 운영자가 인증 정책을 2단계로 설정:

**1단계: disclosure mask** — 어떤 필드를 공개할지 (기존 `minDisclosureMask`)
**2단계: 필터 값** — 공개된 필드 중 어떤 값만 허용할지 (신규)

```
필터 값 = bytes32(0)  → 공개만 하고 아무 값이나 허용
필터 값 = "KR"        → 정확히 "KR"인 경우만 등록 가능
```

**설정 예시:**

| 정책 | disclosure mask | 필터 |
|------|----------------|------|
| 아무나 | 0x00 | 없음 |
| 한국인만 | 0x01 (Country) | requiredCountry = "KR" |
| 삼성 직원만 | 0x02 (Org) | requiredOrg = "Samsung" |
| 삼성 한국 엔지니어만 | 0x07 (C+O+OU) | requiredCountry = "KR", requiredOrg = "Samsung", requiredOrgUnit = "Engineering" |
| 사업자만 (개인 제외) | 0x02 (Org) | org != 0x0 체크 (entity type filter) |

**컨트랙트 설계:**

```solidity
// 필터 값 (bytes32(0) = 제한 없음, 값이 있으면 정확히 일치해야 함)
// 값은 UTF-8 right-padded to bytes32 (e.g., "KR" = 0x4b52000...000)
bytes32 public requiredCountry;
bytes32 public requiredOrg;
bytes32 public requiredOrgUnit;
bytes32 public requiredCommonName;

// Custom errors
error CountryMismatch(bytes32 proof, bytes32 required);
error OrgMismatch(bytes32 proof, bytes32 required);
error OrgUnitMismatch(bytes32 proof, bytes32 required);
error CommonNameMismatch(bytes32 proof, bytes32 required);
error FilterWithoutDisclosure(uint8 filterBit, uint8 disclosureMask);

event RequiredDisclosureValuesUpdated(bytes32 country, bytes32 org, bytes32 orgUnit, bytes32 cn);

// 서비스 운영자가 설정 (owner only)
// 주의: 필터 설정 시 해당 disclosure bit이 minDisclosureMask에 켜져있어야 함
function setRequiredDisclosureValues(
    bytes32 _country, bytes32 _org, bytes32 _orgUnit, bytes32 _cn
) external onlyOwner;
```

**register() 검증 로직:**

```solidity
// 기존: disclosure mask 체크 (필드가 비어있지 않은지)
// 추가: 필터 값 체크 (필드 값이 일치하는지)
if (requiredCountry != bytes32(0)) {
    if (pv.country != requiredCountry) revert CountryMismatch(pv.country, requiredCountry);
}
if (requiredOrg != bytes32(0)) {
    if (pv.org != requiredOrg) revert OrgMismatch(pv.org, requiredOrg);
}
// ... orgUnit, commonName 동일
```

**일관성 검증:** `setRequiredDisclosureValues()` 호출 시 필터 값이 설정된 필드는 `minDisclosureMask`에 해당 bit이 켜져있어야 함. 그렇지 않으면 사용자가 해당 필드를 공개하지 않아 항상 revert됨.

**Entity Type 필터 (개인/사업자 구분):**
- requiredOrg가 설정되어 있으면 → 해당 기관만 허용
- minDisclosureMask에 Org bit이 켜져있고 requiredOrg = bytes32(0)이면 → 사업자만 허용 (org != 0x0)
- minDisclosureMask에 Org bit이 꺼져있으면 → 개인/사업자 무관

**변경 범위:**
- contracts: IdentityRegistry (storage + validation), RegistryFactory (createRegistry 파라미터)
- frontend: create 페이지 (필터 값 입력), admin 설정 (필터 변경)
- 가스 비용: 필터당 1 SLOAD (~2100 gas) 추가 — 4개 전부 설정해도 ~8400 gas

#### ~~57. 한국 NPKI 개인사업자 vs 법인 세부 구분~~ → 불필요
- O + CN 조합으로 구분 가능 (serialNumber 파싱 불필요)
- 개인: O 없음
- 개인사업자: O ≠ CN (O=사업명, CN=개인명) — 두 필드 모두 disclosure 필요
- 법인: CN이 O 값으로 시작 (O=회사명, CN=회사명/대표자) — 두 필드 모두 disclosure 필요

### MEDIUM — 미해결

#### 20. Solidity 형식 검증
- Certora, Halmos 등으로 IdentityRegistry / RegistryFactory 검증 미실시
- 119개 단위 테스트는 통과하지만, 형식적 속성 검증은 미수행

#### 43. CA 관리 탈중앙화 (Multi-sig / DAO)
- **문제:** owner 단일 키 탈취 시 악의적 CA 추가/제거 가능
- **해결:** OpenZeppelin Governor + TimelockController, 또는 최소 multi-sig (Gnosis Safe)
- **참고:** 현 단계에서는 single owner로 충분, 운영 단계에서 전환

#### 50. CRL Merkle Oracle — 대규모 CRL 지원
- **문제:** 현재 zkVM 내 CRL 검증은 전체 CRL DER을 입력 → 대규모 CRL(수십 MB)은 비용 비현실적
- **해결:** 오라클 운영자가 CRL의 폐기 시리얼 번호를 Merkle tree로 구성 → root만 on-chain 저장
- **컨트랙트:** `crlMerkleRoot` 상태 + `updateCrlMerkleRoot()` 관리자 함수 — 이미 구현됨
- **미구현:** Merkle non-membership proof (zkVM), CRL → Merkle tree 변환 도구

#### 49. On-chain gas 실측 (.gas-snapshot)
- E2E 테스트에서 register() 성공 확인했으나, 정확한 gas 비용 미측정
- forge snapshot으로 .gas-snapshot 파일 생성 필요

### LOW — 미해결

#### 22. 클라이언트 사이드 프루빙 (SP1 WASM)
- SP1 WASM prover 지원 대기 중

#### 51. zk-email 벤치마크 재실행
- 비교 논문용. 현재 급하지 않음

### 설계 변경 이력

- **#32**: Selective Disclosure salt → 평문 bytes32로 전환 ([#99](https://github.com/tokamak-network/zk-X509/pull/99))
- **#42**: Proxy 업그레이드 → Beacon Proxy로 해결 ([#100](https://github.com/tokamak-network/zk-X509/pull/100))
- **#47/#52**: Delegated Proving 삭제 결정 → **번복**, consent-based 위임 증명 구현 ([#100](https://github.com/tokamak-network/zk-X509/pull/100), [#103](https://github.com/tokamak-network/zk-X509/pull/103))
