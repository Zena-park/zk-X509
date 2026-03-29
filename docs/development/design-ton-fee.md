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

| Action | Gas | Platform Fee |
|--------|-----|-------------|
| Deploy Factory | Native token | — |
| Create Registry | Native token | `registryCreationFee` (TON or native) |
| addCA | Native token | — |
| register (user) | Native token | Free |
| reRegister (user) | Native token | Free |

## Dual Fee Mode (L1 vs L2)

| | L1 (Ethereum) | L2 (Tokamak) |
|---|---|---|
| Native token | ETH | TON |
| Gas | ETH | TON |
| Platform fee | **TON (ERC-20)** | **TON (native, via msg.value)** |

Factory supports both modes via configurable fee token:
- `feeToken == address(0)` → native token (msg.value)
- `feeToken != address(0)` → ERC-20 (transferFrom)

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
address public feeToken;                 // address(0) = native, else ERC-20
uint256 public registryCreationFee;      // 0 = free
address public feeRecipient;

function createRegistry(...) external payable returns (address) {
    _collectFee();
    // Deploy registry (unchanged)
    ...
}

function _collectFee() internal {
    if (registryCreationFee == 0) return;

    if (feeToken == address(0)) {
        // Native token (ETH on L1, TON on L2)
        if (msg.value < registryCreationFee) revert InsufficientFee();
        payable(feeRecipient).transfer(registryCreationFee);
        // Refund excess
        if (msg.value > registryCreationFee) {
            payable(msg.sender).transfer(msg.value - registryCreationFee);
        }
    } else {
        // ERC-20 token (TON on L1)
        IERC20(feeToken).transferFrom(msg.sender, feeRecipient, registryCreationFee);
    }
}

function setFeeConfig(address _feeToken, uint256 _fee, address _recipient) external onlyOwner;
```

### Constructor update

```solidity
constructor(
    address _sp1Verifier,
    bytes32 _programVKey,
    address _feeToken,          // NEW: address(0) = native, else ERC-20
    uint256 _creationFee,       // NEW: 0 = free
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
