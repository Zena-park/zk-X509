# zk-X509 Platform Architecture Design

## Problem

The current zk-X509 system is a **single-instance deployment**: one contract, one admin, one CA list, one configuration. For real-world adoption, different services need different identity policies:

| Service | MAX_WALLETS | Disclosure | CA Policy |
|---------|------------|------------|-----------|
| DAO voting | 1 | None (0x00) | Korean NPKI only |
| DeFi KYC | 3 | Country (0x01) | Global CAs |
| Corporate | 1 | All (0x0F) | Internal CA only |
| Airdrop | 1 | None (0x00) | Any government CA |

Each service needs its own Registry with its own admin, CA list, and policies. zk-X509 should become a **self-service platform** where anyone can deploy and manage their own identity registry.

## Current Architecture (Single-Instance)

```
                    ┌─────────────────────┐
                    │   SP1VerifierGroth16 │  (shared, stateless)
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  IdentityRegistry   │  (single instance)
                    │                     │
                    │  owner: 0xAdmin     │
                    │  MAX_WALLETS: 3     │  ← immutable
                    │  caLeaves: [...]    │
                    │  nullifiers: {...}  │
                    │  verified: {...}    │
                    └─────────────────────┘
```

### Key Constraints
- `MAX_WALLETS_PER_CERT`: immutable (set at deployment)
- `PROGRAM_V_KEY`: immutable (same ZK program for all)
- `SP1_VERIFIER`: immutable (shared verifier)
- CA list, CRL, proof age, grace period: mutable by owner

## Proposed Architecture (Platform)

```
                    ┌─────────────────────┐
                    │   SP1VerifierGroth16 │  (shared, deployed once)
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   RegistryFactory   │  (platform entry point)
                    │                     │
                    │  createRegistry()   │
                    │  registries: [...]  │
                    │  programVKey: 0x... │
                    └──────┬──────┬───────┘
                           │      │
              ┌────────────▼┐  ┌──▼────────────┐
              │  Registry A │  │  Registry B    │
              │  DAO Voting │  │  DeFi KYC      │
              │             │  │                │
              │  owner: 0xA │  │  owner: 0xB    │
              │  wallets: 1 │  │  wallets: 3    │
              │  mask: 0x00 │  │  mask: 0x01    │
              │  CA: [NPKI] │  │  CA: [global]  │
              └─────────────┘  └────────────────┘
```

## Design Options

### Option A: Factory Pattern (Recommended)

A `RegistryFactory` contract deploys new `IdentityRegistry` instances via `create2`.

```solidity
contract RegistryFactory {
    ISP1Verifier public immutable verifier;
    bytes32 public immutable programVKey;

    address[] public registries;
    mapping(address => bool) public isRegistry;

    event RegistryCreated(
        address indexed registry,
        address indexed owner,
        uint32 maxWallets,
        uint8 minDisclosureMask
    );

    function createRegistry(
        uint32 maxWallets,
        uint8 minDisclosureMask
    ) external returns (address) {
        IdentityRegistry registry = new IdentityRegistry(
            address(verifier),
            programVKey,
            maxWallets
        );
        registry.transferOwnership(msg.sender);
        registries.push(address(registry));
        isRegistry[address(registry)] = true;
        emit RegistryCreated(address(registry), msg.sender, maxWallets, minDisclosureMask);
        return address(registry);
    }

    function getRegistryCount() external view returns (uint256) {
        return registries.length;
    }
}
```

**Pros:**
- Minimal changes to existing IdentityRegistry
- Each tenant gets a fully independent contract
- Existing tests and security properties preserved
- Gas: ~2M gas per deployment (one-time cost per service)

**Cons:**
- Each registry is a full contract deployment (not gas-cheap)
- No shared state between registries (by design — isolation)

### Option B: Clone/Proxy Pattern

Use EIP-1167 Minimal Proxy (Clones) for cheaper deployments.

```solidity
contract RegistryFactory {
    address public immutable implementation;

    function createRegistry(uint32 maxWallets) external returns (address) {
        address clone = Clones.clone(implementation);
        IdentityRegistry(clone).initialize(verifier, programVKey, maxWallets, msg.sender);
        return clone;
    }
}
```

**Pros:**
- Much cheaper deployments (~45K gas vs ~2M gas)
- Same isolation as Option A

**Cons:**
- Requires converting IdentityRegistry to initializable pattern
- `immutable` variables become storage variables (slightly more gas per read)
- Breaking change to existing contract

### Option C: Multi-Tenant Single Contract

Single contract with tenant-scoped state.

**Pros:**
- One contract to manage
- Shared CA lists possible

