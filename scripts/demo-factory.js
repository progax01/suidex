// demo-factory.js - Example script demonstrating how to use factory.js to interact with the factory.move contract
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { 
  createFactory,
  createPool,
  getPool,
  poolExists,
  registerPool,
  getPoolCount
} = require('./factory');

// Replace with your private key or use the Sui Wallet
const PRIVATE_KEY = process.env.SUI_PRIVATE_KEY || '';
// If you don't have a private key, you can generate a new one for testing
// const keypair = PRIVATE_KEY 
//   ? Ed25519Keypair.fromSecretKey(fromB64(PRIVATE_KEY))
//   : new Ed25519Keypair();

// The address derived from the keypair
const address = keypair.getPublicKey().toSuiAddress();

console.log(`Using address: ${address}`);

// Example coin types (replace with actual coin types from your project)
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0xYOUR_PACKAGE_ID::coin::USDC'; // Replace with your actual coin type

async function runDemo() {
  try {
    console.log('Creating a new DexFactory...');
    const factoryResult = await createFactory(keypair);
    console.log('Factory created with digest:', factoryResult.digest);
    
    // Extract the factory object ID from the transaction effects
    const factoryId = factoryResult.effects.created[0]?.reference.objectId;
    if (!factoryId) {
      throw new Error('Failed to extract factory ID from transaction');
    }
    console.log('Factory ID:', factoryId);
    
    // Check the pool count (should be 0 initially)
    const initialCount = await getPoolCount(factoryId);
    console.log(`Initial pool count: ${initialCount}`);
    
    // Create a new pool
    console.log(`Creating a new pool for ${COIN_TYPE_A} and ${COIN_TYPE_B}...`);
    const poolResult = await createPool(keypair, factoryId, COIN_TYPE_A, COIN_TYPE_B);
    console.log('Pool created with digest:', poolResult.digest);
    
    // Check if the pool exists
    const exists = await poolExists(factoryId, COIN_TYPE_A, COIN_TYPE_B);
    console.log(`Pool exists: ${exists}`);
    
    // Get the pool address
    const poolInfo = await getPool(factoryId, COIN_TYPE_A, COIN_TYPE_B);
    console.log('Pool information:', poolInfo);
    
    // Check the updated pool count
    const updatedCount = await getPoolCount(factoryId);
    console.log(`Updated pool count: ${updatedCount}`);
    
    // Note: registerPool is typically called by a system that listens for PoolCreated events
    // This is just an example of how to call it manually if needed
    // await registerPool(keypair, factoryId, COIN_TYPE_A, COIN_TYPE_B, '0xSOME_POOL_ADDRESS');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the demo
runDemo().then(() => console.log('Demo completed'));

/*
* How to run this script:
* 1. Make sure you have set the correct PACKAGE_ID in factory.js
* 2. Set your SUI_PRIVATE_KEY environment variable or modify this script to use your keypair
* 3. Run the script with: node demo-factory.js
*/
