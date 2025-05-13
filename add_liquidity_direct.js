// add_liquidity_direct.js - Direct liquidity addition script
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { SuiClient } = require('@mysten/sui.js/client');
const { fromB64 } = require('@mysten/sui.js/utils');
const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');

// Configuration
const PACKAGE_ID = '0x105f3805ed2f4d2231b1a96bc58bcc009725734ee2c1f0d68ca682f4980a57dc';
const FACTORY_ID = '0xd8a787d9255dcb85aac4f641605655851fc18628b6a3fa4dd2ebbb5de53bf707';
const POOL_ID = '0x4e2a8cdb2a877a6ae57a91b31768cec65b29d8b89bd37b3bb8d1f8d9942e5e3f';
const COIN_TYPE_A = '0x2::sui::SUI';
const COIN_TYPE_B = '0x2::clock::Clock';
const COIN_A_ID = '0x5d432cecbd191678eb0f518b657e01f147e9158c9e4e2deb15a2013032d6ed91';
const COIN_B_ID = '0x6';
const AMOUNT_A_MIN = 1000;
const AMOUNT_B_MIN = 1;
const DEADLINE = 743;
const GAS_BUDGET = 10000000;
const PRIVATE_KEY = process.env.SUI_PRIVATE_KEY || 'suiprivkey1qr8yacxzuu66a7f2j0hsr0xew9jk3ylvcp4mjms3us88uw7u2k8dg835jz4';

async function main() {
  try {
    console.log('Adding liquidity directly...');
    
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
    
    // First, get all coins to find a suitable one
    const address = keypair.getPublicKey().toSuiAddress();
    console.log('Using address:', address);
    
    const coins = await client.getCoins({
      owner: address,
      coinType: '0x2::sui::SUI'
    });
    
    if (!coins || !coins.data || coins.data.length === 0) {
      console.error('No SUI coins found in wallet');
      return;
    }
    
    console.log('Found', coins.data.length, 'SUI coins');
    
    // First attempt: Try to create a transaction that splits the coin
    try {
      const tx = new TransactionBlock();
      tx.setGasBudget(GAS_BUDGET);
      
      // Split the coin
      const [remainingCoin, splitCoin] = tx.splitCoins(
        tx.object(COIN_A_ID),
        [tx.pure(AMOUNT_A_MIN)]
      );
      
      // Add liquidity with the split coin - using router module
      const [lpCoin] = tx.moveCall({
        target: `${PACKAGE_ID}::router::add_liquidity`,
        typeArguments: [COIN_TYPE_A, COIN_TYPE_B],
        arguments: [
          tx.object(FACTORY_ID),
          tx.object(POOL_ID),
          splitCoin,
          tx.object(COIN_B_ID),
          tx.pure(AMOUNT_A_MIN),
          tx.pure(AMOUNT_B_MIN),
          tx.pure(DEADLINE)
          // TxContext is added implicitly by the Sui runtime
        ]
      });
      
      // Transfer LP tokens to sender
      tx.transferObjects([lpCoin], tx.pure(address));
      
      console.log('Executing transaction with coin splitting...');
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
          console.log('Found LP token:', lpToken.objectId);
        }
      }
      
    } catch (error) {
      console.error('First attempt failed:', error.message);
      
      // Second attempt: Try to use a different coin for gas
      if (coins.data.length >= 2) {
        try {
          console.log('Trying second approach with multiple coins...');
          
          // Sort coins by balance
          coins.data.sort((a, b) => parseInt(a.balance) - parseInt(b.balance));
          
          // Use smallest coin for transaction, largest for gas
          const txCoinId = coins.data[0].coinObjectId;
          const gasCoinId = coins.data[coins.data.length - 1].coinObjectId;
          
          console.log('Using coin for tx:', txCoinId);
          console.log('Using coin for gas:', gasCoinId);
          
          const tx = new TransactionBlock();
          tx.setGasBudget(GAS_BUDGET);
          tx.setGasPayment([{ objectId: gasCoinId, digest: null, version: null }]);
          
          // Add liquidity directly using router module
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
              tx.pure(DEADLINE)
              // TxContext is added implicitly by the Sui runtime
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
              console.log('Found LP token:', lpToken.objectId);
            }
          }
          
        } catch (error) {
          console.error('Second attempt failed:', error.message);
          console.log('
Falling back to CLI method...');
          
          // Third attempt: Use CLI
          try {
            const { execSync } = require('child_process');
            
            console.log('Trying CLI approach...');
            
            const command = `sui client call --package ${PACKAGE_ID} --module router --function add_liquidity ` +
                           `--type-args ${COIN_TYPE_A} ${COIN_TYPE_B} ` +
                           `--args ${FACTORY_ID} ${POOL_ID} ${COIN_A_ID} ${COIN_B_ID} ${AMOUNT_A_MIN} ${AMOUNT_B_MIN} ${DEADLINE} ` +
                           `--gas-budget ${GAS_BUDGET}`;
            
            console.log('Executing command:', command);
            const output = execSync(command, { encoding: 'utf8' });
            console.log('Command output:', output);
            console.log('Liquidity added successfully via CLI!');
          } catch (cliError) {
            console.error('CLI attempt failed:', cliError.message);
            console.error('All attempts to add liquidity have failed.');
          }
        }
      } else {
        console.log('Not enough coins to try second approach. Need at least 2 SUI coins.');
      }
    }
  } catch (error) {
    console.error('Error in main function:', error.message);
  }
}

main().catch(console.error);
