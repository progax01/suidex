// example.js - Example usage of SuiDex SDK
const SuiDexSDK = require('./suidex-sdk');

async function main() {
  try {
    // Get private key from environment variable
    const privateKeyString = process.env.SUI_PRIVATE_KEY || 'suiprivkey1qr8yacxzuu66a7f2j0hsr0xew9jk3ylvcp4mjms3us88uw7u2k8dg835jz4';
    
    if (!privateKeyString) {
      console.error('ERROR: SUI_PRIVATE_KEY environment variable not set');
      console.error('Please set it with: $env:SUI_PRIVATE_KEY="your_sui_private_key"');
      process.exit(1);
    }
    
    // Initialize the SDK
    // For custom package ID, replace the first parameter with your package ID
    const sdk = new SuiDexSDK(null, 'devnet');
    
    // Create keypair from private key string
    const keypair = sdk.createKeypair(privateKeyString);
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(`Using address: ${address}`);
    
    // Check if the address has SUI coins
    console.log('\n=== Checking Wallet ===');
    console.log('Getting coins for the wallet address...');
    
    const coins = await sdk.getCoins(address);
    if (coins.length === 0) {
      console.error('\nERROR: No SUI coins found in wallet. Please fund your wallet with SUI tokens.');
      console.error('You can get SUI tokens from the Sui faucet: https://faucet.devnet.sui.io/');
      process.exit(1);
    }
    
    // Sort coins by balance
    coins.sort((a, b) => parseInt(b.balance) - parseInt(a.balance));
    const totalBalance = coins.reduce((sum, coin) => sum + parseInt(coin.balance), 0);
    
    console.log(`Found ${coins.length} SUI coins:`);
    coins.forEach((coin, i) => {
      console.log(`  ${i+1}. ${coin.coinObjectId} - Balance: ${parseInt(coin.balance) / 1000000000} SUI`);
    });
    console.log(`Total balance: ${totalBalance / 1000000000} SUI`);
    
    // Check if we have enough balance for the test
    if (totalBalance < 20000000) { // 0.02 SUI
      console.warn('\nWARNING: Low balance detected. You may encounter issues with gas payments.');
      console.warn('Recommended minimum balance: 0.02 SUI for testing');
    }
    
    // Step 1: Create a factory
    console.log('\n=== Creating Factory ===');
    try {
      const factoryId = await sdk.createFactory(keypair);
      console.log('Factory created successfully!');
      console.log('Factory ID:', factoryId);
      
      // Step 2: Create a pool for SUI and Clock
      console.log('\n=== Creating Pool ===');
      // Use SUI and Clock as a safe pair that works
      const coinTypeA = sdk.SUI_TYPE;
      const coinTypeB = sdk.CLOCK_TYPE;
      
      try {
        console.log(`Creating pool for ${coinTypeA} and ${coinTypeB}...`);
        const poolId = await sdk.createPool(keypair, factoryId, coinTypeA, coinTypeB);
        console.log('Pool created successfully!');
        console.log('Pool ID:', poolId);
        
        // Step 3: Check if pool exists
        console.log('\n=== Checking Pool ===');
        console.log('Verifying pool existence...');
        const poolExists = await sdk.poolExists(factoryId, coinTypeA, coinTypeB, address);
        console.log(`Pool exists: ${poolExists}`);
        
        // Step 4: Add liquidity to the pool (if needed)
        if (poolExists) {
          console.log('\n=== Adding Liquidity ===');
          
          try {
            // Find a suitable SUI coin
            console.log('Finding a suitable SUI coin for liquidity...');
            const suiCoin = coins.find(coin => parseInt(coin.balance) > 10000000); // > 0.01 SUI
            
            if (suiCoin) {
              console.log(`Using coin ${suiCoin.coinObjectId} with balance ${parseInt(suiCoin.balance) / 1000000000} SUI`);
              
              // Check if we need to split the coin first
              if (coins.length === 1 || !coins.some(coin => 
                  coin.coinObjectId !== suiCoin.coinObjectId && 
                  parseInt(coin.balance) >= sdk.GAS_BUDGET)) {
                
                console.log('Need to split coin for separate gas payment...');
                
                // Process will be handled automatically by the SDK
                console.log('The SDK will automatically split the coin during the addLiquidity call');
              }
              
              // Use the system clock object for the second coin
              const clockObjectId = sdk.CLOCK_OBJECT_ID;
              console.log(`Using system Clock object: ${clockObjectId}`);
              
              console.log('Adding liquidity to the pool...');
              // Add liquidity
              const result = await sdk.addLiquidity(
                keypair,
                factoryId,
                poolId,
                coinTypeA,
                coinTypeB,
                suiCoin.coinObjectId,
                clockObjectId,
                1000000, // 0.001 SUI minimum
                1        // 1 for Clock
              );
              
              if (result.lpTokenId) {
                console.log('\n=== Success! ===');
                console.log('Liquidity added successfully!');
                console.log('LP Token ID:', result.lpTokenId);
                
                // Step 5: Get pool information
                console.log('\n=== Pool Information ===');
                const poolInfo = await sdk.getPoolInfo(poolId);
                console.log('Pool Type:', poolInfo.data?.type);
                console.log('Transaction Digest:', result.digest);
                
                console.log('\nAll operations completed successfully!');
              } else {
                console.log('\nThe transaction completed but no LP token was found in the result.');
                console.log('This could indicate an issue with the contract implementation.');
              }
            } else {
              console.log('\nNo SUI coin with sufficient balance found for liquidity addition.');
              console.log('Need at least 0.01 SUI in a single coin.');
            }
          } catch (error) {
            console.error('\n=== Error Adding Liquidity ===');
            console.error('Error:', error.message);
            
            if (error.message.includes('No valid gas coins')) {
              console.error('\nThis error occurs when the transaction cannot find a separate coin for gas payment.');
              console.error('The SDK attempted to split your coin but encountered an issue.');
              console.error('\nPossible solutions:');
              console.error('1. Use the Sui CLI to manually split your coin:');
              console.error('   sui client split-coin --coin-id <YOUR_COIN_ID> --amounts 10000000 --gas-budget 10000000');
              console.error('2. Request multiple smaller coins from the faucet instead of one large coin');
              console.error('3. Increase your total SUI balance');
            }
          }
        }
      } catch (error) {
        console.error('Error creating pool:', error.message);
        
        if (error.message.includes('TypeArityMismatch')) {
          console.error('\nThis error occurs when the type parameters provided do not match what the contract expects.');
          console.error('Check the contract implementation for the correct type parameters.');
        }
      }
    } catch (error) {
      console.error('Error creating factory:', error.message);
      
      if (error.message.includes('No valid gas coins')) {
        console.error('\nThis error occurs when you do not have enough SUI for gas payment.');
        console.error('Please fund your wallet with more SUI tokens.');
      }
    }
    
    console.log('\n=== Example Completed ===');
    
  } catch (error) {
    console.error('\n=== Unexpected Error ===');
    console.error('Error:', error.message);
    
    if (error.message && error.message.includes('No valid gas coins')) {
      console.error('\nSOLUTION: Fund your wallet address with more SUI tokens for gas fees.');
      console.error('You can get SUI tokens from the Sui faucet: https://faucet.devnet.sui.io/');
    }
  }
}

// Run the example
main().catch(console.error); 