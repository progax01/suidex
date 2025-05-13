# SuiDex JavaScript SDK

A comprehensive JavaScript SDK for interacting with SuiDex, a decentralized exchange on the Sui blockchain.

## Features

- Factory creation and management
- Pool creation and validation
- Liquidity provision and removal
- Token swapping
- Automatic coin splitting for gas payment
- Comprehensive error handling
- Simple, intuitive API

## Installation

```bash
npm install @mysten/sui.js
```

## Quick Start

```javascript
const SuiDexSDK = require('./suidex-sdk');

// Initialize the SDK
const sdk = new SuiDexSDK('YOUR_PACKAGE_ID', 'devnet');

// Create a keypair from a private key
const privateKey = process.env.SUI_PRIVATE_KEY;
const keypair = sdk.createKeypair(privateKey);

// Get address from keypair
const address = keypair.getPublicKey().toSuiAddress();
console.log(`Using address: ${address}`);

// Create a factory
const factoryId = await sdk.createFactory(keypair);
console.log(`Factory created: ${factoryId}`);

// Create a pool for SUI and a custom token
const poolId = await sdk.createPool(
  keypair, 
  factoryId, 
  '0x2::sui::SUI', 
  'YOUR_TOKEN_TYPE'
);
console.log(`Pool created: ${poolId}`);
```

## API Reference

### Initialization

```javascript
// Initialize with default package ID on devnet
const sdk = new SuiDexSDK();

// Initialize with custom package ID on testnet
const sdk = new SuiDexSDK('YOUR_PACKAGE_ID', 'testnet');

// Initialize with custom package ID and custom RPC URL
const sdk = new SuiDexSDK('YOUR_PACKAGE_ID', 'mainnet', 'https://your-custom-rpc.com');
```

### Keypair Management

```javascript
// Create keypair from private key (supports both Sui format and Base64)
const keypair = sdk.createKeypair('suiprivkey1qr8ya...');

// Get address from keypair
const address = keypair.getPublicKey().toSuiAddress();
```

### Factory Operations

```javascript
// Create a new factory
const factoryId = await sdk.createFactory(keypair);

// Get factory information
const factoryInfo = await sdk.getFactoryInfo(factoryId);
```

### Pool Operations

```javascript
// Create a pool for a token pair
const poolId = await sdk.createPool(
  keypair, 
  factoryId, 
  '0x2::sui::SUI', 
  'YOUR_TOKEN_TYPE'
);

// Check if a pool exists
const poolExists = await sdk.poolExists(
  factoryId, 
  '0x2::sui::SUI', 
  'YOUR_TOKEN_TYPE', 
  address
);

// Get pool address
const poolAddr = await sdk.getPoolAddress(
  factoryId, 
  '0x2::sui::SUI', 
  'YOUR_TOKEN_TYPE', 
  address
);

// Get pool information
const poolInfo = await sdk.getPoolInfo(poolId);
```

### Liquidity Operations

```javascript
// Add liquidity to a pool
const result = await sdk.addLiquidity(
  keypair,
  factoryId,
  poolId,
  '0x2::sui::SUI',
  'YOUR_TOKEN_TYPE',
  'SUI_COIN_ID',
  'TOKEN_COIN_ID',
  1000000, // Min amount A (0.001 SUI)
  1000     // Min amount B
);

// Get LP token ID from result
const lpTokenId = result.lpTokenId;

// Remove liquidity from a pool
await sdk.removeLiquidity(
  keypair,
  factoryId,
  poolId,
  '0x2::sui::SUI',
  'YOUR_TOKEN_TYPE',
  lpTokenId,
  1000000, // Min amount A (0.001 SUI)
  1000     // Min amount B
);
```

### Swap Operations

```javascript
// Swap tokens
await sdk.swapExactInput(
  keypair,
  factoryId,
  poolId,
  '0x2::sui::SUI',
  'YOUR_TOKEN_TYPE',
  'SUI_COIN_ID',
  1000, // Min output amount
  null  // Auto-set deadline
);
```

### Utility Functions

```javascript
// Get coins owned by an address
const coins = await sdk.getCoins(address, '0x2::sui::SUI');

// Get a suitable gas coin
const gasCoinId = await sdk.getGasCoin(address);

// Split a coin for separate transaction input and gas payment
const newCoinId = await sdk.splitCoin(keypair, coinId, 1000000);

// Get current epoch (for deadline calculations)
const epoch = await sdk.getCurrentEpoch();
```

## Common Patterns

### Creating a Pool and Adding Liquidity

To create a pool and add liquidity, you need to:

1. Create a factory (or use an existing one)
2. Create a pool for your token pair
3. Add liquidity to the pool

The most common issue is using the same SUI coin for both transaction input and gas payment. The SDK automatically handles this by:

