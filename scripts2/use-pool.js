// use-pool.js - Script to call functions in the pool.move contract
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');
const {
  createPool,
  addLiquidity,
  removeLiquidity,
  swapExactAForB,
  swapExactBForA,
  getReserves,
  getTotalSupply
} = require('./pool.js');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // or 'testnet', 'mainnet' based on your deployment
});

// Package ID - your actual deployed package ID
const PACKAGE_ID = '0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69';

// Example coin types
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0x2::sui::SUI'; // Using SUI for both tokens for testing

/**
 * 1. Create a new pool for a token pair
 * This calls the create_pool function in the pool.move contract
 */
async function showCreatePoolCommand() {
  console.log('\nTo create a pool, run this command:');
  const command = `sui client call --package ${PACKAGE_ID} --module pool --function create_pool --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --gas-budget 10000000`;
  console.log(command);
}

/**
 * 2. Add liquidity to a pool
 * This calls the add_liquidity function in the pool.move contract
 */
async function showAddLiquidityCommand(poolId, coinAId, coinBId) {
  if (!poolId || !coinAId || !coinBId) {
    console.error('Error: Pool ID, Coin A ID, and Coin B ID are required');
    return;
  }
  
  console.log('\nTo add liquidity to the pool, run this command:');
  const command = `sui client call --package ${PACKAGE_ID} --module pool --function add_liquidity --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${poolId}" "${coinAId}" "${coinBId}" 0 0 --gas-budget 10000000`;
  console.log(command);
}

/**
 * 3. Remove liquidity from a pool
 * This calls the remove_liquidity function in the pool.move contract
 */
async function showRemoveLiquidityCommand(poolId, lpTokenId) {
  if (!poolId || !lpTokenId) {
    console.error('Error: Pool ID and LP Token ID are required');
    return;
  }
  
  console.log('\nTo remove liquidity from the pool, run this command:');
  const command = `sui client call --package ${PACKAGE_ID} --module pool --function remove_liquidity --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${poolId}" "${lpTokenId}" 0 0 --gas-budget 10000000`;
  console.log(command);
}

/**
 * 4. Swap tokens in a pool (A to B)
 * This calls the swap_exact_a_for_b function in the pool.move contract
 */
async function showSwapAForBCommand(poolId, coinAId) {
  if (!poolId || !coinAId) {
    console.error('Error: Pool ID and Coin A ID are required');
    return;
  }
  
  console.log('\nTo swap tokens A for B, run this command:');
  const command = `sui client call --package ${PACKAGE_ID} --module pool --function swap_exact_a_for_b --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${poolId}" "${coinAId}" 0 --gas-budget 10000000`;
  console.log(command);
}

/**
 * 5. Swap tokens in a pool (B to A)
 * This calls the swap_exact_b_for_a function in the pool.move contract
 */
async function showSwapBForACommand(poolId, coinBId) {
  if (!poolId || !coinBId) {
    console.error('Error: Pool ID and Coin B ID are required');
    return;
  }
  
  console.log('\nTo swap tokens B for A, run this command:');
  const command = `sui client call --package ${PACKAGE_ID} --module pool --function swap_exact_b_for_a --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${poolId}" "${coinBId}" 0 --gas-budget 10000000`;
  console.log(command);
}

/**
 * 6. Get the reserves of a pool
 * This calls the get_reserves function in the pool.move contract
 */
async function getPoolReserves(poolId) {
  if (!poolId) {
    console.error('Error: Pool ID is required');
    return;
  }
  
  console.log('\nGetting pool reserves...');
  console.log(`Using pool ID: ${poolId}`);
  
  try {
    // For read-only calls, we'll use a simpler approach
    console.log('To check pool reserves, run this command:');
    const command = `sui client call --package ${PACKAGE_ID} --module pool --function get_reserves --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${poolId}" --gas-budget 10000000`;
    console.log(command);
  } catch (error) {
    console.error('Error getting reserves:', error);
  }
}

/**
 * 7. Get the total supply of LP tokens for a pool
 * This calls the get_total_supply function in the pool.move contract
 */
async function getPoolTotalSupply(poolId) {
  if (!poolId) {
    console.error('Error: Pool ID is required');
    return;
  }
  
  console.log('\nGetting total LP supply...');
  console.log(`Using pool ID: ${poolId}`);
  
  try {
    // For read-only calls, we'll use a simpler approach
    console.log('To check total LP supply, run this command:');
    const command = `sui client call --package ${PACKAGE_ID} --module pool --function get_total_supply --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${poolId}" --gas-budget 10000000`;
    console.log(command);
  } catch (error) {
    console.error('Error getting total supply:', error);
  }
}

/**
 * Process command line arguments
 */
async function processArgs() {
  console.log('Starting pool.move contract interaction demo...');
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'create-pool':
      await showCreatePoolCommand();
      break;
    
    case 'add-liquidity':
      await showAddLiquidityCommand(args[1], args[2], args[3]);
      break;
    
    case 'remove-liquidity':
      await showRemoveLiquidityCommand(args[1], args[2]);
      break;
    
    case 'swap-a-for-b':
      await showSwapAForBCommand(args[1], args[2]);
      break;
    
    case 'swap-b-for-a':
      await showSwapBForACommand(args[1], args[2]);
      break;
    
    case 'get-reserves':
      await getPoolReserves(args[1]);
      break;
    
    case 'get-total-supply':
      await getPoolTotalSupply(args[1]);
      break;
    
    default:
      console.log('Available commands:');
      console.log('  create-pool');
      console.log('  add-liquidity <pool-id> <coin-a-id> <coin-b-id>');
      console.log('  remove-liquidity <pool-id> <lp-token-id>');
      console.log('  swap-a-for-b <pool-id> <coin-a-id>');
      console.log('  swap-b-for-a <pool-id> <coin-b-id>');
      console.log('  get-reserves <pool-id>');
      console.log('  get-total-supply <pool-id>');
      break;
  }
}

// Run the script
processArgs().catch(error => {
  console.error('Error:', error);
});
