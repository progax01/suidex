// pool.js - JavaScript utilities for interacting with the suidex::pool module
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { bcs } = require('@mysten/sui.js/bcs');
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // or 'testnet', 'mainnet' based on your deployment
});

// Create a new keypair for testing
const keypair = new Ed25519Keypair();
const address = keypair.getPublicKey().toSuiAddress();
console.log(`Using address: ${address} (generated for testing)`);

// Package ID - your actual deployed package ID
const PACKAGE_ID = '0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69';

/**
 * Creates a new pool for a token pair
 * @param {string} signer - The signer's address
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @returns {Promise<string>} Transaction digest
 */
async function createPool(signer, coinTypeA, coinTypeB) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::create_pool`,
    typeArguments: [coinTypeA, coinTypeB],
  });

  const result = await client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
  });

  return result.digest;
}

/**
 * Adds liquidity to a pool
 * @param {string} signer - The signer's address
 * @param {string} poolId - The object ID of the pool
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @param {string} coinAId - The object ID of the first coin
 * @param {string} coinBId - The object ID of the second coin
 * @param {number} amountAMin - The minimum amount of the first coin to add
 * @param {number} amountBMin - The minimum amount of the second coin to add
 * @returns {Promise<string>} Transaction digest
 */
async function addLiquidity(signer, poolId, coinTypeA, coinTypeB, coinAId, coinBId, amountAMin, amountBMin) {
  const tx = new TransactionBlock();
  
  const coinA = tx.object(coinAId);
  const coinB = tx.object(coinBId);
  
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::add_liquidity`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(poolId),
      coinA,
      coinB,
      tx.pure(amountAMin),
      tx.pure(amountBMin)
    ],
  });

  const result = await client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
  });

  return result.digest;
}

/**
 * Removes liquidity from a pool
 * @param {string} signer - The signer's address
 * @param {string} poolId - The object ID of the pool
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @param {string} lpTokenId - The object ID of the LP token
 * @param {number} amountAMin - The minimum amount of the first coin to receive
 * @param {number} amountBMin - The minimum amount of the second coin to receive
 * @returns {Promise<string>} Transaction digest
 */
async function removeLiquidity(signer, poolId, coinTypeA, coinTypeB, lpTokenId, amountAMin, amountBMin) {
  const tx = new TransactionBlock();
  
  const lpToken = tx.object(lpTokenId);
  
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::remove_liquidity`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(poolId),
      lpToken,
      tx.pure(amountAMin),
      tx.pure(amountBMin)
    ],
  });

  const result = await client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
  });

  return result.digest;
}

/**
 * Swaps tokens in a pool (A to B)
 * @param {string} signer - The signer's address
 * @param {string} poolId - The object ID of the pool
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @param {string} coinAId - The object ID of the coin to swap
 * @param {number} amountOutMin - The minimum amount of the output coin to receive
 * @returns {Promise<string>} Transaction digest
 */
async function swapExactAForB(signer, poolId, coinTypeA, coinTypeB, coinAId, amountOutMin) {
  const tx = new TransactionBlock();
  
  const coinA = tx.object(coinAId);
  
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::swap_exact_a_for_b`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(poolId),
      coinA,
      tx.pure(amountOutMin)
    ],
  });

  const result = await client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
  });

  return result.digest;
}

/**
 * Swaps tokens in a pool (B to A)
 * @param {string} signer - The signer's address
 * @param {string} poolId - The object ID of the pool
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @param {string} coinBId - The object ID of the coin to swap
 * @param {number} amountOutMin - The minimum amount of the output coin to receive
 * @returns {Promise<string>} Transaction digest
 */
async function swapExactBForA(signer, poolId, coinTypeA, coinTypeB, coinBId, amountOutMin) {
  const tx = new TransactionBlock();
  
  const coinB = tx.object(coinBId);
  
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::swap_exact_b_for_a`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(poolId),
      coinB,
      tx.pure(amountOutMin)
    ],
  });

  const result = await client.signAndExecuteTransactionBlock({
    signer,
    transactionBlock: tx,
  });

  return result.digest;
}

/**
 * Gets the reserves of a pool
 * @param {string} poolId - The object ID of the pool
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @returns {Promise<{reserveA: number, reserveB: number}>} The reserves
 */
async function getReserves(poolId, coinTypeA, coinTypeB) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::get_reserves`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [tx.object(poolId)],
  });

  const result = await client.devInspectTransactionBlock({
    sender: address,
    transactionBlock: tx,
  });

  if (result.results && result.results[0] && result.results[0].returnValues) {
    const [reserveA, reserveB] = result.results[0].returnValues.map(val => BigInt(val[0]));
    return {
      reserveA: Number(reserveA),
      reserveB: Number(reserveB)
    };
  }

  throw new Error('Failed to get reserves');
}

/**
 * Gets the total supply of LP tokens for a pool
 * @param {string} poolId - The object ID of the pool
 * @param {string} coinTypeA - The first coin type (full module path)
 * @param {string} coinTypeB - The second coin type (full module path)
 * @returns {Promise<number>} The total supply
 */
async function getTotalSupply(poolId, coinTypeA, coinTypeB) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::pool::get_total_supply`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [tx.object(poolId)],
  });

  const result = await client.devInspectTransactionBlock({
    sender: address,
    transactionBlock: tx,
  });

  if (result.results && result.results[0] && result.results[0].returnValues) {
    const totalSupply = BigInt(result.results[0].returnValues[0][0]);
    return Number(totalSupply);
  }

  throw new Error('Failed to get total supply');
}

module.exports = {
  createPool,
  addLiquidity,
  removeLiquidity,
  swapExactAForB,
  swapExactBForA,
  getReserves,
  getTotalSupply
};
