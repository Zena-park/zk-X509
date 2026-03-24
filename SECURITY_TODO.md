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

## 미해결

### MEDIUM

#### 18. ~~CRL 오라클 / 온체인 CRL 커밋~~ → #50으로 흡수
- CRL 해시를 public values에 포함하거나, 온체인 CRL 오라클 구축
- 현재 CRL은 프루버 서버가 로컬에서 제공

#### 20. Solidity 형식 검증
- Certora, Halmos 등으로 IdentityRegistry 검증 미실시

#### 21. ~~다단계 인증서 비용 최적화~~ ✅ DONE
- zkVM: Vec → 스택 배열 (선택적 공개), 스트리밍 SHA-256 (ownership/nullifier)
- Solidity: register()/reRegister()에서 verifiedUntil 체크를 proof 검증 전으로 이동 (gas 절감)

#### 22. 클라이언트 사이드 프루빙 (SP1 WASM)
- SP1 WASM prover 지원 대기 중

#### 23. ~~NPKI 스캐너 단위 테스트~~ ✅ DONE
- temp directory로 스캐너 동작 검증 완료 (5개 테스트)

### 🚨 CRITICAL (논문 리뷰 지적사항)

#### 36. ~~Nullifier 공개키 기반 → 서명 기반으로 변경~~ ✅ DONE
- **문제:** 현재 `nullifier = H(cert.pk_der ‖ wallet_index)` — 인증서 공개키는 공개 데이터(은행, 정부기관 등에 전송됨)이므로 누구나 nullifier를 역산하여 지갑 추적 가능 → Unlinkability 완전 파괴
- **공격:** cert.pk_der를 아는 공격자가 wallet_index(0,1,2...)를 brute-force → on-chain에서 nullifier→registrant 매핑으로 사용자 식별
- **해결:** `nullifier = H(deterministic_sig ‖ wallet_index)` — 개인키 없이는 서명 생성 불가, RSA/RFC6979 ECDSA는 결정론적이므로 매번 동일값 보장
- **구현:** nullifier_sig = Sign(sk, "zk-X509-Nullifier-v1") → zkVM에서 서명 검증 후 nullifier 도출
- **변경 범위:** program (nullifier 생성), script/ownership.rs (nullifier 서명 추가), contracts (변경 없음, nullifier 포맷만 변경)

#### 37. ~~Ownership 챌린지에 timestamp 추가 (Replay 방어)~~ ✅ DONE
- **문제:** 현재 챌린지 `H(serial ‖ addr ‖ wallet_index)`가 정적 → 서명값 탈취 시 무한 재사용 가능
- **공격:** 원격 Prover 모델로 확장 시, Prover 서버가 서명값을 저장 → 사용자 동의 없이 새 proof 생성 가능
- **해결:** `H(serial ‖ addr ‖ wallet_index ‖ timestamp)` — timestamp를 포함하여 서명의 유효기간 제한
- **변경 범위:** program (챌린지 해시에 timestamp 추가), script/ownership.rs (서명 시 timestamp 포함)

