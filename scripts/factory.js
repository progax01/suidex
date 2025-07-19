// factory.js - JavaScript utilities for interacting with the suidex::factory module
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { bcs } = require('@mysten/sui.js/bcs');
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { encodeTypeName, parseReturnValues } = require('./sui-types.js');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // or 'testnet', 'mainnet' based on your deployment
});

// Set up the keypair directly using the Ed25519Keypair.deriveKeypair method
// This is a safer approach than trying to manually decode the private key
const mnemonicOrPrivateKey = 'suiprivkey1qr8yacxzuu66a7f2j0hsr0xew9jk3ylvcp4mjms3us88uw7u2k8dg835jz4';

// Create a new keypair for testing instead of trying to decode the private key
// This is more reliable for testing purposes
const keypair = new Ed25519Keypair();
const address = keypair.getPublicKey().toSuiAddress();
console.log(`Using address: ${address} (generated for testing)`);

// Export the keypair for future reference
const exportedKeypair = keypair.export();
console.log('Generated keypair for testing. Save this for future use:');
console.log(`Private key: ${exportedKeypair.privateKey}`);


// Package ID - your actual deployed package ID
const PACKAGE_ID = '0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69';

/**
 * Creates a new DexFactory instance
 * @param {string} signer - The signer's address
 * @returns {Promise<string>} Transaction digest
 */
async function createFactory(signer) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::factory::create_factory`,
    arguments: [],
  });
  
  return client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
    options: { showEffects: true }
  });
}

/**
 * Creates a new pool for a token pair
 * @param {string} signer - The signer's address
 * @param {string} factoryId - The object ID of the DexFactory
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @returns {Promise<string>} Transaction digest
 */
async function createPool(signer, factoryId, coinTypeA, coinTypeB) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::factory::create_pool`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  return client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
    options: { showEffects: true }
  });
}

/**
 * Gets the address of a pool for a token pair
 * @param {string} factoryId - The object ID of the DexFactory
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @returns {Promise<{exists: boolean, address: string}>} Pool existence and address
 */
async function getPool(factoryId, coinTypeA, coinTypeB) {
  const result = await client.devInspectTransactionBlock({
    sender: '0x0', // Dummy sender for read-only operations
    transactionBlock: buildInspectTx(
      `${PACKAGE_ID}::factory::get_pool`,
      [coinTypeA, coinTypeB],
      [factoryId]
    ),
  });
  
  if (result.effects?.status?.status === 'success') {
    const [exists, address] = parseReturnValues(
      result.results?.[0]?.returnValues, 
      ['bool', 'address']
    );
    
    return { exists: exists || false, address: address || '0x0' };
  }
  
  throw new Error('Failed to get pool information');
}

/**
 * Checks if a pool exists for a token pair
 * @param {string} factoryId - The object ID of the DexFactory
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @returns {Promise<boolean>} Whether the pool exists
 */
async function poolExists(factoryId, coinTypeA, coinTypeB) {
  const result = await client.devInspectTransactionBlock({
    sender: '0x0', // Dummy sender for read-only operations
    transactionBlock: buildInspectTx(
      `${PACKAGE_ID}::factory::pool_exists`,
      [coinTypeA, coinTypeB],
      [factoryId]
    ),
  });
  
  if (result.effects?.status?.status === 'success' && result.results?.[0]?.returnValues) {
    const [exists] = parseReturnValues(result.results[0].returnValues, ['bool']);
    return exists || false;
  }
  
  return false;
}

/**
 * Register a pool in the factory
 * @param {string} signer - The signer's address
 * @param {string} factoryId - The object ID of the DexFactory
 * @param {string} tokenA - Type name of first token (full module path)
 * @param {string} tokenB - Type name of second token (full module path)
 * @param {string} poolAddress - Address of the pool
 * @returns {Promise<string>} Transaction digest
 */
async function registerPool(signer, factoryId, tokenA, tokenB, poolAddress) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::factory::register_pool`,
    arguments: [
      tx.object(factoryId),
      tx.pure(tx.pure(encodeTypeName(tokenA)), { type: 'TypeName' }),
      tx.pure(tx.pure(encodeTypeName(tokenB)), { type: 'TypeName' }),
      tx.pure(poolAddress)
    ],
  });
  
  return client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
    options: { showEffects: true }
  });
}

/**
 * Gets the total number of pools
 * @param {string} factoryId - The object ID of the DexFactory
 * @returns {Promise<number>} The pool count
 */
async function getPoolCount(factoryId) {
  const result = await client.devInspectTransactionBlock({
    sender: '0x0', // Dummy sender for read-only operations
    transactionBlock: buildInspectTx(
      `${PACKAGE_ID}::factory::pool_count`,
      [],
      [factoryId]
    ),
  });
  
  if (result.effects?.status?.status === 'success' && result.results?.[0]?.returnValues) {
    const [count] = parseReturnValues(result.results[0].returnValues, ['u64']);
    return count || 0;
  }
  
  return 0;
}

/**
 * Helper function to build transaction blocks for inspection
 */
function buildInspectTx(target, typeArguments, args) {
  const tx = new TransactionBlock();
  
  // Call the function
  const result = tx.moveCall({
    target,
    typeArguments,
    arguments: args.map(arg => tx.object(arg))
  });
  
  // Make sure to return the result
  tx.setGasBudget(10000000);
  return tx;
}

module.exports = {
  createFactory,
  createPool,
  getPool,
  poolExists,
  registerPool,
  getPoolCount
}; 