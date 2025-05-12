// create-factory.js - Simple example to create a factory
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { createFactory } = require('./scripts/factory.js');

async function main() {
  try {
    // Get private key from environment variable
    const privateKeyString = process.env.SUI_PRIVATE_KEY_BASE64;
    if (!privateKeyString) {
      console.error('ERROR: SUI_PRIVATE_KEY_BASE64 environment variable not set');
      console.error('Please set it with: $env:SUI_PRIVATE_KEY_BASE64="your_sui_private_key"');
      process.exit(1);
    }
    
    // Create keypair from private key string
    let keypair;
    
    try {
      // Different methods to create a keypair based on key format
      if (privateKeyString.startsWith('suiprivkey')) {
        // Handle Sui key format by importing the keypair directly
        keypair = Ed25519Keypair.fromSecretKey(decodePrivateKey(privateKeyString));
      } else {
        // Handle base64 format
        const privateKey = fromB64(privateKeyString);
        keypair = Ed25519Keypair.fromSecretKey(privateKey);
      }
    } catch (error) {
      console.error('Error creating keypair:', error.message);
      console.log('Try using the Sui CLI to export a base64 key:');
      console.log('  sui keytool convert --sui-key "your_sui_key" --output base64');
      process.exit(1);
    }
    
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(`Using address: ${address}`);
    
    // Create the factory
    console.log('Creating new factory...');
    const result = await createFactory(keypair);
    console.log('Transaction digest:', result.digest);
    
    // Extract the factory ID
    const factoryId = extractFactoryIdFromTx(result);
    console.log('Factory ID:', factoryId);
    console.log('You can use this Factory ID with other scripts');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Helper function to decode Sui private key format to raw bytes
function decodePrivateKey(suiPrivateKey) {
  // Remove the 'suiprivkey' prefix
  if (!suiPrivateKey.startsWith('suiprivkey')) {
    throw new Error('Invalid Sui private key format');
  }
  
  // For now, let's just inform the user they need to use the Sui CLI
  throw new Error(
    'Direct use of Sui-format private keys is not supported in this script. ' +
    'Please use the Sui CLI to convert your key to base64 format:\n' +
    '  sui keytool convert --sui-key "' + suiPrivateKey + '" --output base64'
  );
}

// Helper function to extract factory ID from transaction effects
function extractFactoryIdFromTx(txResult) {
  const createdObjects = txResult.effects?.created || [];
  const factoryObject = createdObjects.find(obj => obj.owner === 'Shared');
  
  if (!factoryObject) {
    throw new Error('Factory object not found in transaction effects');
  }
  
  return factoryObject.reference.objectId;
}

// Run the main function
main(); 