#### 38. ~~CRL zkVM 검증의 현실성 문제 (논문 기술)~~ ✅ DONE
- **문제:** 실제 NPKI CRL은 수 MB~수십 MB (수백만 폐기 시리얼), zkVM 내 파싱은 수십억 사이클로 비현실적
- **현상태:** 코드에 CRL 검증 구현은 있으나 테스트 CRL(<1KB)로만 검증됨
- **대응:** 논문에서 CRL 검증은 "소규모 CRL 또는 OCSP 대응 전용"으로 명시, 대규모 CRL은 온체인 오라클(#18) 또는 OCSP 전환 필요성 기술
- **변경 범위:** 논문 기술만 (코드 변경 불필요, 기존 구현은 소규모 CRL에 유효)

#### 39. ~~Abstract Gas 비용 수정 (논문)~~ ✅ DONE
- **문제:** Abstract에 "77,000 gas"로 기재 — 이는 Mock Verifier 기준
- **수정:** 실제 Groth16 검증 기준 ~300,000 gas로 수정 또는 Mock임을 명시
- **변경 범위:** 논문만

### HIGH / 학술 Novelty

#### 31. ~~Merkle tree 기반 CA 익명 검증~~ ✅ DONE
- ~~현재: `caRootHash`가 온체인에 공개 → 어떤 CA(국가/기관)인지 드러남~~
- 구현 완료: `caMerkleRoot` — 허용 CA 해시의 Merkle root만 on-chain 공개
- ZK 회로 내 Merkle membership proof 검증 (sorted-pair SHA-256)
- 컨트랙트: `updateCaMerkleRoot()`, 개별 CA hash 노출 없음

#### 32. ~~Selective Disclosure entropy 보강 (user salt)~~ ✅ DONE
- 구현 완료: `disclosure_salt = H("zk-X509-Disclosure-Salt-v1" ‖ nullifier_sig)`
- 결정론적 (같은 인증서 = 같은 salt, 저장 불필요), 개인키 없으면 계산 불가
- `SHA-256(len ‖ value ‖ disclosure_salt)` — brute-force 불가

#### 33. ~~Semi-formal security model (논문용)~~ ✅ DONE
- Anonymity, Unforgeability, Unlinkability, Non-transferability에 대한 security game 정의
- SP1 soundness로의 reduction argument
- Merkle CA (#31) 없이는 Anonymity game이 성립하지 않음을 명시
- 변경 범위: 논문 전용 (코드 변경 없음)

### MEDIUM

#### 34. ~~Cycle 벤치마크 테이블~~ ✅ DONE
- RSA vs ECDSA, 2단계 vs 3단계 체인, CRL 유무별 cycle 비용 정량화
- SP1 SHA-256 precompile vs ZK-friendly hash (Poseidon) 비교 근거
- 논문의 정량적 성능 분석 섹션에 필수
- 변경 범위: script (벤치마크 스크립트), 논문

#### 35. ~~Nullifier cross-wallet linkability~~ → #36으로 흡수 (CRITICAL)
- #36에서 서명 기반 nullifier로 근본적 해결

### MEDIUM (취약점 분석 추가)

#### 40. ~~동적 MAX_PROOF_AGE + L2 timestamp 조작 방어~~ ✅ DONE
- **문제:** MAX_PROOF_AGE=1h 고정값. L2/사이드체인에서 블록 빌더가 timestamp을 조작할 수 있음
- **해결:** `setMaxProofAge(uint256)` 관리자 함수 추가 (범위: 5분~24시간)
- **변경 범위:** contracts (constant → mutable, 범위 제한)

#### 41. CA Merkle root 갱신 시 grace period
- **문제:** `updateCaMerkleRoot()` 호출 시 이전 root로 생성된 미제출 proof가 즉시 무효화
- **해결:** 이전 root를 grace period(예: 24시간) 동안 유지, 이후 자동 만료
- **변경 범위:** contracts (activeCARoots 배열 또는 deprecatedAt 타임스탬프)

#### 42. 컨트랙트 업그레이드 경로 (Proxy 패턴)
- **문제:** sp1Verifier, programVKey, maxWalletsPerCert가 immutable → 버그 수정/회로 업데이트 불가
- **해결:** TransparentUpgradeableProxy + initializer 패턴으로 전환
- **참고:** 현 단계(개발/테스트)에서는 불필요, mainnet 배포 전에 필요
- **변경 범위:** contracts (전면 리팩터), 배포 스크립트

#### 43. CA 관리 탈중앙화 (Multi-sig / DAO)
- **문제:** owner 단일 키 탈취 시 악의적 CA 추가/제거 가능
- **해결:** OpenZeppelin Governor + TimelockController, 또는 최소 multi-sig (Gnosis Safe)
- **참고:** 현 단계에서는 single owner로 충분, 운영 단계에서 전환
- **변경 범위:** contracts (governance 추가 또는 multi-sig 연동)

### HIGH (취약점 분석 추가)

#### 44. ~~Nullifier 교차 앱 추적 방지 (Cross-DApp Domain Separation)~~ ✅ DONE
- **문제:** nullifier_sig = Sign(sk, H("zk-X509-Nullifier-v1")) — 도메인 분리 없음
- **공격:** A DAO와 B DeFi에 동일 nullifier 제출 → 온체인 분석으로 동일인 추적 가능
- **해결:** `Sign(sk, H("zk-X509-Nullifier-v1" ‖ registry_address))` — 앱별 고유 nullifier
- **변경 범위:** program (nullifier domain에 contract address 포함), lib (NULLIFIER_DOMAIN 변경), host scripts

#### 45. ~~Cross-Chain Replay 방지 (chain_id 추가)~~ ✅ DONE
- **문제:** ownership challenge에 chain_id 없음 → 이더리움 proof를 폴리곤에서 재사용 가능
- **해결:** challenge = `H(serial ‖ addr ‖ wallet_index ‖ timestamp ‖ chain_id)`, 컨트랙트에서 `require(chainId == block.chainid)`
- **변경 범위:** program, ownership.rs, contracts (PublicValuesStruct에 chainId 추가)

### MEDIUM (측정 필요)

#### 52. ~~Delegated Proving을 메인 아키텍처로 격상~~ → 삭제 결정
- **결정:** 위임증명(Delegated Proving) 전체 삭제 (중앙화 이슈)
- **삭제 대상:** Section 3.10 전체, 비교표 "Delegated Proving" 행, 5.5.3/6.2/7.5 위임 언급
- **방향:** 로컬 증명 중심으로 재작성

#### 50. CRL Merkle Oracle — 대규모 CRL 지원 (← #18 흡수)
- **문제:** 현재 zkVM 내 CRL 검증은 전체 CRL DER을 입력 → 대규모 CRL(수십 MB)은 비용 비현실적
- **해결:** 오라클 운영자가 CRL의 폐지 시리얼 번호를 Merkle tree로 구성 → root만 on-chain 저장
- **zkVM:** "내 시리얼이 이 Merkle tree에 없다"는 non-membership proof 검증
- **컨트랙트:** `crlMerkleRoot` 상태 + `updateCrlMerkleRoot()` 관리자 함수
- **장점:** CRL 크기 무관 (수백만 건이어도 Merkle proof는 log(n) 해시만)
- **변경 범위:** program (Merkle non-membership proof), contracts (crlMerkleRoot 상태), script (CRL → Merkle tree 변환 도구), 오라클 운영 인프라

#### 51. zk-email 벤치마크 재실행 (메모리 설정 필요)
- **문제:** snarkjs trusted setup이 메모리 부족으로 25분+ 소요 (메모리 102MB 고정)
- **해결:** `NODE_OPTIONS=--max_old_space_size=8192 npx snarkjs groth16 setup ...`
- **측정 필요:** trusted setup 시간, proof 생성 시간, zkey 크기
- **ptau 파일:** 이미 다운로드 완료 (589MB, ptau21.ptau)

#### 49. On-chain gas 실측 (Groth16 verifier)
- **현재:** 300K gas는 추정치 (SP1 문서 + BN254 pairing 비용 기반)
- **필요:** Anvil에 SP1 Groth16 Verifier 배포 → proof 제출 → 실제 gas 측정
- **순서:** `--prove`로 proof 생성 (완료) → Anvil 배포 → register() 호출 → gas report
- **변경 범위:** 테스트만 (코드 변경 없음), BENCHMARKS.md에 실측값 업데이트

### LOW (논문 작업)

#### 46. ~~CRL 논문 톤다운~~ ✅ DONE
- "Trustless CRL" → "Host-Provided but Cryptographically Authenticated CRL"
- Freshness 공격의 한계를 Security Analysis에 명시
- CRL Oracle을 Future Work이 아닌 권장 아키텍처로 기술

#### 47. ~~Privacy-Preserving Delegated Proving 섹션 추가~~ → #52에서 삭제 결정
- ~~개인키가 zkVM에 안 들어가므로 클라우드 prover에 위임 가능~~
- **삭제 사유:** 중앙화 이슈 — 클라우드 프로버 의존은 시스템 설계 원칙에 부적합
- **후속:** #52에서 논문 내 위임증명 관련 내용 전체 제거 예정

#### 48. ~~기존 시스템 대비 정량 비교 테이블 (논문 Evaluation)~~ ✅ DONE
- DID (Polygon ID, Worldcoin), zkPassport, Semaphore, zk-email과 비교
- 비교 항목: gas cost, ZK cycle count, proof 생성 시간, 프라이버시 수준, PKI 호환성
- 표 + 그래프로 제시 (논문 Evaluation 섹션 핵심)
- 변경 범위: 논문, BENCHMARKS.md에 비교 데이터 추가

#### 53. 프론트엔드 최신 ABI 동기화
- PublicValuesStruct에 chainId, registryAddress, crlMerkleRoot 추가됨
- 에러 코드 변경 (UnsupportedCA → InvalidCaMerkleRoot 등)
- 컨트랙트 ABI 재생성 + 프론트엔드 반영

#### 54. 프론트엔드 E2E 테스트
- run-local.sh → 브라우저 → MetaMask → register() → isVerified 확인

#### 55. ARIA-CBC 지원 (OID 1.2.410.200004.1.34)
- 신형 NPKI 인증서: pbeWithSHA256AndARIA-CBC
- `aria` 크레이트 추가 필요

#### 27. LaTeX 변환 (LNCS 템플릿)
- arXiv preprint + FC 학회 제출용
- docs/paper.md → .tex 변환

#### 28. ~~LICENSE 파일 추가~~ ✅ DONE
- MIT 라이선스 추가
