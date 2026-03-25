# TON Token Fee Design

## Overview

Platform fee for Registry creation is paid in TON (Tokamak Network token).
Gas fees remain in ETH (standard). No Paymaster or Account Abstraction needed.

## Flow

```
Service Owner                     RegistryFactory
    │                                   │
    │  1. TON.approve(factory, fee)     │
    │──────────────────────────────────>│
    │                                   │
    │  2. createRegistry(name, ...)     │
    │──────────────────────────────────>│
    │                                   │
    │     Factory internally:           │
    │     TON.transferFrom(sender,      │
    │       feeRecipient, fee)          │
    │     deploy IdentityRegistry       │
    │                                   │
    │  3. registry deployed: 0xNew      │
    │<──────────────────────────────────│
```

## Fee Structure

| Action | Gas (ETH) | Platform Fee (TON) |
|--------|-----------|-------------------|
| Deploy Factory | Owner pays | — |
| Create Registry | Creator pays | `registryCreationFee` TON |
| addCA | Registry owner pays | — |
| register (user) | User pays | Free |
| reRegister (user) | User pays | Free |

## Target: Ethereum L1

This design targets **Ethereum L1** deployment. TON is an ERC-20 on L1.

- **Ethereum mainnet**: `0x2be5e8c109e2197D077D13A82dAead6a9b3433C5`
- **Standard**: ERC-20, 18 decimals
- **Testnet**: Deploy a mock ERC-20 for local/testnet development

Future: When Tokamak L2 is available, the same pattern works with L2-bridged TON.
Gas fees on L2 will be negligible, making the UX much smoother.

## Contract Changes

### RegistryFactory additions

```solidity
IERC20 public immutable TON_TOKEN;
uint256 public registryCreationFee;      // in TON (18 decimals), 0 = free
address public feeRecipient;

function createRegistry(...) external returns (address) {
    // Collect TON fee
    if (registryCreationFee > 0) {
        TON_TOKEN.transferFrom(msg.sender, feeRecipient, registryCreationFee);
    }
    // Deploy registry (unchanged)
    ...
}

function setRegistryCreationFee(uint256 newFee) external onlyOwner;
function setFeeRecipient(address newRecipient) external onlyOwner;
```

### Constructor update

```solidity
constructor(
    address _sp1Verifier,
    bytes32 _programVKey,
    address _tonToken,          // NEW
    uint256 _creationFee,       // NEW (0 for free)
    address _feeRecipient       // NEW
)
```

## Frontend Changes

Registry creation wizard adds:
1. Show fee amount: "Registry creation fee: 10 TON"
2. Check TON balance: `TON.balanceOf(user)`
3. Check allowance: `TON.allowance(user, factory)`
4. If insufficient allowance: prompt `TON.approve(factory, fee)`
5. Call `createRegistry(...)` — fee auto-collected

## Local Development

For local Anvil testing, deploy a mock TON ERC-20:

```solidity
contract MockTON is ERC20 {
    constructor() ERC20("Mock TON", "TON") {
        _mint(msg.sender, 1_000_000 ether);
    }
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

## Why Not Paymaster?

- Paymaster changes `msg.sender` → breaks ZK proof `registrant` binding
- AA requires Smart Account wallets, Bundler infrastructure
- Simple `transferFrom` is sufficient for platform fees
- Gas fees on L2 are negligible (~$0.01)