1. Checking if you're using a SUI coin as an input
2. Finding a different SUI coin for gas payment
3. If a separate coin isn't available, automatically splitting the coin for you

```javascript
// Example: Creating a pool and adding liquidity
async function setupPool() {
  // Create a factory
  const factoryId = await sdk.createFactory(keypair);
  
  // Create a pool
  const poolId = await sdk.createPool(
    keypair, 
    factoryId, 
    sdk.SUI_TYPE, 
    'YOUR_TOKEN_TYPE'
  );
  
  // Get SUI coins
  const coins = await sdk.getCoins(address, sdk.SUI_TYPE);
  const suiCoin = coins[0];
  
  // Get token coins
  const tokenCoins = await sdk.getCoins(address, 'YOUR_TOKEN_TYPE');
  const tokenCoin = tokenCoins[0];
  
  // Add liquidity - the SDK handles coin splitting if needed
  const result = await sdk.addLiquidity(
    keypair,
    factoryId,
    poolId,
    sdk.SUI_TYPE,
    'YOUR_TOKEN_TYPE',
    suiCoin.coinObjectId,
    tokenCoin.coinObjectId,
    1000000,
    1000
  );
  
  return result.lpTokenId;
}
```

## Example with Clock Object

SuiDex allows using the system Clock object in a pool for testing purposes. This is useful because the Clock is a shared object every address can access.

```javascript
// Creating a SUI/Clock pool
const poolId = await sdk.createPool(
  keypair, 
  factoryId, 
  '0x2::sui::SUI', 
  '0x2::clock::Clock'
);

// Adding liquidity with Clock
const result = await sdk.addLiquidity(
  keypair,
  factoryId,
  poolId,
  '0x2::sui::SUI',
  '0x2::clock::Clock',
  'SUI_COIN_ID',
  '0x6', // System Clock object ID
  1000000,
  1
);
```

## Troubleshooting

### TypeArityMismatch Errors

If you encounter `TypeArityMismatch` errors, your coin type definition may be incorrect. For example:

- Incorrect: `package::module::LP`
- Correct: `package::module::LP<0x2::sui::SUI>`

### No Valid Gas Coins

If you receive "No valid gas coins found" errors, ensure your wallet has enough SUI for gas:

1. Fund your wallet with SUI tokens
2. Make sure you have either:
   - Multiple SUI coins (one for transaction, one for gas)
   - One SUI coin with enough balance for both the transaction and gas
   
### Deadline Errors

If you see deadline-related errors:

1. Use a later deadline (e.g., current epoch + 20)
2. Let the SDK automatically set the deadline by passing `null`

## Full Example

See the `example.js` file for a complete working example that demonstrates:

1. Creating a factory
2. Creating a pool
3. Adding liquidity
4. Getting pool information

## License

This SDK is provided under the MIT License.

## Gas Payment Handling

The SDK includes robust gas payment handling for transactions that require both SUI as an input and for gas:

### Automatic Coin Splitting

When adding liquidity or swapping with SUI tokens, you need both:
1. A SUI coin to use as the transaction input
2. A separate SUI coin to use for gas payment

The SDK automatically:
1. Detects when you're using SUI as an input token
2. Checks if you have multiple SUI coins available
3. If you only have one SUI coin, it will automatically:
   - Split the coin to create a separate one for transaction input
   - Use the original coin for gas payment
   - Continue with the transaction using the newly created coin

Example of automatic splitting:

```javascript
// You only have one SUI coin
const coins = await sdk.getCoins(address);
console.log(`Found ${coins.length} SUI coins`); // Output: Found 1 SUI coins

// Call addLiquidity with your only coin
const result = await sdk.addLiquidity(
  keypair,
  factoryId,
  poolId,
  '0x2::sui::SUI',
  '0x2::clock::Clock',
  coins[0].coinObjectId, // Your only coin!
  clockObjectId,
  1000000,
  1
);

// The SDK will:
// 1. Detect that you're using your only coin
// 2. Split it for you
// 3. Complete the transaction with separate coins
```

### Manual Coin Splitting

If you need to split a coin manually:

```javascript
// Split a coin to get a separate one for transaction inputs
const newCoinId = await sdk.splitCoin(
  keypair,
  originalCoinId,
  1000000 // Amount to split out (0.001 SUI)
);

console.log(`New coin created: ${newCoinId}`);
```

### How Coin Splitting Works

When the SDK splits coins:

1. It creates a transaction that:
   - Uses the original coin as gas payment
   - Splits out the specified amount to a new coin
   - Transfers the new coin to the same address
   
2. It executes this transaction first to create the new coin

3. Then it uses the newly created coin for the main transaction (swap or add liquidity)

4. The original coin is used for gas payment in both transactions