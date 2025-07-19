// use-factory.js - Script to call functions in the factory.move contract
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // Change to 'testnet' or 'mainnet' based on your deployment
});

// Your actual wallet address
const YOUR_ADDRESS = '0xaa127b884072b4be1b803a38fecbb29ccb7bd58ff6a0a01f407e84d9edc8567a';

// Your actual deployed package ID
const PACKAGE_ID = '0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69';

// Example coin types for testing
const COIN_TYPE_A = '0x2::sui::SUI';
// For testing, we'll use SUI as both token types
// In a real application, you would use two different token types
const COIN_TYPE_B = '0x2::sui::SUI'; // Using SUI for testing

/**
 * 1. Create a new DexFactory
 * This calls the create_factory function in the factory.move contract
 */
async function showCreateFactoryCommand() {
  console.log('\nTo create a factory, run this command:');
  console.log(`sui client call --package ${PACKAGE_ID} --module factory --function create_factory --gas-budget 10000000`);
}

/**
 * 2. Create a new pool for a token pair
 * This calls the create_pool function in the factory.move contract
 */
async function showCreatePoolCommand(factoryId) {
  if (!factoryId) {
    console.error('Error: Factory ID is required');
    return;
  }
  
  console.log('\nTo create a pool, run this command:');
  const command = `sui client call --package ${PACKAGE_ID} --module factory --function create_pool --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} --args "${factoryId}" --gas-budget 10000000`;
  console.log(command);
}

/**
 * 3. Check if a pool exists for a token pair
 * This calls the pool_exists function in the factory.move contract
 */
async function checkPoolExists(factoryId) {
  if (!factoryId) {
    console.error('Error: Factory ID is required');
    return;
  }
  
  console.log(`\nChecking if pool exists for ${COIN_TYPE_A} and ${COIN_TYPE_B}...`);
  console.log(`Using factory ID: ${factoryId}`);
  
  const tx = new TransactionBlock();
  
  // Call the pool_exists function
  const [exists] = tx.moveCall({
    target: `${PACKAGE_ID}::factory::pool_exists`,
    typeArguments: [COIN_TYPE_A, COIN_TYPE_B],
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  try {
    // Use devInspectTransactionBlock for read-only operations
    const result = await client.devInspectTransactionBlock({
      sender: YOUR_ADDRESS,
      transactionBlock: tx,
    });
    
    if (result.effects?.status?.status === 'success') {
      // Parse the return value (boolean)
      const returnValue = result.results?.[0]?.returnValues?.[0];
      if (returnValue) {
        const existsValue = Buffer.from(returnValue[0]).readUInt8(0) === 1;
        console.log(`Pool exists: ${existsValue}`);
        return existsValue;
      }
    }
    
    console.log('Could not determine if pool exists');
    return false;
  } catch (error) {
    console.error('Error checking if pool exists:', error.message);
    return false;
  }
}

/**
 * 4. Get the address of a pool for a token pair
 * This calls the get_pool function in the factory.move contract
 */
async function getPoolAddress(factoryId) {
  if (!factoryId) {
    console.error('Error: Factory ID is required');
    return;
  }
  
  console.log(`\nGetting pool address for ${COIN_TYPE_A} and ${COIN_TYPE_B}...`);
  console.log(`Using factory ID: ${factoryId}`);
  
  const tx = new TransactionBlock();
  
  // Call the get_pool function
  const [existsAndAddress] = tx.moveCall({
    target: `${PACKAGE_ID}::factory::get_pool`,
    typeArguments: [COIN_TYPE_A, COIN_TYPE_B],
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  try {
    // Use devInspectTransactionBlock for read-only operations
    const result = await client.devInspectTransactionBlock({
      sender: YOUR_ADDRESS,
      transactionBlock: tx,
    });
    
    if (result.effects?.status?.status === 'success') {
      // Parse the return values (bool, address)
      const returnValues = result.results?.[0]?.returnValues;
      if (returnValues && returnValues.length >= 2) {
        const exists = Buffer.from(returnValues[0][0]).readUInt8(0) === 1;
        
        // Parse the address from the second return value
        const addressBytes = returnValues[1][0];
        const poolAddress = `0x${Buffer.from(addressBytes).toString('hex')}`;
        
        console.log(`Pool exists: ${exists}`);
        console.log(`Pool address: ${poolAddress}`);
        
        return { exists, address: poolAddress };
      }
    }
    
    console.log('Could not get pool address');
    return { exists: false, address: '0x0' };
  } catch (error) {
    console.error('Error getting pool address:', error.message);
    return { exists: false, address: '0x0' };
  }
}

/**
 * 5. Get the total number of pools
 * This calls the pool_count function in the factory.move contract
 */
async function getPoolCount(factoryId) {
  if (!factoryId) {
    console.error('Error: Factory ID is required');
    return;
  }
  
  console.log('\nGetting total number of pools...');
  console.log(`Using factory ID: ${factoryId}`);
  
  const tx = new TransactionBlock();
  
  // Call the pool_count function
  const [count] = tx.moveCall({
    target: `${PACKAGE_ID}::factory::pool_count`,
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  try {
    // Use devInspectTransactionBlock for read-only operations
    const result = await client.devInspectTransactionBlock({
      sender: YOUR_ADDRESS,
      transactionBlock: tx,
    });
    
    if (result.effects?.status?.status === 'success') {
      // Parse the return value (u64)
      const returnValue = result.results?.[0]?.returnValues?.[0];
      if (returnValue) {
        // Parse the u64 value
        const countValue = Buffer.from(returnValue[0]).readBigUInt64LE(0);
        console.log(`Total pools: ${countValue}`);
        return Number(countValue);
      }
    }
    
    console.log('Could not get pool count');
    return 0;
  } catch (error) {
    console.error('Error getting pool count:', error.message);
    return 0;
  }
}

/**
 * Process command line arguments
 */
async function processArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const factoryId = args[1];
  
  console.log('Starting factory.move contract interaction demo...');
  
  if (!command || command === 'help') {
    console.log('\nAvailable commands:');
    console.log('  node scripts/use-factory.js help');
    console.log('  node scripts/use-factory.js create-factory');
    console.log('  node scripts/use-factory.js create-pool <factoryId>');
    console.log('  node scripts/use-factory.js pool-exists <factoryId>');
    console.log('  node scripts/use-factory.js get-pool <factoryId>');
    console.log('  node scripts/use-factory.js pool-count <factoryId>');
    return;
  }
  
  switch (command) {
    case 'create-factory':
      await showCreateFactoryCommand();
      break;
    case 'create-pool':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      await showCreatePoolCommand(factoryId);
      break;
    case 'pool-exists':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      await checkPoolExists(factoryId);
      break;
    case 'get-pool':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      await getPoolAddress(factoryId);
      break;
    case 'pool-count':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      await getPoolCount(factoryId);
      break;
    default:
      console.log('\nUnknown command. Use "help" to see available commands.');
  }
}

// Run the script
processArgs().catch(error => {
  console.error('Error:', error);
});

/*
* How to run this script:
* 1. Make sure you have deployed the contract and have the package ID
* 2. Run the script with: node scripts/use-factory.js <command> [factoryId]
* 
* Examples:
* - To see available commands: node scripts/use-factory.js help
* - To create a factory: node scripts/use-factory.js create-factory
* - To create a pool: node scripts/use-factory.js create-pool <factoryId>
* - To check if a pool exists: node scripts/use-factory.js pool-exists <factoryId>
* - To get a pool address: node scripts/use-factory.js get-pool <factoryId>
* - To get the pool count: node scripts/use-factory.js pool-count <factoryId>
*/
