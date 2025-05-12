// call-factory-functions.js - Script to call functions in the factory.move contract
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // Change to 'testnet' or 'mainnet' based on your deployment
});

// Use your actual wallet address
const YOUR_ADDRESS = '0xaa127b884072b4be1b803a38fecbb29ccb7bd58ff6a0a01f407e84d9edc8567a';

// Create a keypair for testing - in a real application, you would use your actual keypair
// For this demo, we'll just use the address for read-only operations
const address = YOUR_ADDRESS;
console.log(`Using address: ${address}`);

// Your actual deployed package ID
const PACKAGE_ID = '0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69';

// Example coin types for testing
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0x2::coin::USDT'; // Replace with an actual coin type

/**
 * 1. Create a new DexFactory
 * This calls the create_factory function in the factory.move contract
 */
async function createFactory() {
  console.log('\n1. Creating a new DexFactory...');
  
  const tx = new TransactionBlock();
  
  // Call the create_factory function
  tx.moveCall({
    target: `${PACKAGE_ID}::factory::create_factory`,
    arguments: [],
  });
  
  try {
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true }
    });
    
    console.log('Transaction successful!');
    console.log('Digest:', result.digest);
    
    // Extract the factory object ID from the transaction effects
    if (result.effects?.created && result.effects.created.length > 0) {
      const factoryId = result.effects.created[0].reference.objectId;
      console.log('Factory ID:', factoryId);
      return factoryId;
    }
    
    // Look for the FactoryCreated event
    if (result.events && result.events.length > 0) {
      const factoryEvent = result.events.find(event => 
        event.type.includes('::factory::FactoryCreated'));
      if (factoryEvent) {
        console.log('Factory created event:', factoryEvent);
        return factoryEvent.parsedJson?.factory_id;
      }
    }
    
    console.log('Could not find factory ID in the transaction result');
    return null;
  } catch (error) {
    console.error('Error creating factory:', error.message);
    return null;
  }
}

/**
 * 2. Create a new pool for a token pair
 * This calls the create_pool function in the factory.move contract
 */
async function createPool(factoryId, coinTypeA, coinTypeB) {
  console.log(`\n2. Creating a new pool for ${coinTypeA} and ${coinTypeB}...`);
  console.log(`Using factory ID: ${factoryId}`);
  
  const tx = new TransactionBlock();
  
  // Call the create_pool function with the factory object and type arguments
  tx.moveCall({
    target: `${PACKAGE_ID}::factory::create_pool`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  try {
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true }
    });
    
    console.log('Transaction successful!');
    console.log('Digest:', result.digest);
    
    // Look for the PoolRegistered event
    if (result.events && result.events.length > 0) {
      const poolEvent = result.events.find(event => 
        event.type.includes('::factory::PoolRegistered'));
      if (poolEvent) {
        console.log('Pool registered event:', poolEvent);
        return poolEvent.parsedJson?.pool_address;
      }
    }
    
    console.log('Pool created successfully, but could not find pool address in events');
    return null;
  } catch (error) {
    console.error('Error creating pool:', error.message);
    return null;
  }
}

/**
 * 3. Check if a pool exists for a token pair
 * This calls the pool_exists function in the factory.move contract
 */