**Cons:**
- Major refactoring (every mapping gets tenantId key)
- Larger blast radius for bugs
- Complex access control
- NOT RECOMMENDED

## Recommended Approach: Option A (Factory)

Option A requires the **least changes** to the battle-tested IdentityRegistry and provides full tenant isolation.

### Changes Required

#### 1. New Contract: `RegistryFactory.sol`
- `createRegistry(maxWallets, minDisclosureMask)` → deploy + transfer ownership
- Registry listing: `registries[]`, `isRegistry()`
- Events for indexing/discovery

#### 2. Modify: `IdentityRegistry.sol`
- Add `MIN_DISCLOSURE_MASK` (immutable, constructor param)
- Validate `disclosure_mask >= MIN_DISCLOSURE_MASK` in register/reRegister
- Minor: accept ownership in constructor or add `initialize()` for factory pattern

#### 3. New: Platform Frontend
- Registry creation wizard: choose wallets, mask, name
- Registry directory: list all deployed registries
- Per-registry admin console (existing, scoped to selected registry)
- Per-registry dashboard (existing, scoped to selected registry)

#### 4. CLI / .app Updates
- Registry selector: list available registries from factory
- Or manual RPC + registry address input (already supported)

### Contract Changes Detail

```solidity
// IdentityRegistry.sol additions

uint8 public immutable MIN_DISCLOSURE_MASK;

constructor(
    address _sp1Verifier,
    bytes32 _programVKey,
    uint32 _maxWallets,
    uint8 _minDisclosureMask      // NEW
) {
    // ... existing ...
    MIN_DISCLOSURE_MASK = _minDisclosureMask;
}

// In _validateProof():
// Add check: (pv.disclosureMask & MIN_DISCLOSURE_MASK) == MIN_DISCLOSURE_MASK
```

### Migration Path

1. **Phase 1**: Add `MIN_DISCLOSURE_MASK` to IdentityRegistry (backward compatible with 0x00 default)
2. **Phase 2**: Deploy RegistryFactory pointing to SP1Verifier + programVKey
3. **Phase 3**: Platform frontend with registry creation/discovery
4. **Phase 4**: Registry directory and cross-registry analytics

### Data Flow

```
Service Owner                    Platform                     User
    │                               │                           │
    │  createRegistry(wallets=1,    │                           │
    │    mask=0x01)                  │                           │
    │──────────────────────────────>│                           │
    │                               │                           │
    │  registry deployed: 0xNew     │                           │
    │<──────────────────────────────│                           │
    │                               │                           │
    │  addCA(yessignCA hash)        │                           │
    │──────────────────────────────>│                           │
    │                               │                           │
    │                               │   register(proof, pv)     │
    │                               │<──────────────────────────│
    │                               │                           │
    │                               │   ✓ verified              │
    │                               │──────────────────────────>│
```

## Security Considerations

- Each Registry is fully independent — compromise of one doesn't affect others
- Factory owner has NO control over deployed registries (ownership transferred)
- SP1Verifier and programVKey are shared — upgrading requires new factory deployment
- Nullifiers are per-registry (different registries = different nullifiers = unlinkable)

## Gas Estimates

| Operation | Gas |
|-----------|-----|
| Deploy Factory | ~500K (one-time) |
| Create Registry | ~2M (per service) |
| addCA | ~80K (per CA) |
| register | ~300K (per user) |

## Frontend Platform Design

The frontend transitions from a **single-registry app** to a **multi-registry platform**.

### Page Structure

```
/                       → Platform Home (registry directory)
/create                 → Create Registry wizard (NEW)
/registry/[address]     → Registry detail page (NEW)
/registry/[address]/admin    → Admin Console (existing, scoped)
/registry/[address]/dashboard → User Dashboard (existing, scoped)
/faq                    → FAQ (existing)
```

### 1. Platform Home (`/`) — NEW

The landing page becomes a **registry directory** showing all deployed registries.

