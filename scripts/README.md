# SuiDEX Factory JavaScript Utilities

This directory contains JavaScript utilities for interacting with the SuiDEX Factory contract.

## Files

- `factory.js` - Main utility functions for interacting with the SuiDEX Factory contract
- `sui-types.js` - Utilities for working with Sui Move types in JavaScript
- `example.js` - Example usage of the factory utilities

## Prerequisites

Before using these utilities, make sure you have the required dependencies:

```bash
npm install @mysten/sui.js
```

## Configuration

Before using the utilities, you need to set your package ID in `factory.js`. Update the following line with your actual deployed package ID:

```javascript
const PACKAGE_ID = '0x...';  // Replace with your actual package ID
```

## Usage

### Creating a Factory

```javascript
const { createFactory } = require('./scripts/factory.js');

// Create a new factory
const result = await createFactory(keypair);
console.log('Factory created with transaction:', result.digest);
```

### Creating a Pool

```javascript
const { createPool } = require('./scripts/factory.js');

// Create a pool for SUI and a custom token
await createPool(
  keypair,
  factoryId,
  '0x2::sui::SUI',
  '0x...::mycoin::MYCOIN'  // Replace with your coin type
);
```

### Checking if a Pool Exists

```javascript
const { poolExists } = require('./scripts/factory.js');

// Check if pool exists
const exists = await poolExists(
  factoryId,
  '0x2::sui::SUI',
  '0x...::mycoin::MYCOIN'  // Replace with your coin type
);
```

### Getting a Pool Address

```javascript
const { getPool } = require('./scripts/factory.js');

// Get pool address
const pool = await getPool(
  factoryId,
  '0x2::sui::SUI',
  '0x...::mycoin::MYCOIN'  // Replace with your coin type
);
console.log(`Pool exists: ${pool.exists}, address: ${pool.address}`);
```

### Getting the Total Number of Pools

```javascript
const { getPoolCount } = require('./scripts/factory.js');

// Get total number of pools
const count = await getPoolCount(factoryId);
console.log(`Total pools: ${count}`);
```

## Example

See `example.js` for a complete example of using these utilities. To run the example:

```bash
# Set your private key as an environment variable (don't do this in production)
export SUI_PRIVATE_KEY_BASE64="your_private_key_in_base64"

# Run the example script
node scripts/example.js
```

## Running Individual Functions

You can create small scripts to run individual functions. For example:

```javascript
// create-factory.js
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { createFactory } = require('./scripts/factory.js');

async function main() {
  const privateKey = fromB64(process.env.SUI_PRIVATE_KEY_BASE64);
  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  
  const result = await createFactory(keypair);
  console.log('Factory created:', result);
}

main().catch(console.error);
```

Then run it:

```bash
export SUI_PRIVATE_KEY_BASE64="your_private_key_in_base64"
node create-factory.js
```

## Security Note

- Never hardcode private keys in your code
- Use environment variables or secure key management for production
- Always validate user inputs before sending transactions 