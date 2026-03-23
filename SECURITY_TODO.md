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

#### 18. CRL 오라클 / 온체인 CRL 커밋
- CRL 해시를 public values에 포함하거나, 온체인 CRL 오라클 구축
- 현재 CRL은 프루버 서버가 로컬에서 제공

#### 20. Solidity 형식 검증
- Certora, Halmos 등으로 IdentityRegistry 검증 미실시

#### 21. ~~다단계 인증서 비용 최적화~~ ✅ DONE
- zkVM: Vec → 스택 배열 (선택적 공개), 스트리밍 SHA-256 (ownership/nullifier)
- Solidity: register()/reRegister()에서 verifiedUntil 체크를 proof 검증 전으로 이동 (gas 절감)

#### 22. 클라이언트 사이드 프루빙 (SP1 WASM)
- SP1 WASM prover 지원 대기 중

#### 23. NPKI 스캐너 단위 테스트
- temp directory로 스캐너 동작 검증 필요

### HIGH / 학술 Novelty

#### 31. ~~Merkle tree 기반 CA 익명 검증~~ ✅ DONE
- ~~현재: `caRootHash`가 온체인에 공개 → 어떤 CA(국가/기관)인지 드러남~~
- 구현 완료: `caMerkleRoot` — 허용 CA 해시의 Merkle root만 on-chain 공개
- ZK 회로 내 Merkle membership proof 검증 (sorted-pair SHA-256)
- 컨트랙트: `updateCaMerkleRoot()`, 개별 CA hash 노출 없음

#### 32. Selective Disclosure entropy 보강 (user salt)
- 현재: `SHA-256(len || value || cert_serial)` — serial은 CA가 공개하는 값
- 국가코드(~200개) 등 입력 공간이 작은 필드는 brute-force 가능
- 개선: 사용자 제공 random salt 추가 → `SHA-256(len || value || cert_serial || user_salt)`
- SHA-256 precompile 유지하면서 information-theoretic hiding에 근접
- 변경 범위: program (salt 입력 추가), lib (public values에 salt commitment 옵션), host (salt 생성/관리)

#### 33. Semi-formal security model (논문용)
- Anonymity, Unforgeability, Unlinkability, Non-transferability에 대한 security game 정의
- SP1 soundness로의 reduction argument
- Merkle CA (#31) 없이는 Anonymity game이 성립하지 않음을 명시
- 변경 범위: 논문 전용 (코드 변경 없음)

### MEDIUM

#### 34. Cycle 벤치마크 테이블
- RSA vs ECDSA, 2단계 vs 3단계 체인, CRL 유무별 cycle 비용 정량화
- SP1 SHA-256 precompile vs ZK-friendly hash (Poseidon) 비교 근거
- 논문의 정량적 성능 분석 섹션에 필수
- 변경 범위: script (벤치마크 스크립트), 논문

#### 35. Nullifier cross-wallet linkability
- `nullifier = SHA-256(pubkey || wallet_index)` — 공격자가 pubkey를 알면 wallet_index별 nullifier 연관성 확인 가능
- 공개키는 인증서에 포함되므로 CA/employer 등이 추적 가능
- 개선: `nullifier = SHA-256(pubkey || wallet_index || secret)` 또는 blinding factor 도입
- 변경 범위: program (nullifier 생성), contracts (검증 로직), lib (public values)

### LOW

#### 27. LaTeX 변환 (LNCS 템플릿)
- arXiv preprint + FC 학회 제출용
- docs/paper.md → .tex 변환

#### 28. LICENSE 파일 추가
- MIT 라이선스 (미결정)
