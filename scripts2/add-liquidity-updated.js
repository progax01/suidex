// add-liquidity-updated.js - Script to add liquidity to a pool with updated coin IDs
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // or 'testnet', 'mainnet' based on your deployment
});

// Your wallet address
const WALLET_ADDRESS = '0xaa127b884072b4be1b803a38fecbb29ccb7bd58ff6a0a01f407e84d9edc8567a';

// Package ID - your actual deployed package ID
const PACKAGE_ID = '0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69';

// Pool ID - your newly created pool
const POOL_ID = '0x178ed2fa4d5ce750e07207ea397b0baf250ac2bc6b0400314597fad082c209c4';

// Coin types
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0x2::sui::SUI';

// Your available coins
const COIN_A_ID = '0x0df4d26011bbfac830b05a25a968ade12e405f2bf5916b7842fc07a3b7cc34eb'; // Original coin
const COIN_B_ID = '0x29a5155cd34aa75f0c0b82e7cd94fc923c4c2af80edfb9b6d210adf1c97b5d8c'; // Newly split coin
const GAS_COIN_ID = '0xb8819a0b28e15e22b0ebc03a28e4849c56ca60cdea11ba6350b6ddae0115d4aa'; // Gas coin

async function addLiquidity() {
  console.log('Adding liquidity to pool with updated coin IDs...');
  console.log(`Pool ID: ${POOL_ID}`);
  console.log(`Coin A ID: ${COIN_A_ID}`);
  console.log(`Coin B ID: ${COIN_B_ID}`);
  console.log(`Gas Coin ID: ${GAS_COIN_ID}`);
  
  // Create a transaction block
  console.log('\nGenerating transaction command...');
  
  // Generate the command for the user to execute
  const command = `sui client programmable-transaction \\\n  --gas ${GAS_COIN_ID} \\\n  --gas-budget 10000000 \\\n  --inputs ${POOL_ID} ${COIN_A_ID} ${COIN_B_ID} 0 0 \\\n  --json \\\n  --function ${PACKAGE_ID}::pool::add_liquidity<${COIN_TYPE_A}, ${COIN_TYPE_B}> \\\n  --transfer-to ${WALLET_ADDRESS}`;
  
  console.log('\nTo add liquidity, run this command:');
  console.log(command);
}

// Run the script
addLiquidity().catch(error => {
  console.error('Error:', error);
});
