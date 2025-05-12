// find-coins.js - Script to find available SUI coins in your wallet
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');

// Initialize the Sui client
const client = new SuiClient({
  url: getFullnodeUrl('devnet'), // or 'testnet', 'mainnet' based on your deployment
});

// Your wallet address
const WALLET_ADDRESS = '0xaa127b884072b4be1b803a38fecbb29ccb7bd58ff6a0a01f407e84d9edc8567a';

async function findCoins() {
  console.log(`Finding SUI coins for wallet: ${WALLET_ADDRESS}`);
  
  try {
    // Get all coins owned by the wallet
    const coins = await client.getCoins({
      owner: WALLET_ADDRESS,
      coinType: '0x2::sui::SUI'
    });
    
    console.log(`\nFound ${coins.data.length} SUI coins:`);
    console.log('------------------------------');
    
    // Display each coin with its ID and balance
    coins.data.forEach((coin, index) => {
      console.log(`${index + 1}. Coin ID: ${coin.coinObjectId}`);
      console.log(`   Balance: ${coin.balance} MIST (${parseInt(coin.balance) / 1000000000} SUI)`);
      console.log('------------------------------');
    });
    
    // Provide instructions for adding liquidity
    console.log('\nTo add liquidity to the pool, you need two SUI coins.');
    console.log('You can use the same coin for both parameters if it has enough balance.');
    console.log('\nExample command to add liquidity:');
    if (coins.data.length >= 2) {
      console.log(`sui client call --package 0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69 --module pool --function add_liquidity --type-args 0x2::sui::SUI 0x2::sui::SUI --args "0x178ed2fa4d5ce750e07207ea397b0baf250ac2bc6b0400314597fad082c209c4" "${coins.data[0].coinObjectId}" "${coins.data[1].coinObjectId}" 0 0 --gas-budget 10000000`);
    } else if (coins.data.length === 1) {
      console.log(`sui client call --package 0x7cddaeb8b8c472af70162c7644c58c2c56f4da03ddc1f94021b9f3c34bbb9a69 --module pool --function add_liquidity --type-args 0x2::sui::SUI 0x2::sui::SUI --args "0x178ed2fa4d5ce750e07207ea397b0baf250ac2bc6b0400314597fad082c209c4" "${coins.data[0].coinObjectId}" "${coins.data[0].coinObjectId}" 0 0 --gas-budget 10000000`);
      console.log('\nNote: You are using the same coin for both parameters. This may not work as expected.');
    } else {
      console.log('No SUI coins found in your wallet. You need to get some SUI first.');
    }
  } catch (error) {
    console.error('Error finding coins:', error);
  }
}

// Run the script
findCoins().catch(error => {
  console.error('Error:', error);
});
