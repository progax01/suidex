// add_liquidity_fixed.js - Reliable liquidity addition script for SuiDex
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { SuiClient } = require('@mysten/sui.js/client');
const { fromB64 } = require('@mysten/sui.js/utils');
const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');

// Configuration - Edit these values as needed
const PACKAGE_ID = '0x105f3805ed2f4d2231b1a96bc58bcc009725734ee2c1f0d68ca682f4980a57dc';
const FACTORY_ID = process.env.FACTORY_ID || '0xd44df1fd5898b88a93b3f92ad5e9a20a2ea1da8ac6248ba505468751fbce97c9';
const POOL_ID = process.env.POOL_ID || '0x15ec18c46de67a26a202b7d935327ab0ef76de7bf20640f7ab8c220c72d7020f';
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0x2::clock::Clock';
const COIN_B_ID = '0x6'; // System clock object
const AMOUNT_A_MIN = 1000; // Minimum amount of SUI to add (in MIST)
const AMOUNT_B_MIN = 1;    // Minimum amount of Clock to add
const GAS_BUDGET = 10000000;
const PRIVATE_KEY = process.env.SUI_PRIVATE_KEY || 'suiprivkey1qr8yacxzuu66a7f2j0hsr0xew9jk3ylvcp4mjms3us88uw7u2k8dg835jz4';

