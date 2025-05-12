// demo-pool.js - Example script demonstrating how to use pool.js to interact with the pool.move contract
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { 
  createPool,
  addLiquidity,
  removeLiquidity,
  swapExactAForB,
  swapExactBForA,
  getReserves,
  getTotalSupply
} = require('./pool.js');

// Replace with your wallet address
const WALLET_ADDRESS = '0xaa127b884072b4be1b803a38fecbb29ccb7bd58ff6a0a01f407e84d9edc8567a';

// Example pool ID - replace with your actual pool ID
const POOL_ID = '0x9d5646bf2d275cc2b0614d8fbc252dcda057c201ee5076fcf8ff9460c2f69541';

// Example coin types
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0x2::sui::SUI'; // Using SUI for both tokens for testing

async function runDemo() {
  try {
    console.log('Starting Pool Demo...');
    console.log(`Using wallet address: ${WALLET_ADDRESS}`);
    console.log(`Using pool ID: ${POOL_ID}`);
    
    // 1. Get pool reserves
    console.log('\n1. Getting pool reserves...');
    try {
      const reserves = await getReserves(POOL_ID, COIN_TYPE_A, COIN_TYPE_B);
      console.log(`Reserve A: ${reserves.reserveA}`);
      console.log(`Reserve B: ${reserves.reserveB}`);
    } catch (error) {
      console.error('Error getting reserves:', error.message);
    }
    
    // 2. Get total LP supply
    console.log('\n2. Getting total LP supply...');
    try {
      const totalSupply = await getTotalSupply(POOL_ID, COIN_TYPE_A, COIN_TYPE_B);
      console.log(`Total LP Supply: ${totalSupply}`);
    } catch (error) {
      console.error('Error getting total supply:', error.message);
    }
    
    // 3. Show commands for interacting with the pool
    console.log('\n3. Commands for interacting with the pool:');
    
    // Create pool command
    console.log('\nTo create a new pool:');
    console.log(`sui client call --package 0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69 --module pool --function create_pool --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --gas-budget 10000000`);
    
    // Add liquidity command (replace COIN_A_ID and COIN_B_ID with actual coin IDs)
    console.log('\nTo add liquidity to the pool (replace COIN_A_ID and COIN_B_ID with actual coin IDs):');
    console.log(`sui client call --package 0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69 --module pool --function add_liquidity --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${POOL_ID}" "COIN_A_ID" "COIN_B_ID" 0 0 --gas-budget 10000000`);
    
    // Remove liquidity command (replace LP_TOKEN_ID with actual LP token ID)
    console.log('\nTo remove liquidity from the pool (replace LP_TOKEN_ID with actual LP token ID):');
    console.log(`sui client call --package 0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69 --module pool --function remove_liquidity --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${POOL_ID}" "LP_TOKEN_ID" 0 0 --gas-budget 10000000`);
    
    // Swap A for B command (replace COIN_A_ID with actual coin ID)
    console.log('\nTo swap tokens A for B (replace COIN_A_ID with actual coin ID):');
    console.log(`sui client call --package 0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69 --module pool --function swap_exact_a_for_b --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${POOL_ID}" "COIN_A_ID" 0 --gas-budget 10000000`);
    
    // Swap B for A command (replace COIN_B_ID with actual coin ID)
    console.log('\nTo swap tokens B for A (replace COIN_B_ID with actual coin ID):');
    console.log(`sui client call --package 0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69 --module pool --function swap_exact_b_for_a --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${POOL_ID}" "COIN_B_ID" 0 --gas-budget 10000000`);
    
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Run the demo
runDemo().then(() => console.log('\nDemo completed'));
