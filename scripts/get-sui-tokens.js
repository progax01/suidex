// get-sui-tokens.js - Script to request SUI tokens from a faucet
const { SuiFaucetClient } = require('@mysten/sui.js/faucet');

// The address to fund (should be the same as in demo-factory.js)
const ADDRESS = '0x0a12a2295559cd0470745520fd90811f84bf17d55c7fc180e4e67cbb629c091a';

async function getFaucetTokens() {
  try {
    console.log(`Requesting SUI tokens for address: ${ADDRESS}`);
    
    // Create a faucet client for devnet
    const faucetClient = new SuiFaucetClient({
      host: 'https://faucet.devnet.sui.io/gas'
    });
    
    // Request tokens from the faucet
    const result = await faucetClient.requestSui({
      recipient: ADDRESS,
    });
    
    console.log('Faucet request successful!');
    console.log('Result:', result);
    console.log('\nNow you can run the demo-factory.js script again.');
  } catch (error) {
    console.error('Error requesting tokens from faucet:', error.message);
    console.log('\nIf you are using mainnet, you need to purchase SUI tokens from an exchange.');
    console.log('\nFor testnet/devnet, you can also use the Sui wallet browser extension to request tokens.');
  }
}

// Run the function
getFaucetTokens();
