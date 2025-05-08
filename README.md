# SuiDex - A Decentralized Exchange on Sui Blockchain

This is a decentralized exchange (DEX) implementation on the Sui blockchain, inspired by Uniswap V2. It allows users to swap tokens, provide liquidity, and earn fees.

## Architecture

SuiDex consists of four main modules:

1. **factory.move**: Creates and tracks trading pairs
2. **pool.move**: Implements the AMM logic using the constant product formula
3. **lp_token.move**: Handles LP token issuance and management
4. **router.move**: Higher-level user interface for interactions

## Features

- **Token Swaps**: Swap one token for another with minimal slippage
- **Liquidity Provision**: Add tokens to pools to earn trading fees
- **Automated Market Making**: Uses x * y = k formula with 0.3% fee
- **Type Safety**: Leverages Sui's type system for secure operations

## Getting Started

### Prerequisites

- [Sui CLI](https://docs.sui.io/build/install)
- [Sui Wallet](https://docs.sui.io/build/wallet) (optional, for frontend interactions)

### Build and Deploy

1. Build the package:
```bash
cd suiDex
sui move build
```

2. Deploy to devnet:
```bash
sui client publish --gas-budget 100000000
```

3. Take note of the published package ID from the output.

### Usage

#### 1. Initialize the Factory

First, create a factory instance:

```bash
sui client call --package <PACKAGE_ID> --module factory --function create_factory --gas-budget 10000000
```

#### 2. Create a Pool

Create a trading pair pool (e.g., USDC/SUI):

```bash
sui client call --package <PACKAGE_ID> --module factory --function create_pool \
  --type-args <USDC_TYPE> <SUI_TYPE> \
  --args <FACTORY_ID> \
  --gas-budget 10000000
```

#### 3. Add Liquidity

Provide liquidity to a pool:

```bash
sui client call --package <PACKAGE_ID> --module router --function add_liquidity \
  --type-args <USDC_TYPE> <SUI_TYPE> \
  --args <FACTORY_ID> <POOL_ID> <COIN_A_ID> <COIN_B_ID> <MIN_A> <MIN_B> <DEADLINE> \
  --gas-budget 10000000
```

#### 4. Swap Tokens

Swap tokens using the router:

```bash
sui client call --package <PACKAGE_ID> --module router --function swap_exact_input \
  --type-args <USDC_TYPE> <SUI_TYPE> \
  --args <FACTORY_ID> <POOL_ID> <COIN_ID> <MIN_OUTPUT> <DEADLINE> \
  --gas-budget 10000000
```

#### 5. Remove Liquidity

Withdraw your tokens from the pool:

```bash
sui client call --package <PACKAGE_ID> --module router --function remove_liquidity \
  --type-args <USDC_TYPE> <SUI_TYPE> \
  --args <FACTORY_ID> <POOL_ID> <LP_COIN_ID> <MIN_A> <MIN_B> <DEADLINE> \
  --gas-budget 10000000
```

## Key Formulas

### Swapping

For a given input amount `amount_in`, the output amount is calculated as:

```
amount_out = (amount_in * (10000 - fee_bps) * reserve_out) / (reserve_in * 10000 + amount_in * (10000 - fee_bps))
```

### Liquidity Provision

For initial liquidity:
```
lp_amount = sqrt(amount_a * amount_b) - MINIMAL_LIQUIDITY
```

For subsequent liquidity:
```
lp_amount = min(amount_a * total_supply / reserve_a, amount_b * total_supply / reserve_b)
```

## Testing

We've included a test token module to facilitate testing:

```bash
# Mint test tokens
sui client call --package <PACKAGE_ID> --module test_tokens --function mint_usdc \
  --args <TREASURY_CAP_ID> <AMOUNT> <RECIPIENT> \
  --gas-budget 10000000
```

## Security Considerations

This DEX implementation includes several safeguards:

- Mathematical precision handling to prevent rounding exploits
- Protection against zero liquidity scenarios
- Slippage protection
- Locked modifier pattern to prevent reentrancy
- Comprehensive error handling

## License

[MIT License](LICENSE)

## Disclaimer

This code is provided for educational purposes and is not audited for production use. Use at your own risk. 