async function checkPoolExists(factoryId, coinTypeA, coinTypeB) {
  console.log(`\n3. Checking if pool exists for ${coinTypeA} and ${coinTypeB}...`);
  console.log(`Using factory ID: ${factoryId}`);
  
  const tx = new TransactionBlock();
  
  // Call the pool_exists function
  const [exists] = tx.moveCall({
    target: `${PACKAGE_ID}::factory::pool_exists`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  // Make sure to return the result
  tx.setGasBudget(10000000);
  
  try {
    // Use devInspectTransactionBlock for read-only operations
    const result = await client.devInspectTransactionBlock({
      sender: address,
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
async function getPoolAddress(factoryId, coinTypeA, coinTypeB) {
  console.log(`\n4. Getting pool address for ${coinTypeA} and ${coinTypeB}...`);
  console.log(`Using factory ID: ${factoryId}`);
  
  const tx = new TransactionBlock();
  
  // Call the get_pool function
  const [existsAndAddress] = tx.moveCall({
    target: `${PACKAGE_ID}::factory::get_pool`,
    typeArguments: [coinTypeA, coinTypeB],
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  // Make sure to return the result
  tx.setGasBudget(10000000);
  
  try {
    // Use devInspectTransactionBlock for read-only operations
    const result = await client.devInspectTransactionBlock({
      sender: address,
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
  console.log('\n5. Getting total number of pools...');
  console.log(`Using factory ID: ${factoryId}`);
  
  const tx = new TransactionBlock();
  
  // Call the pool_count function
  const [count] = tx.moveCall({
    target: `${PACKAGE_ID}::factory::pool_count`,
    arguments: [
      tx.object(factoryId)
    ],
  });
  
  // Make sure to return the result
  tx.setGasBudget(10000000);
  
  try {
    // Use devInspectTransactionBlock for read-only operations
    const result = await client.devInspectTransactionBlock({
      sender: address,
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
 * Main function to run the demo
 */
async function runReadOnlyDemo() {
  try {
    console.log('\nRunning read-only operations demo...');
    
    // Ask the user to input a factory ID if they have one
    console.log('\nNote: To test read-only operations, you need a factory object ID.');
    console.log('You can create a factory first by running the createFactoryDemo() function.');
    
    // For now, let's just check if we can connect to the network and verify the package ID
    console.log('\nVerifying connection to Sui network...');
    const { epoch } = await client.getLatestCheckpointSequenceNumber();
    console.log(`Connected to network. Current epoch: ${epoch}`);
    console.log(`Using package ID: ${PACKAGE_ID}`);
    
    console.log('\nRead-only demo completed successfully!');
    console.log('\nTo create a factory, run: node scripts/call-factory-functions.js create-factory');
    console.log('To create a pool, run: node scripts/call-factory-functions.js create-pool <factoryId>');
    console.log('To check if a pool exists, run: node scripts/call-factory-functions.js pool-exists <factoryId>');
    console.log('To get a pool address, run: node scripts/call-factory-functions.js get-pool <factoryId>');
    console.log('To get the pool count, run: node scripts/call-factory-functions.js pool-count <factoryId>');
  } catch (error) {
    console.error('\nError running demo:', error.message);
  }
}

async function createFactoryDemo() {
  try {
    console.log('\nCreating a new DexFactory...');
    console.log('Note: This requires a keypair with SUI tokens for gas fees.');
    
    // For demonstration purposes, we'll just show how to call the function
    console.log('\nTo create a factory, you would execute:');
    console.log(`sui client call --package ${PACKAGE_ID} --module factory --function create_factory --gas-budget 10000000`);
    
    console.log('\nAlternatively, you can use the JavaScript createFactory function in factory.js');
  } catch (error) {
    console.error('\nError:', error.message);
  }
}

// Process command line arguments
async function processArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const factoryId = args[1];
  
  console.log('Starting factory.move contract interaction demo...');
  
  if (!command || command === 'help') {
    console.log('\nAvailable commands:');
    console.log('  node scripts/call-factory-functions.js help');
    console.log('  node scripts/call-factory-functions.js create-factory');
    console.log('  node scripts/call-factory-functions.js create-pool <factoryId>');
    console.log('  node scripts/call-factory-functions.js pool-exists <factoryId>');
    console.log('  node scripts/call-factory-functions.js get-pool <factoryId>');
    console.log('  node scripts/call-factory-functions.js pool-count <factoryId>');
    return;
  }
  
  switch (command) {
    case 'create-factory':
      await createFactoryDemo();
      break;
    case 'create-pool':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      console.log('\nTo create a pool, you would execute:');
      console.log(`sui client call --package ${PACKAGE_ID} --module factory --function create_pool \`);
      console.log(`  --type-args ${COIN_TYPE_A} ${COIN_TYPE_B} \`);
      console.log(`  --args ${factoryId} \`);
      console.log('  --gas-budget 10000000');
      break;
    case 'pool-exists':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      await checkPoolExists(factoryId, COIN_TYPE_A, COIN_TYPE_B);
      break;
    case 'get-pool':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      await getPoolAddress(factoryId, COIN_TYPE_A, COIN_TYPE_B);
      break;
    case 'pool-count':
      if (!factoryId) {
        console.error('Error: Factory ID is required');
        return;
      }
      await getPoolCount(factoryId);
      break;
    default:
      await runReadOnlyDemo();
  }
}

// Run the script
processArgs().catch(error => {
  console.error('Error:', error);
});

/*
* How to run this script:
* 1. Make sure you have deployed the contract and have the package ID
* 2. Update the PACKAGE_ID constant with your actual package ID
* 3. Run the script with: node scripts/call-factory-functions.js
* 
* Note: This script generates a new keypair for testing. Make sure the address
* has enough SUI tokens for gas fees. You can request tokens from the faucet
* using the Sui Wallet browser extension.
*/
