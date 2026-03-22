# zk-X509 보안 이슈 트래커

## 완료

| # | 이슈 | 브랜치 | PR |
|---|------|--------|-----|
| 2 | Ownable2Step (2단계 소유권 이전) | `sec/multisig-owner` | merged |
| 3 | 인증서 체인 검증 (3단계 NPKI) | `sec/cert-chain` | merged |
| 4 | CRL 기반 인증서 폐지 확인 | `sec/revocation-check` | merged |
| 5 | 비상 정지 (pause/unpause) | `sec/pausable` | merged |
| 6 | 인증 취소 (revokeUser) | `sec/revoke-user` | merged |
| 7 | Timestamp 검증 (±1시간) | `fix/post-review` | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 8 | Nullifier brute-force 방지 (serial+privkey) | `fix/post-review` | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 9 | msg.sender 바인딩 (front-running 방어) | `sec/msg-sender-binding` | [#2](https://github.com/tokamak-network/zk-X509/pull/2) |
| 10 | CORS 제한 (localhost only) | `fix/post-review` | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 11 | Request body 1MB 제한 | `fix/post-review` | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 12 | Debug derive 제거 (키 로깅 방지) | `fix/post-review` | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 13 | Password 메모리 즉시 삭제 | `fix/post-review` | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |
| 14 | Mock proof 코드 제거 | `fix/post-review` | [#1](https://github.com/tokamak-network/zk-X509/pull/1) |

## 미해결

### CRITICAL

#### 1. 개인키 평문 전송 → OS 키체인 통합으로 해결 예정
- **현재:** 프론트엔드가 개인키를 HTTP로 프루버 서버에 전송
- **완화:** CORS 제한, body limit, Debug 제거, password 삭제 적용됨
- **근본 해결:** Localhost Daemon이 OS 키체인(macOS Keychain / Windows Credential Store)에서 직접 키를 읽어 증명 생성. 웹앱은 "인증서 선택" 요청만 전송하고 개인키 바이트를 받지 않음.
- **문서:** `docs/client-side-proving.md`

### MEDIUM

#### 15. CRL 서명 검증 미비 → PR #5에서 해결 중
- **현재:** zkVM 안에서 CRL DER 파싱 + CA 서명 검증 구현 완료
- **PR:** [#5](https://github.com/tokamak-network/zk-X509/pull/5)

#### 16. SEED-CBC 복호화 미지원 → PR #4에서 해결됨
- **완료:** `kisaseed` 크레이트 통합, 제네릭 `decrypt_cbc<C>()` 구현

### 다음 작업 (TODO)

#### 17. OS 키체인 연동 (`sec/keychain-integration`)
- **내용:** Prover Server가 macOS Keychain / Windows CNG에서 인증서+개인키를 직접 로드
- **변경:** server.rs에 키체인 API 추가, Upload.tsx를 "인증서 선택" UI로 교체
- **노력:** 높음 (플랫폼별 네이티브 API)

#### 18. CRL 오라클 / 온체인 CRL 커밋
- **내용:** CRL이 Host 제공이고 온체인에 커밋되지 않음. CRL 해시를 public values에 포함하거나, 온체인 CRL 오라클 구축
- **노력:** 높음

#### 19. ECDSA 서명 지원
- **내용:** 현대 X.509는 ECDSA 사용 추세인데 RSA만 지원
- **해결:** `p256`/`p384` 크레이트로 ECDSA 검증 추가
- **노력:** 중간

#### 20. Solidity 형식 검증 (Formal Verification)
- **내용:** Certora, Halmos 등으로 IdentityRegistry 형식 검증 미실시
- **노력:** 중간

#### 21. 다단계 인증서 비용 최적화
- **내용:** 3단계 NPKI 체인이 ~13M cycles (단일 대비 ~2배). RSA precompile 활용 등 최적화
- **노력:** 중간

#### 22. 클라이언트 사이드 프루빙 (SP1 WASM)
- **내용:** 브라우저에서 100% 증명 생성 — SP1 WASM prover 지원 대기 중
- **노력:** SP1 의존 (현재 불가)
