# CA Registry CI Validation Design

## Overview

The `tokamak-network/zk-x509-ca-registry` repository needs a CI pipeline that validates every PR before merge. The CI ensures:

1. DER files are valid X.509 certificates
2. Filenames match the certificate's SPKI hash
3. `service.json` is well-formed and consistent with the DER files
4. Each PR only modifies one service directory (scope enforcement)

## Repository Structure (Recap)

```
services/
  {chainId}/
    {registryAddress}/
      service.json
      certs/
        0x{hash1}.der
        0x{hash2}.der
```

- `{registryAddress}`: lowercase hex with `0x` prefix
- `{hash}.der`: `SHA-256(SPKI DER)` in lowercase hex with `0x` prefix

## CI Pipeline

### Trigger

```yaml
on:
  pull_request:
    paths: ['services/**']
```

Only runs when files under `services/` are changed.

### Jobs

```
┌─────────────────────────────────────────────────┐
│                 PR Validation                    │
│                                                  │
│  1. detect-changes                               │
│     └─ List changed service directories          │
│     └─ Verify PR modifies only 1 service dir     │
│                                                  │
│  2. validate-certs                               │
│     └─ For each .der file:                       │
│        ├─ Parse as X.509                         │
│        ├─ Extract SPKI → compute SHA-256         │
│        ├─ Verify hash == filename                │
│        ├─ Check cert not expired                 │
│        └─ Check cert is a CA (Basic Constraints) │
│                                                  │
│  3. validate-service-json                        │
│     └─ JSON schema validation                    │
│     └─ All cas keys have matching .der file      │
│     └─ No orphan .der files (not in cas)         │
│                                                  │
│  4. summary                                      │
│     └─ Post validation report as PR comment      │
└─────────────────────────────────────────────────┘
```

## Validation Rules

### 1. PR Scope Check

**Rule**: A single PR must only modify files within **one** `services/{chainId}/{addr}/` directory.

**Why**: Prevents cross-service contamination. Each admin manages only their own service.

```python
# Pseudocode
changed_dirs = set()
for file in changed_files:
    # Extract services/{chainId}/{addr}/ prefix
    parts = file.split('/')
    if len(parts) >= 3 and parts[0] == 'services':
        changed_dirs.add(f"{parts[0]}/{parts[1]}/{parts[2]}")

if len(changed_dirs) > 1:
    fail("PR modifies multiple service directories")
if len(changed_dirs) == 0:
    fail("No service directory changes detected")
```

**Exception**: README.md, scripts/, .github/ changes are allowed alongside service changes.

### 2. DER Certificate Validation

For each `.der` file added or modified:

| Check | Description | Error Message |
|-------|-------------|---------------|
| **Parseable** | File is valid DER-encoded X.509 | `{file}: invalid X.509 DER` |
| **Hash match** | `SHA-256(SPKI) == filename` | `{file}: hash mismatch, expected 0x{actual}` |
| **Not expired** | `notAfter > now` | `{file}: certificate expired on {date}` |
| **Is CA** | BasicConstraints CA=true, or self-signed (issuer == subject) | `{file}: not a CA certificate (warning)` |
| **File size** | < 10KB (typical CA cert is 1-2KB) | `{file}: suspiciously large ({size} bytes)` |

**Hash verification logic**:
```python
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization

cert = x509.load_der_x509_certificate(der_bytes)
spki_der = cert.public_key().public_bytes(
    serialization.Encoding.DER,
    serialization.PublicFormat.SubjectPublicKeyInfo
)
actual_hash = hashlib.sha256(spki_der).hexdigest()
expected_hash = filename.replace("0x", "").replace(".der", "")

assert actual_hash == expected_hash
```

**CA detection logic** (must implement both conditions from the table):
```python
from cryptography.x509 import ExtensionNotFound
from cryptography.x509.oid import ExtensionOID

def is_ca_certificate(cert: x509.Certificate) -> bool:
    # Check 1: BasicConstraints CA=true
    try:
        bc = cert.extensions.get_extension_for_oid(ExtensionOID.BASIC_CONSTRAINTS)
        if bc.value.ca:
            return True
    except ExtensionNotFound:
        pass
    # Check 2: Self-signed (issuer == subject)
    if cert.issuer == cert.subject:
        return True
    return False
```

### 3. service.json Validation

