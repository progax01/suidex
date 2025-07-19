// read-only-demo.js - Example script demonstrating how to use factory.js for read-only operations
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');
const { TransactionBlock } = require('@mysten/sui.js/transactions');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // or 'testnet', 'mainnet' based on your deployment
});

// Replace with your actual package ID
const PACKAGE_ID = '0x...'; // Replace with your actual package ID

// Example factory ID - replace with an existing factory ID if you have one
const FACTORY_ID = '0x...'; // Replace with an actual factory ID if you have one

// Example coin types
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0xYOUR_PACKAGE_ID::coin::USDC'; // Replace with your actual coin type

/**
 * Performs a read-only call to get pool information
 */
async function getPoolReadOnly(factoryId, coinTypeA, coinTypeB) {
  const tx = new TransactionBlock();
  
  // Call the function
  tx.moveCall({
    target: `${PACKAGE_ID}::factory::get_pool`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [tx.object(factoryId)]
  });
  
  try {
    const result = await client.devInspectTransactionBlock({
      sender: '0x0', // Dummy sender for read-only operations
      transactionBlock: tx,
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log('Raw result:', result.results?.[0]);
      return 'Successfully called get_pool function';
    }
    
    return 'Call failed';
  } catch (error) {
    console.error('Error:', error.message);
    return 'Error calling get_pool function';
  }
}

/**
 * Gets the total number of pools
 */
async function getPoolCountReadOnly(factoryId) {
  const tx = new TransactionBlock();
  
  // Call the function
  tx.moveCall({
    target: `${PACKAGE_ID}::factory::pool_count`,
    arguments: [tx.object(factoryId)]
  });
  
  try {
    const result = await client.devInspectTransactionBlock({
      sender: '0x0', // Dummy sender for read-only operations
      transactionBlock: tx,
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log('Raw result:', result.results?.[0]);
      return 'Successfully called pool_count function';
    }
    
    return 'Call failed';
  } catch (error) {
    console.error('Error:', error.message);
    return 'Error calling pool_count function';
  }
}

async function runDemo() {
  console.log('Testing read-only operations...');
  
  // Test pool count function
  console.log('\nTesting pool_count function:');
  const countResult = await getPoolCountReadOnly(FACTORY_ID);
  console.log(countResult);
  
  // Test get pool function
  console.log('\nTesting get_pool function:');
  const poolResult = await getPoolReadOnly(FACTORY_ID, COIN_TYPE_A, COIN_TYPE_B);
  console.log(poolResult);
}

// Run the demo
runDemo().then(() => console.log('\nRead-only demo completed'));

/*
* How to run this script:
* 1. Make sure you have set the correct PACKAGE_ID in this script
* 2. Set FACTORY_ID to an existing factory object ID if you have one
* 3. Run the script with: node read-only-demo.js
*/
