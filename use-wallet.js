// use-wallet.js - Example to use the factory with Sui CLI wallet
const { getFullnodeUrl, SuiClient } = require('@mysten/sui.js/client');
const { TransactionBlock } = require('@mysten/sui.js/transactions');

// Package ID - replace with your actual deployed package ID
const PACKAGE_ID = '0x...'; // TODO: Replace with your actual package ID after deployment

async function main() {
  try {
    console.log('To run this example, follow these steps:');
    console.log('');
    console.log('1. Make sure you have Sui CLI installed and configured with your wallet');
    console.log('2. Replace the PACKAGE_ID in this file with your actual deployed package ID');
    console.log('3. Run the appropriate command for what you want to do:');
    console.log('');
    console.log('To create a factory:');
    console.log('  sui client call --package ' + PACKAGE_ID + ' --module factory --function create_factory --gas-budget 100000000');
    console.log('');
    console.log('After creating a factory, you\'ll get an object ID. Use it for other operations:');
    console.log('');
    console.log('To create a pool (replace FACTORY_ID and CUSTOM_COIN_TYPE):');
    console.log('  sui client call --package ' + PACKAGE_ID + ' --module factory --function create_pool \\');
    console.log('    --type-args "0x2::sui::SUI" "CUSTOM_COIN_TYPE" \\');
    console.log('    --args "FACTORY_ID" --gas-budget 100000000');
    console.log('');
    console.log('To query if a pool exists (this is a read-only view function):');
    console.log('  sui client call --package ' + PACKAGE_ID + ' --module factory --function pool_exists \\');
    console.log('    --type-args "0x2::sui::SUI" "CUSTOM_COIN_TYPE" \\');
    console.log('    --args "FACTORY_ID" --gas-budget 100000000');
    console.log('');
    console.log('To get the pool count:');
    console.log('  sui client call --package ' + PACKAGE_ID + ' --module factory --function pool_count \\');
    console.log('    --args "FACTORY_ID" --gas-budget 100000000');
    console.log('');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the main function
main(); 