async function main() {
  try {
    console.log('=== SuiDex Add Liquidity Tool ===');
    
    // Create client
    const client = new SuiClient({ url: 'https://fullnode.devnet.sui.io' });
    
    // Create keypair from private key
    let keypair;
    try {
      if (PRIVATE_KEY.startsWith('suiprivkey')) {
        const privateKeyData = decodeSuiPrivateKey(PRIVATE_KEY);
        keypair = Ed25519Keypair.fromSecretKey(privateKeyData.secretKey);
      } else {
        // Assume base64 encoded private key
        keypair = Ed25519Keypair.fromSecretKey(fromB64(PRIVATE_KEY));
      }
    } catch (error) {
      console.error('Error creating keypair:', error);
      return;
    }
    
    const address = keypair.getPublicKey().toSuiAddress();
    console.log('Using address:', address);
    
    // Set deadline to current epoch + 10
    const epochResponse = await client.getLatestSuiSystemState();
    const currentEpoch = parseInt(epochResponse.epoch);
    const deadline = currentEpoch + 10;
    console.log(`Current epoch: ${currentEpoch}, deadline: ${deadline}`);
    
    // Get all SUI coins for this address
    console.log('\nFetching SUI coins...');
    const coins = await client.getCoins({
      owner: address,
      coinType: COIN_TYPE_A
    });
    
    if (!coins || !coins.data || coins.data.length === 0) {
      console.error('No SUI coins found in wallet');
      return;
    }
    
    console.log(`Found ${coins.data.length} SUI coins`);
    
    // Sort coins by balance (descending)
    coins.data.sort((a, b) => parseInt(b.balance) - parseInt(a.balance));
    
    // Display coin information
    console.log('\nAvailable coins:');
    coins.data.forEach((coin, index) => {
      console.log(`${index + 1}. Coin ID: ${coin.coinObjectId}, Balance: ${coin.balance} MIST`);
    });
    
    // Approach 1: Two-step process (split then add liquidity)
    console.log('\n=== Approach 1: Two-step process ===');
    
    try {
      // Step 1: Split a coin to create a separate coin for the transaction
      console.log('Step 1: Creating a separate coin for the transaction...');
      
      // Find a coin with sufficient balance
      const sourceCoin = coins.data.find(coin => parseInt(coin.balance) > AMOUNT_A_MIN + GAS_BUDGET);
      
      if (!sourceCoin) {
        console.error(`No coin with sufficient balance found. Need at least ${AMOUNT_A_MIN + GAS_BUDGET} MIST`);
        throw new Error('Insufficient balance');
      }
      
      console.log(`Using coin ${sourceCoin.coinObjectId} with balance ${sourceCoin.balance} MIST`);
      
      // Create a transaction to split the coin
      const splitTx = new TransactionBlock();
      splitTx.setGasBudget(GAS_BUDGET);
      
      // Split the coin into two parts: one for liquidity and one for gas
      const [remainingCoin, splitCoin] = splitTx.splitCoins(
        splitTx.object(sourceCoin.coinObjectId),
        [splitTx.pure(AMOUNT_A_MIN)]
      );
      
      // Transfer the split coin to ourselves
      splitTx.transferObjects([splitCoin], splitTx.pure(address));
      
      console.log('Executing split transaction...');
      const splitResult = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: splitTx,
        options: { showEffects: true, showObjectChanges: true }
      });
      
      console.log('Split transaction executed, digest:', splitResult.digest);
      
      // Find the newly created coin in the transaction result
      let newCoinId = null;
      if (splitResult.objectChanges) {
        const newCoin = splitResult.objectChanges.find(
          change => change.type === 'created' && 
                  change.objectType === '0x2::coin::Coin<0x2::sui::SUI>'
        );
        
        if (newCoin) {
          newCoinId = newCoin.objectId;
          console.log(`Found newly created coin: ${newCoinId}`);
        } else {
          console.error('Failed to find the split coin in transaction result');
          throw new Error('Could not find the split coin in the transaction result');
        }
      } else {
        console.error('Transaction completed but no object changes found');
        throw new Error('Could not find object changes in the transaction result');
      }
      
      // Wait a moment for the transaction to be confirmed
      console.log('Waiting for transaction to be confirmed...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 2: Add liquidity using the split coin
      console.log('\nStep 2: Adding liquidity with the split coin...');
      
      // Create a transaction block for adding liquidity
      const addLiquidityTx = new TransactionBlock();
      addLiquidityTx.setGasBudget(GAS_BUDGET);
      
      // Explicitly set gas payment to use the original coin (not the split one)
      // This is crucial to avoid the 'No valid gas coins' error
      addLiquidityTx.setGasPayment([{ objectId: sourceCoin.coinObjectId, digest: null, version: null }]);
      
      // Call the router's add_liquidity function
      const [lpCoin] = addLiquidityTx.moveCall({
        target: `${PACKAGE_ID}::router::add_liquidity`,
        typeArguments: [COIN_TYPE_A, COIN_TYPE_B],
        arguments: [
          addLiquidityTx.object(FACTORY_ID),
          addLiquidityTx.object(POOL_ID),
          addLiquidityTx.object(newCoinId),  // Use the newly created coin for the transaction
          addLiquidityTx.object(COIN_B_ID),
          addLiquidityTx.pure(AMOUNT_A_MIN),
          addLiquidityTx.pure(AMOUNT_B_MIN),
          addLiquidityTx.pure(deadline)
          // TxContext is added implicitly by the Sui runtime
        ]
      });
      
      // Transfer LP tokens to sender
      addLiquidityTx.transferObjects([lpCoin], addLiquidityTx.pure(address));
      
      console.log('Executing add_liquidity transaction...');
      const result = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: addLiquidityTx,
        options: { 
          showEffects: true, 
          showObjectChanges: true,
          showEvents: true
        }
      });
      
      console.log('Transaction executed, digest:', result.digest);
      
      // Check transaction status
      if (result.effects && result.effects.status && result.effects.status.status === 'success') {
        console.log('Transaction successful!');
        
        // Find LP token in the transaction result
        let lpTokenId = null;
        if (result.objectChanges) {
          const lpToken = result.objectChanges.find(
            change => change.type === 'created' && 
                    change.objectType.includes('::pool::LP')
          );
          
          if (lpToken) {
            lpTokenId = lpToken.objectId;
            console.log('Found LP token:', lpTokenId);
          }
        }
        
        // Also check events for LP token creation
        if (!lpTokenId && result.events) {
          const lpEvent = result.events.find(
            event => event.type.includes('::pool::LiquidityAdded')
          );
          
          if (lpEvent && lpEvent.parsedJson && lpEvent.parsedJson.lp_token_id) {
            lpTokenId = lpEvent.parsedJson.lp_token_id;
            console.log('Found LP token from event:', lpTokenId);
          }
        }
        
        if (lpTokenId) {
          console.log('\n=== SUCCESS: Liquidity Added ===');
          console.log('LP Token ID:', lpTokenId);
          console.log('The operation completed successfully!');
        } else {
          console.log('\n=== Liquidity Addition Completed but No LP Token Found ===');
          console.log('The transaction completed but no LP token was detected in the result.');
          console.log('Check your contract implementation for add_liquidity.');
        }
      } else {
        console.error('Transaction failed:', result.effects?.status?.error);
        throw new Error(`Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error in Approach 1:', error.message);
      
      // If Approach 1 fails, try Approach 2
      console.log('\n=== Approach 2: Using multiple coins ===');
      
      try {
        // Only proceed if we have at least 2 coins
        if (coins.data.length < 2) {
          console.error('Not enough coins for Approach 2. Need at least 2 SUI coins.');
          throw new Error('Not enough coins');
        }
        
        // Use smallest coin for transaction, largest for gas
        const txCoinId = coins.data[coins.data.length - 1].coinObjectId;
        const gasCoinId = coins.data[0].coinObjectId;
        
        console.log(`Using coin for transaction: ${txCoinId}`);
        console.log(`Using coin for gas: ${gasCoinId}`);
        
        const tx = new TransactionBlock();
        tx.setGasBudget(GAS_BUDGET);
        tx.setGasPayment([{ objectId: gasCoinId, digest: null, version: null }]);
        
        // Call the router's add_liquidity function
        const [lpCoin] = tx.moveCall({
          target: `${PACKAGE_ID}::router::add_liquidity`,
          typeArguments: [COIN_TYPE_A, COIN_TYPE_B],
          arguments: [
            tx.object(FACTORY_ID),
            tx.object(POOL_ID),
            tx.object(txCoinId),
            tx.object(COIN_B_ID),
            tx.pure(AMOUNT_A_MIN),
            tx.pure(AMOUNT_B_MIN),
            tx.pure(deadline)
          ]
        });
        
        // Transfer LP tokens to sender
        tx.transferObjects([lpCoin], tx.pure(address));
        
        console.log('Executing transaction with explicit gas coin...');
        const result = await client.signAndExecuteTransactionBlock({
          signer: keypair,
          transactionBlock: tx,
          options: { showEffects: true, showObjectChanges: true }
        });
        
        console.log('Transaction successful!');
        console.log('Transaction digest:', result.digest);
        
        // Find LP token
        if (result.objectChanges) {
          const lpToken = result.objectChanges.find(
            change => change.type === 'created' && 
                    change.objectType.includes('::pool::LP')
          );
          
          if (lpToken) {
            console.log('\n=== SUCCESS: Liquidity Added ===');
            console.log('Found LP token:', lpToken.objectId);
            console.log('The operation completed successfully!');
          } else {
            console.log('\n=== Liquidity Addition Completed but No LP Token Found ===');
            console.log('The transaction completed but no LP token was detected in the result.');
          }
        }
      } catch (error) {
        console.error('Error in Approach 2:', error.message);
        console.log('\nBoth approaches failed. Please try the CLI method as a last resort:');
        
        console.log(`\nsui client call --package ${PACKAGE_ID} --module router --function add_liquidity \
--type-args ${COIN_TYPE_A} ${COIN_TYPE_B} \
--args ${FACTORY_ID} ${POOL_ID} <COIN_A_ID> ${COIN_B_ID} ${AMOUNT_A_MIN} ${AMOUNT_B_MIN} ${deadline} \
--gas-budget ${GAS_BUDGET}`);
      }
    }
  } catch (error) {
    console.error('Error in main function:', error.message);
  }
}

main().catch(console.error);