```
┌─────────────────────────────────────────────────────────┐
│  ZK-X509 Platform                        [Create New +] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ DAO Voting       │  │ DeFi KYC         │            │
│  │                  │  │                  │            │
│  │ Wallets: 1       │  │ Wallets: 3       │            │
│  │ Disclosure: None │  │ Disclosure: Country│           │
│  │ CAs: 5           │  │ CAs: 18          │            │
│  │ Users: 142       │  │ Users: 1,203     │            │
│  │ Chain: Sepolia   │  │ Chain: Mainnet   │            │
│  │                  │  │                  │            │
│  │ [Enter →]        │  │ [Enter →]        │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Data source:** `RegistryFactory.getRegistries()` → for each registry, read on-chain:
- `registry.owner()`
- `registry.MAX_WALLETS_PER_CERT()`
- `registry.MIN_DISCLOSURE_MASK()`
- `registry.getCaCount()`
- Registered user count (events or indexed)
- `factory.registryInfo(address).name`

### 2. Create Registry (`/create`) — NEW

Step-by-step wizard for service owners to deploy a new registry.

```
Step 1: Service Configuration
  ┌────────────────────────────────────┐
  │ Service Name: [My DAO Voting     ]│
  │                                    │
  │ Max Wallets per Certificate:       │
  │   (●) 1 — One person, one wallet  │
  │   ( ) 3 — Multiple wallets        │
  │   ( ) Custom: [___]               │
  │                                    │
  │ Required Disclosure:               │
  │   [ ] Country                      │
  │   [ ] Organization                 │
  │   [ ] Organizational Unit          │
  │   [ ] Common Name                  │
  │                                    │
  │ Estimated gas: ~2M (~0.004 ETH)   │
  │                                    │
  │          [Deploy Registry →]       │
  └────────────────────────────────────┘

Step 2: CA Registration
  → Redirect to /registry/[new-address]/admin
  → Upload CA certificates
```

**Contract call:** `factory.createRegistry(name, maxWallets, minDisclosureMask)`

### 3. Registry Detail (`/registry/[address]`) — NEW

Overview page for a specific registry. Entry point for users and admins.

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Platform         DAO Voting Registry          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Registry: 0xe7f1...0512                                │
│  Owner: 0xAdmin...                                      │
│  Chain: Sepolia (11155111)                               │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Wallets  │  │ Disclosure│  │ CAs     │              │
│  │    1     │  │   None    │  │   5     │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  User Dashboard  │  │  Admin Console  │              │
│  │  Verify identity │  │  Manage CAs     │              │
│  │  [Enter →]       │  │  [Enter →]      │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4. Admin Console (`/registry/[address]/admin`) — EXISTING, SCOPED

The existing admin page, but scoped to a specific registry address.

**Changes from current:**
- Registry address comes from URL params instead of env/hardcoded
- All contract calls target the specific registry
- "Back to Registry" navigation

### 5. User Dashboard (`/registry/[address]/dashboard`) — EXISTING, SCOPED

The existing dashboard page, scoped to a specific registry.

**Changes from current:**
- Registry address comes from URL params
- Proof generation uses the specific registry address
- "Back to Registry" navigation

### Frontend Implementation Plan

#### Phase 1: Registry Selector (minimal)
- Add registry address selector to existing pages
- Dropdown or URL param: `?registry=0x...`
- No new pages, just scoping existing functionality

#### Phase 2: Platform Pages
- `/` → Registry directory (read from factory)
- `/create` → Create wizard
- `/registry/[address]` → Detail page

#### Phase 3: Enhanced UX
- Registry search/filter
- Usage statistics (registered users, recent activity)
- Registry verification status badges

### Component Architecture

```
app/
  page.tsx                          → Platform Home (registry directory)
  create/page.tsx                   → Create Registry wizard
  registry/[address]/
    page.tsx                        → Registry detail
    admin/page.tsx                  → Admin Console (existing, scoped)
    dashboard/page.tsx              → User Dashboard (existing, scoped)
  faq/page.tsx                      → FAQ (existing)

lib/
  contract.ts                       → Add RegistryFactory ABI
  useRegistry.ts                    → Hook: read registry config
  useFactory.ts                     → Hook: read factory, create registry

components/
  Navbar.tsx                        → Add registry context indicator
  RegistryCard.tsx                  → Registry card for directory
  RegistrySelector.tsx              → Registry address input/selector
```

### Contract Integration

```typescript
// Factory ABI additions
const FACTORY_ABI = [
  "function createRegistry(string name, uint32 maxWallets, uint8 minDisclosureMask) returns (address)",
  "function getRegistries() view returns (address[])",
  "function getRegistryCount() view returns (uint256)",
  "function registryInfo(address) view returns (address creator, string name, uint32 maxWallets, uint8 minDisclosureMask, uint256 createdAt)",
  "function isRegistry(address) view returns (bool)",
  "event RegistryCreated(address indexed registry, address indexed owner, string name, uint32 maxWallets, uint8 minDisclosureMask)",
] as const;

// Registry ABI additions
// Add: MIN_DISCLOSURE_MASK(), setInitialOwner()
```

## Open Questions

1. Should factory charge a fee for registry creation?
2. Should registries be upgradeable (proxy) or immutable (current)?
3. Should the platform enforce a minimum set of CAs, or leave it fully to the service owner?
4. How to handle registry discovery across multiple chains?
5. Should the platform show registry "trust score" based on CA count, user count, etc.?
