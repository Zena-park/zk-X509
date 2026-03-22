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

#### 1. 개인키 평문 전송
- **현재:** 프론트엔드가 개인키를 HTTP로 프루버 서버에 전송
- **완화:** CORS 제한, body limit, Debug 제거, password 삭제 적용됨
- **근본 해결:** 클라이언트 사이드 프루빙 (SP1 WASM) — SP1 지원 대기 중
- **문서:** `docs/client-side-proving.md`

### MEDIUM

#### 15. CRL 서명 검증 미비
- **현재:** Host가 제공한 CRL 시리얼 목록을 그대로 신뢰
- **위험:** 악의적 Host가 빈 CRL을 넣으면 폐지된 인증서도 통과
- **해결:** CRL DER 전체를 zkVM에 전달하여 CA 서명 검증, 또는 CRL 해시를 public values에 포함

#### 16. SEED-CBC 복호화 미지원
- **현재:** NPKI 개인키 중 SEED-CBC 암호화는 에러 반환
- **위험:** 대부분의 실제 한국 공인인증서가 SEED 사용
- **해결:** `seed` 크레이트 추가 또는 WASM SEED 구현
