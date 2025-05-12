// example.js - Example usage of the factory.js functions
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { 
  createFactory, 
  createPool, 
  getPool, 
  poolExists, 
  registerPool,
  getPoolCount 
} = require('./factory.js');

// Setup example wallet - in production, use a secure method to manage keys
async function setupWallet() {
  // Example private key (DO NOT USE IN PRODUCTION)
  const privateKeyBase64 = process.env.SUI_PRIVATE_KEY_BASE64 || ''; // Get from environment variable
  if (!privateKeyBase64) {
    throw new Error('Please provide a private key using the SUI_PRIVATE_KEY_BASE64 environment variable');
  }
  
  const privateKey = fromB64(privateKeyBase64);
  return Ed25519Keypair.fromSecretKey(privateKey);
}

async function main() {
  try {
    // Setup wallet
    const keypair = await setupWallet();
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(`Using address: ${address}`);
    
    // 1. Create a new factory
    console.log('Creating new factory...');
    const createFactoryResult = await createFactory(keypair);
    console.log('Factory created with transaction:', createFactoryResult.digest);
    
    // Extract the factory object ID from transaction effects
    const factoryId = extractFactoryIdFromTx(createFactoryResult);
    console.log(`Factory ID: ${factoryId}`);
    
    // 2. Create a pool for SUI and a custom token
    const suiCoinType = '0x2::sui::SUI';
    const customCoinType = '0x...::mycoin::MYCOIN'; // Replace with your actual coin type
    
    console.log(`Creating pool for ${suiCoinType} and ${customCoinType}...`);
    const createPoolResult = await createPool(
      keypair,
      factoryId,
      suiCoinType,
      customCoinType
    );
    console.log('Pool created with transaction:', createPoolResult.digest);
    
    // 3. Check if the pool exists
    const exists = await poolExists(factoryId, suiCoinType, customCoinType);
    console.log(`Pool exists: ${exists}`);
    
    // 4. Get the pool address
    const pool = await getPool(factoryId, suiCoinType, customCoinType);
    console.log(`Pool address: ${pool.address}`);
    
    // 5. Get the total number of pools
    const poolCount = await getPoolCount(factoryId);
    console.log(`Total pools: ${poolCount}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Helper function to extract factory ID from transaction effects
function extractFactoryIdFromTx(txResult) {
  // This is a simplified example, in a real application you would need to
  // parse the transaction effects to find the created object
  const createdObjects = txResult.effects?.created || [];
  
  // Find the factory object (this assumes the first shared object is the factory)
  const factoryObject = createdObjects.find(obj => obj.owner === 'Shared');
  
  if (!factoryObject) {
    throw new Error('Factory object not found in transaction effects');
  }
  
  return factoryObject.reference.objectId;
}

// Run the example
main().then(() => console.log('Done')); 