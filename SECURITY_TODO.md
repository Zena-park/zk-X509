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

## 미해결

### MEDIUM

#### 18. CRL 오라클 / 온체인 CRL 커밋
- CRL 해시를 public values에 포함하거나, 온체인 CRL 오라클 구축
- 현재 CRL은 프루버 서버가 로컬에서 제공

#### 19. ECDSA 서명 지원
- 현대 X.509는 ECDSA 사용 추세, 현재 RSA만 지원
- `p256`/`p384` 크레이트로 검증 추가

#### 20. Solidity 형식 검증
- Certora, Halmos 등으로 IdentityRegistry 검증 미실시

#### 21. 다단계 인증서 비용 최적화
- 3단계 NPKI 체인 ~13M cycles, RSA precompile 활용 등

#### 22. 클라이언트 사이드 프루빙 (SP1 WASM)
- SP1 WASM prover 지원 대기 중

#### 23. NPKI 스캐너 단위 테스트
- temp directory로 스캐너 동작 검증 필요

### HIGH

#### 24. 서명 기반 소유 증명 (OS 키체인 연동)
- 현재: 개인키 원본이 ZK 회로 입력으로 들어감 → 프로세스 메모리에 평문 존재
- 개선: OS 키체인(macOS Secure Enclave, Windows TPM)이 서명만 수행, 서명값만 ZK 회로에 입력
- `user_priv_key` 입력 → `ownership_sig`, `nullifier_sig` 입력으로 교체
- nullifier: `SHA-256(serial ‖ SHA-256(sk))` → `SHA-256(serial ‖ RSA_Sign(serial, sk))`
- RSA PKCS#1 v1.5는 결정론적 → nullifier 결정성 유지
- 트레이드오프: ZK 사이클 ~7.2M → ~12.7M (+RSA 검증 1회)
- 변경 범위: program, script/keychain.rs, script/server.rs

#### 25. reRegister() — 관리자 없이 지갑 변경
- 현재: revokeUser는 onlyOwner → 중앙화 모순
- 개선: 사용자가 같은 인증서로 새 proof 생성하여 기존 등록 교체
- 동일 nullifier의 지갑 주소만 업데이트, 관리자 불필요
- 변경 범위: contracts (reRegister 함수), 논문 Section 3.5

#### 26. Configurable Registration Policy (maxWalletsPerCert)
- DAO (1:1) vs DeFi (1:N) 용도별 등록 정책 설정
- nullifier: `SHA-256(serial ‖ SHA-256(sk) ‖ wallet_index)`
- ZK 회로에서 `wallet_index < maxWalletsPerCert` 검증
- 컨트랙트 constructor 파라미터로 설정
- 변경 범위: lib, program, contracts

### LOW

#### 27. LaTeX 변환 (LNCS 템플릿)
- arXiv preprint + FC 학회 제출용
- docs/paper.md → .tex 변환

#### 28. LICENSE 파일 추가
- MIT 라이선스 (미결정)
