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

### HIGH / 학술 Novelty

#### 29. 인증서 만료일 기반 자동 인증 만료
- 현재: isVerified가 영구적 — 인증서 만료돼도 true 유지 (문제)
- 개선: ZK 프로그램이 인증서 notAfter를 public values에 포함
- 컨트랙트에서 verifiedUntil[user] = notAfter, isVerified에서 block.timestamp 비교
- 변경 범위: lib(notAfter 필드), program(commit), contracts(verifiedUntil mapping)

#### 30. 선택적 공개 (Selective Disclosure)
- 인증서의 특정 필드만 증명 (예: 국적, 발급기관)
- 이름, 주민번호 등 나머지는 공개하지 않음
- X.509에 대한 ZK 선택적 공개는 아직 미구현 (zk-email은 DKIM 한정)
- 변경 범위: program (필드별 해싱), lib (선택적 public values)

#### 31. Merkle tree 기반 CA 익명 검증
- 현재: `caRootHash`가 온체인에 공개 → 어떤 CA(국가/기관)인지 드러남
- 멀티 국가 배포 시 사용자 국적 노출 문제
- 개선: 허용 CA 해시들의 Merkle tree 구성, 온체인에는 Merkle root만 저장
- ZK 회로 안에서 Merkle membership proof → "허용된 CA 중 하나"만 증명
- caRootHash 대신 Merkle root를 public value로 커밋
- 변경 범위: contracts (Merkle root 관리), program (Merkle proof 검증), lib (public values)

### LOW

#### 27. LaTeX 변환 (LNCS 템플릿)
- arXiv preprint + FC 학회 제출용
- docs/paper.md → .tex 변환

#### 28. LICENSE 파일 추가
- MIT 라이선스 (미결정)
