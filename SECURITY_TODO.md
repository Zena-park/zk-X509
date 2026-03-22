# zk-X509 보안 이슈 트래커

보안 감사에서 발견된 미해결 이슈 목록. 각 이슈는 별도 브랜치에서 작업합니다.

## CRITICAL

### 1. 개인키 평문 전송 (`sec/client-side-proving`)
- **현재:** 프론트엔드가 개인키 원본을 HTTP JSON으로 프루버 서버에 전송
- **위험:** 네트워크 도청, 서버 관리자 수집, 로그 기록
- **해결:** 클라이언트 사이드 프루빙 (SP1 WASM prover) 또는 TEE 기반 프루빙
- **파일:** `frontend/src/components/Upload.tsx`, `script/src/bin/server.rs`
- **노력:** 높음 (아키텍처 변경)

## HIGH

### 2. Owner 단일 장애점 (`sec/multisig-owner`)
- **현재:** 단일 EOA가 CA 추가/제거, ownership 이전 가능
- **위험:** Owner 키 탈취 시 악성 CA 등록 또는 합법 CA 제거
- **해결:** OpenZeppelin Ownable2Step + Timelock 또는 Gnosis Safe multisig
- **파일:** `contracts/src/IdentityRegistry.sol`
- **노력:** 중간

## MEDIUM

### 3. 인증서 체인 검증 (`sec/cert-chain`)
- **현재:** 단일 CA 공개키로만 검증 (1단계)
- **위험:** 중간 CA 없이 직접 루트 CA로 서명된 인증서만 지원
- **해결:** 한국 NPKI 3단계 체인 (Root CA → 금융결제원 CA → 사용자) 순회 검증
- **파일:** `program/src/main.rs`
- **노력:** 높음

### 4. 인증서 폐지 확인 (`sec/revocation-check`)
- **현재:** CRL/OCSP 검증 없음
- **위험:** 분실 신고된 인증서로도 등록 가능
- **해결:** Host에서 CRL 다운로드 후 zkVM에 전달, 또는 온체인 CRL 오라클
- **파일:** `program/src/main.rs`, `script/src/bin/server.rs`
- **노력:** 높음

### 5. 컨트랙트 비상 정지 기능 (`sec/pausable`)
- **현재:** pause/unpause 없음
- **위험:** 취약점 발견 시 즉시 중단 불가
- **해결:** OpenZeppelin Pausable 패턴 적용
- **파일:** `contracts/src/IdentityRegistry.sol`
- **노력:** 낮음

### 6. 인증 취소 기능 (`sec/revoke-user`)
- **현재:** 한번 verifiedUsers에 등록되면 취소 불가
- **위험:** 인증서 만료/폐지 후에도 영구 인증 상태
- **해결:** `revokeUser()` 관리자 함수 + 만료 시간 필드 추가
- **파일:** `contracts/src/IdentityRegistry.sol`
- **노력:** 낮음

## 브랜치 전략

```
main
 ├── sec/client-side-proving    (#1 클라이언트 사이드 프루빙)
 ├── sec/multisig-owner         (#2 Multisig/Timelock)
 ├── sec/cert-chain             (#3 인증서 체인)
 ├── sec/revocation-check       (#4 CRL/OCSP)
 ├── sec/pausable               (#5 비상 정지)
 └── sec/revoke-user            (#6 인증 취소)
```

각 브랜치는 main에서 분기 → PR 리뷰 → main 머지 순서로 진행합니다.