**Schema**:
```json
{
  "type": "object",
  "required": ["name", "description", "admin", "created_at", "updated_at", "cas"],
  "properties": {
    "name": { "type": "string", "minLength": 1, "maxLength": 100 },
    "description": { "type": "string", "minLength": 1, "maxLength": 500 },
    "admin": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
    "website": { "type": "string" },
    "created_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "updated_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "cas": {
      "type": "object",
      "patternProperties": {
        "^0x[0-9a-f]{64}$": {
          "type": "object",
          "required": ["name"],
          "properties": {
            "name": { "type": "string" },
            "description": { "type": "string" },
            "issue_url": { "type": "string" },
            "instructions": { "type": "string" }
          }
        }
      },
      "additionalProperties": false
    }
  }
}
```

**Cross-reference checks**:

| Check | Description |
|-------|-------------|
| **cas → certs** | Every key in `cas` must have a matching `certs/0x{key}.der` file |
| **certs → cas** | Every `.der` file must have a matching entry in `cas` (warning, not error) |
| **Directory name** | `{addr}` in path must be lowercase hex with `0x` prefix |
| **Chain ID** | `{chainId}` in path must be a valid number |

**Directory path validation logic** (must be enforced during service directory detection):
```python
import re

def validate_service_path(service_dir: str) -> list[str]:
    """Validate {chainId}/{addr} directory naming convention."""
    errors = []
    parts = service_dir.strip("/").split("/")
    # Expected: services/{chainId}/{addr}
    if len(parts) >= 3:
        chain_id, addr = parts[-2], parts[-1]
        if not chain_id.isdigit():
            errors.append(f"{service_dir}: chainId '{chain_id}' is not a valid number")
        if not re.fullmatch(r"0x[0-9a-f]{40}", addr):
            errors.append(f"{service_dir}: address '{addr}' must be lowercase hex with 0x prefix (42 chars)")
    return errors
```

### 4. Validation Report

CI posts a summary comment on the PR:

```markdown
## CA Registry Validation ✅

**Service**: `services/11155111/0xe7f1.../`

### Certificates (2 validated)
| File | Subject | Algorithm | Expires | Hash |
|------|---------|-----------|---------|------|
| ✅ `0x28a2...1234.der` | yessignCA Class 3 | RSA-2048 | 2027-06-15 | match |
| ✅ `0x7b3c...5678.der` | KISA RootCA 4 | RSA-4096 | 2032-11-19 | match |

### service.json
- ✅ Schema valid
- ✅ All 2 CA entries have matching .der files
- ✅ Admin: `0xf39F...2266`

### Scope
- ✅ PR modifies only one service directory
```

Or on failure:

```markdown
## CA Registry Validation ❌

### Errors
- ❌ `0xdead...beef.der`: hash mismatch — filename says `0xdead...beef`, actual SPKI hash is `0xabcd...1234`
- ❌ `service.json`: CA entry `0x1111...2222` has no matching .der file

### Warnings
- ⚠ `0x28a2...1234.der`: certificate expires in 30 days (2026-04-25)
```

## Implementation

### Tech Stack

| Component | Tool |
|-----------|------|
| CI Platform | GitHub Actions |
| Language | Python 3.x |
| X.509 Parsing | `cryptography` (PyCA) |
| JSON Schema | `jsonschema` |
| PR Comment | `actions/github-script` or `gh` CLI |

### File Structure

```
zk-x509-ca-registry/
├── .github/
│   └── workflows/
│       └── validate-pr.yml        # Main CI workflow
├── scripts/
│   ├── validate.py                # Main validation script
│   ├── requirements.txt           # Python dependencies
│   └── schema/
│       └── service.schema.json    # JSON Schema for service.json
├── services/
│   └── ...
└── README.md
```

### validate-pr.yml

```yaml
name: Validate PR

on:
  pull_request:
    paths: ['services/**']

permissions:
  pull-requests: write
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Need full history for diff

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Get changed files
        id: changes
        run: |
          FILES=$(git diff --name-only origin/main...HEAD -- services/)
          echo "files<<EOF" >> $GITHUB_OUTPUT
          echo "$FILES" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Run validation
        id: validate
        run: |
          python scripts/validate.py \
            --changed-files "${{ steps.changes.outputs.files }}" \
            --output report.md

      - name: Post validation report
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('report.md', 'utf8');
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: report,
            });

      - name: Fail if validation errors
        run: |
          if grep -q "❌" report.md; then
            echo "Validation failed"
            exit 1
          fi
```

### validate.py (Core Logic)

