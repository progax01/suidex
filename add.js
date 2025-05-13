// add.js
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { SuiClient } = require('@mysten/sui.js/client');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromSerializedSignature } = require('@mysten/sui.js/cryptography');
const fs = require('fs');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY; // suiprivkey format
const PACKAGE_ID = '0xe8e279ea6b71c3324124451857d97f50e5dca594a0c5dfd58135d4cee909d64c';
const FACTORY_ID = '0xaaf146d67716343eb211b5c8d5a2dfc4841853ca09542c22d929ec968fdc5a74';
const POOL_ID = '0xea94cc3758f9910dc918ab1658c98307a37dafaa86b9e37cac398f6274651797';
const TOKEN_A_TYPE = '0x2db0993d9011435a37f2465aa91637476c1352c6853fc374befc100013226eb1::token::TOKEN';
const TOKEN_B_TYPE = '0xbf213f3615983f375b43241ceecb2b02832d1b2771dbd673364079113a70cae2::token::TOKEN';
const COIN_A_ID = '0xcfaa4b037748c94f8ea3241fd56a07846a031f477faac799411a304d2691ae2b';
const COIN_B_ID = '0xf0e2e9a0324424d9fb8c1dd752dcc5765164e2f7f833a942b876bd62257ebea9';
const DEADLINE = 100000;
const GAS_BUDGET = 10000000;

// Function to extract private key from suiprivkey format
function extractPrivateKeyFromSuiFormat(suiPrivateKey) {
  if (!suiPrivateKey || !suiPrivateKey.startsWith('suiprivkey')) {
    throw new Error('Invalid SUI private key format. Expected suiprivkey format.');
  }
  
  // Extract the base64 part after the prefix
  const base64Part = suiPrivateKey.replace(/^suiprivkey[0-9]+[a-z]+/, '');
  
  try {
    // Convert from base64 to bytes
    const bytes = Buffer.from(base64Part, 'base64');
    
    // Return only the first 32 bytes
    return bytes.slice(0, 32);
  } catch (error) {
    throw new Error(`Failed to decode private key: ${error.message}`);
  }
}

async function addLiquidity() {
  try {
    // Initialize SuiClient
    const client = new SuiClient({
      url: 'https://fullnode.testnet.sui.io',
    });
    
    // Extract and create keypair
    const privateKeyBytes = extractPrivateKeyFromSuiFormat(PRIVATE_KEY);
    const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(`Using address: ${address}`);
    
    // Create a new transaction block
    const txb = new TransactionBlock();
    
    // First check if the pool exists using devInspectTransactionBlock
    const checkPoolTxb = new TransactionBlock();
    checkPoolTxb.moveCall({
      target: `${PACKAGE_ID}::factory::pool_exists`,
      typeArguments: [TOKEN_A_TYPE, TOKEN_B_TYPE],
      arguments: [checkPoolTxb.object(FACTORY_ID)],
    });
    
    console.log("Checking if pool exists...");
    const checkResult = await client.devInspectTransactionBlock({
      transactionBlock: checkPoolTxb,
      sender: address,
    });
    
    if (checkResult.error) {
      throw new Error(`Pool check failed: ${checkResult.error}`);
    }
    
    const poolExists = checkResult.results?.[0]?.returnValues?.[0]?.[0] === 1;
    console.log(`Pool exists: ${poolExists}`);
    
    if (!poolExists) {
      throw new Error("Pool does not exist. Please create the pool first.");
    }
    
    console.log("Creating add_liquidity transaction...");
    
    // Add liquidity call
    const lpToken = txb.moveCall({
      target: `${PACKAGE_ID}::router::add_liquidity`,
      typeArguments: [TOKEN_A_TYPE, TOKEN_B_TYPE],
      arguments: [
        txb.object(FACTORY_ID),
        txb.object(POOL_ID),
        txb.object(COIN_A_ID),
        txb.object(COIN_B_ID),
        txb.pure.u64(0), // amount_a_min
        txb.pure.u64(0), // amount_b_min
        txb.pure.u64(DEADLINE), // deadline
      ],
    });
    
    // Transfer LP token to sender
    txb.transferObjects([lpToken], txb.pure.address(address));
    
    // Set gas budget
    txb.setGasBudget(GAS_BUDGET);
    
    console.log("Submitting transaction...");
    const result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: txb,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });
    
    console.log(`Transaction executed! Digest: ${result.digest}`);
    
    if (result.effects?.status?.status === "success") {
      console.log("✅ Transaction succeeded!");
      
      // Look for created objects (LP tokens)
      if (result.objectChanges) {
        const createdObjects = result.objectChanges.filter(change => 
          change.type === "created" && 
          change.objectType.includes("LP")
        );
        
        if (createdObjects.length > 0) {
          console.log("Created LP tokens:", createdObjects.map(obj => obj.objectId));
        } else {
          console.log("No LP tokens found in the transaction result.");
        }
      }
      
      // Log events
      if (result.events && result.events.length > 0) {
        console.log("Events:", JSON.stringify(result.events, null, 2));
      }
    } else {
      console.error("❌ Transaction failed:", result.effects?.status);
      
      if (result.effects?.status?.error) {
        console.error("Error details:", result.effects.status.error);
      }
    }
    
    return result;
  } catch (error) {
    console.error("Error:", error.message);
    throw error;
  }
}

addLiquidity()
  .then(() => {
    console.log("Script completed successfully");
    process.exit(0);
  })
  .catch(error => {
    console.error("Script failed:", error);
    process.exit(1);
  });