```python
#!/usr/bin/env python3
"""Validate CA registry PR: DER certs, service.json, PR scope."""

import hashlib
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

from cryptography import x509
from cryptography.hazmat.primitives import serialization
import jsonschema


def validate_der(filepath: Path) -> dict:
    """Validate a single DER certificate file."""
    result = {"file": str(filepath), "errors": [], "warnings": [], "info": {}}

    der_bytes = filepath.read_bytes()

    # Size check
    if len(der_bytes) > 10_000:
        result["warnings"].append(f"Large file: {len(der_bytes)} bytes")

    # Parse X.509
    try:
        cert = x509.load_der_x509_certificate(der_bytes)
    except Exception as e:
        result["errors"].append(f"Invalid X.509 DER: {e}")
        return result

    # Extract info
    result["info"]["subject"] = cert.subject.rfc4514_string()
    result["info"]["issuer"] = cert.issuer.rfc4514_string()
    result["info"]["not_after"] = cert.not_valid_after_utc.isoformat()

    # Detect algorithm
    pub_key = cert.public_key()
    from cryptography.hazmat.primitives.asymmetric import rsa, ec
    if isinstance(pub_key, rsa.RSAPublicKey):
        result["info"]["algorithm"] = f"RSA-{pub_key.key_size}"
    elif isinstance(pub_key, ec.EllipticCurvePublicKey):
        result["info"]["algorithm"] = f"ECDSA-{pub_key.curve.name}"
    else:
        result["info"]["algorithm"] = "Unknown"

    # Hash verification: SHA-256(SPKI) == filename
    spki_der = pub_key.public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    actual_hash = hashlib.sha256(spki_der).hexdigest()
    expected_hash = filepath.stem.lower().replace("0x", "")

    if actual_hash != expected_hash:
        result["errors"].append(
            f"Hash mismatch: filename={expected_hash[:16]}…, actual={actual_hash[:16]}…"
        )

    # Expiry check
    now = datetime.now(timezone.utc)
    if cert.not_valid_after_utc < now:
        result["errors"].append(
            f"Certificate expired on {cert.not_valid_after_utc.date()}"
        )
    elif (cert.not_valid_after_utc - now).days < 90:
        result["warnings"].append(
            f"Expires in {(cert.not_valid_after_utc - now).days} days"
        )

    # CA check (BasicConstraints)
    try:
        bc = cert.extensions.get_extension_for_class(x509.BasicConstraints)
        if not bc.value.ca:
            result["warnings"].append("BasicConstraints CA=false (not a CA cert)")
    except x509.ExtensionNotFound:
        result["warnings"].append("No BasicConstraints extension")

    return result


def validate_service_json(filepath: Path, certs_dir: Path) -> dict:
    """Validate service.json against schema and cross-reference certs."""
    result = {"errors": [], "warnings": []}

    try:
        data = json.loads(filepath.read_text())
    except json.JSONDecodeError as e:
        result["errors"].append(f"Invalid JSON: {e}")
        return result

    # Schema validation
    schema_path = Path(__file__).parent / "schema" / "service.schema.json"
    if schema_path.exists():
        schema = json.loads(schema_path.read_text())
        try:
            jsonschema.validate(data, schema)
        except jsonschema.ValidationError as e:
            result["errors"].append(f"Schema error: {e.message}")

    # Cross-reference: cas keys → .der files
    cas = data.get("cas", {})
    for ca_hash in cas:
        normalized = ca_hash.lower()
        if not normalized.startswith("0x"):
            normalized = f"0x{normalized}"
        der_file = certs_dir / f"{normalized}.der"
        if not der_file.exists():
            result["errors"].append(
                f"CA entry {ca_hash} has no matching .der file"
            )

    # Cross-reference: .der files → cas keys
    if certs_dir.exists():
        for der_file in certs_dir.glob("0x*.der"):
            hash_key = der_file.stem.lower()
            if hash_key not in {k.lower() for k in cas}:
                result["warnings"].append(
                    f"{der_file.name} not listed in service.json cas"
                )

    return result


def detect_service_dirs(changed_files: list[str]) -> set[str]:
    """Extract unique service directory prefixes from changed files."""
    dirs = set()
    for f in changed_files:
        parts = f.split("/")
        if len(parts) >= 3 and parts[0] == "services":
            dirs.add(f"{parts[0]}/{parts[1]}/{parts[2]}")
    return dirs


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--changed-files", required=True)
    parser.add_argument("--output", default="report.md")
    args = parser.parse_args()

    changed = [f for f in args.changed_files.strip().split("\n") if f]
    service_dirs = detect_service_dirs(changed)

    errors = []
    warnings = []
    cert_results = []

    # Scope check
    if len(service_dirs) > 1:
        errors.append(f"PR modifies {len(service_dirs)} service directories: {service_dirs}")
    if len(service_dirs) == 0:
        errors.append("No service directory changes detected")

    # Validate each service directory
    for sdir in service_dirs:
        sdir_path = Path(sdir)

        # Validate DER files
        certs_dir = sdir_path / "certs"
        if certs_dir.exists():
            for der_file in sorted(certs_dir.glob("0x*.der")):
                result = validate_der(der_file)
                cert_results.append(result)
                errors.extend(result["errors"])
                warnings.extend(result["warnings"])

        # Validate service.json
        svc_json = sdir_path / "service.json"
        if svc_json.exists():
            result = validate_service_json(svc_json, certs_dir)
            errors.extend(result["errors"])
            warnings.extend(result["warnings"])
        else:
            errors.append(f"Missing service.json in {sdir}")

    # Generate report
    has_errors = len(errors) > 0
    status = "❌" if has_errors else "✅"

    report = f"## CA Registry Validation {status}\n\n"
    report += f"**Service**: `{', '.join(service_dirs)}`\n\n"

    if cert_results:
        report += f"### Certificates ({len(cert_results)} validated)\n"
        report += "| File | Subject | Algorithm | Expires | Hash |\n"
        report += "|------|---------|-----------|---------|------|\n"
        for cr in cert_results:
            icon = "❌" if cr["errors"] else "✅"
            info = cr["info"]
            subject = info.get("subject", "?")[:40]
            alg = info.get("algorithm", "?")
            exp = info.get("not_after", "?")[:10]
            hash_status = "mismatch" if any("mismatch" in e for e in cr["errors"]) else "match"
            report += f"| {icon} `{Path(cr['file']).name[:20]}…` | {subject} | {alg} | {exp} | {hash_status} |\n"
        report += "\n"

    if errors:
        report += "### Errors\n"
        for e in errors:
            report += f"- ❌ {e}\n"
        report += "\n"

    if warnings:
        report += "### Warnings\n"
        for w in warnings:
            report += f"- ⚠ {w}\n"
        report += "\n"

    if not errors and not warnings:
        report += "All checks passed.\n"

    Path(args.output).write_text(report)
    print(report)

    if has_errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

### requirements.txt

```
cryptography>=42.0
jsonschema>=4.20
```

### service.schema.json

위 **3. service.json Validation** 섹션의 JSON Schema 그대로.

## Edge Cases

| 시나리오 | 처리 |
|----------|------|
| 새 서비스 등록 (service.json + certs 모두 신규) | 정상 — 전체 검증 |
| CA 추가 (certs/ 추가 + service.json cas 업데이트) | 정상 — 증분 검증 |
| CA 제거 (certs/ 삭제 + service.json cas 제거) | DER 삭제는 검증 불필요, service.json만 검증 |
| service.json만 수정 (설명 변경) | service.json 검증, certs 검증 skip |
| README.md만 수정 | CI 트리거 안 됨 (paths filter) |
| 여러 서비스 디렉토리 동시 수정 | **에러** — 1 PR = 1 서비스 |
| 잘못된 chainId (문자열 등) | 디렉토리 구조 검증에서 에러 |
| 만료된 인증서 등록 시도 | **에러** — notAfter < now |
| 만료 임박 (90일 이내) | **경고** |

## Security Considerations

| 위협 | 대응 |
|------|------|
| 악성 DER 파일 (비정상 크기) | 10KB 크기 제한 |
| 다른 서비스 디렉토리 수정 시도 | PR scope check (1 디렉토리만) |
| service.json 조작 | JSON schema 검증 |
| 해시 위조 (파일명 ≠ 실제 해시) | SHA-256(SPKI) == filename 검증 |
| CI 우회 | Branch protection rule: require CI pass |

## Setup Checklist

1. [ ] `scripts/validate.py` 작성
2. [ ] `scripts/requirements.txt` 작성
3. [ ] `scripts/schema/service.schema.json` 작성
4. [ ] `.github/workflows/validate-pr.yml` 작성
5. [ ] Branch protection: main 브랜치 require PR + CI pass
6. [ ] README.md: contributing guide (PR 제출 방법)
7. [ ] 테스트: 정상 PR, 해시 불일치 PR, 만료 인증서 PR로 CI 검증
