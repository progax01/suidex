// suidex-sdk.js - Comprehensive SDK for SuiDex contract interactions
const { SuiClient } = require('@mysten/sui.js/client');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');

/**
 * SuiDex SDK - A JavaScript SDK for interacting with SuiDex contracts
 */
class SuiDexSDK {
  /**
   * Create a new SuiDex SDK instance
   * @param {string} packageId - The SuiDex package ID (optional, defaults to the included demo contract)
   * @param {string} network - Network to connect to ('devnet', 'testnet', 'mainnet')
   * @param {string} customRpcUrl - Custom RPC URL (optional)
   */
  constructor(packageId, network = 'devnet', customRpcUrl = null) {
    // Package ID from publishing the contract
    this.packageId = packageId || '0x8991b315b7c2d72bfe12fbeb7ca5203db480fbb43658260c0d38051bcf1e6519';
    
    // Constants
    this.MODULE_FACTORY = 'factory';
    this.MODULE_POOL = 'pool';
    this.MODULE_ROUTER = 'router';
    this.GAS_BUDGET = 10000000;
    
    // Initialize client
    this.client = this.initClient(network, customRpcUrl);
    
    // Default token types
    this.SUI_TYPE = '0x2::sui::SUI';
    this.CLOCK_TYPE = '0x2::clock::Clock';
    this.CLOCK_OBJECT_ID = '0x6'; // Standard system clock object ID
  }
  
  /**
   * Initialize Sui client with the specified network or URL
   * @param {string} network - The network to connect to ('devnet', 'testnet', 'mainnet')
   * @param {string} customUrl - Custom RPC URL (optional)
   * @returns {SuiClient} The initialized Sui client
   */
  initClient(network = 'devnet', customUrl = null) {
    if (customUrl) {
      return new SuiClient({ url: customUrl });
    }

    const networkUrls = {
      devnet: 'https://fullnode.devnet.sui.io:443',
      testnet: 'https://fullnode.testnet.sui.io:443',
      mainnet: 'https://sui-mainnet.mystenlabs.com/json-rpc'
    };

    return new SuiClient({ url: networkUrls[network] || networkUrls.devnet });
  }
  
  /**
   * Create a keypair from a private key string
   * Handles both Sui-format and Base64 private keys
   * @param {string} privateKeyStr - The private key string
   * @returns {Ed25519Keypair} The keypair
   */
  createKeypair(privateKeyStr) {
    try {
      // Use Sui's official utility to decode the private key
      const { schema, secretKey } = decodeSuiPrivateKey(privateKeyStr);
      if (schema === 'ED25519') {
        return Ed25519Keypair.fromSecretKey(secretKey);
      }
      throw new Error(`Unsupported key schema: ${schema}`);
    } catch (error) {
      console.error('Error creating keypair:', error);
      throw new Error('Invalid private key format');
    }
  }
  
  /**
   * Get coins owned by an address
   * @param {string} address - The address to check
   * @param {string} coinType - The coin type (defaults to SUI)
   * @returns {Promise<Array>} Array of coin objects
   */
  async getCoins(address, coinType = '0x2::sui::SUI') {
    try {
      const coins = await this.client.getCoins({
        owner: address,
        coinType: coinType
      });
      
      return coins.data || [];
    } catch (error) {
      console.error('Error getting coins:', error);
      return [];
    }
  }
  
  /**
   * Get suitable gas coin for transactions
   * @param {string} address - The address to check
   * @param {number} minBalance - Minimum balance required
   * @returns {Promise<string|null>} Coin object ID or null if not found
   */
  async getGasCoin(address, minBalance = this.GAS_BUDGET) {
    const coins = await this.getCoins(address);
    
    // Find coin with sufficient balance
    const gasCoin = coins.find(coin => parseInt(coin.balance) >= minBalance);
    
    if (gasCoin) {
      return gasCoin.coinObjectId;
    }
    return null;
  }
  
  /**
   * Split a SUI coin into two coins for transaction and gas
   * @param {Ed25519Keypair} keypair - The keypair for signing
   * @param {string} coinId - The coin ID to split
   * @param {number} splitAmount - Amount to split out
   * @returns {Promise<string>} The ID of the newly created coin
   */
  async splitCoin(keypair, coinId, splitAmount) {
    try {
      // Create the transaction block
      const tx = new TransactionBlock();
      
      // Set the gas budget explicitly
      tx.setGasBudget(this.GAS_BUDGET);
      
      // Important: Since we're splitting the coin that's also being used for gas,
      // we need to set it as both the coin to split AND the gas payment coin
      tx.setGasPayment([tx.object(coinId)]);
      
      // Split the coin
      const [coin, splitCoin] = tx.splitCoins(tx.object(coinId), [tx.pure(splitAmount)]);
      
      // Transfer the split coin to sender (to make it easy to find)
      tx.transferObjects([splitCoin], tx.pure(keypair.getPublicKey().toSuiAddress()));
      
      // Execute the transaction
      const result = await this.client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: tx,
        options: { 
          showEffects: true, 
          showObjectChanges: true,
          showInput: true
        }
      });
      
      // Find the new coin in the transaction results
      if (result.objectChanges) {
        const newCoin = result.objectChanges.find(
          change => change.type === 'created' && 
                  change.objectType === '0x2::coin::Coin<0x2::sui::SUI>'
        );
        
        if (newCoin) {
          return newCoin.objectId;
        }
      }
      
      throw new Error('Failed to extract split coin ID from transaction result');
    } catch (error) {
      console.error('Error splitting coin:', error);
      throw new Error(`Failed to split coin: ${error.message}`);
    }
  }
  
  /**
   * Extract shared object ID from transaction result
   * @param {Object} result - Transaction result
   * @returns {string|null} Shared object ID or null if not found
   */
  extractSharedObjectId(result) {
    try {
      // Check objectChanges first (more structured)
      if (result.objectChanges) {
        // Look for created objects with Shared owner
        const createdObjects = result.objectChanges.filter(
          change => change.type === 'created' && change.owner && change.owner.Shared
        );
        
        if (createdObjects.length > 0) {
          return createdObjects[0].objectId;
        }
      }
      
      // Fallback to effects.created
      if (result.effects && result.effects.created) {
        const sharedObjects = result.effects.created.filter(
          item => item.owner && item.owner.Shared
        );
        
        if (sharedObjects.length > 0) {
          return sharedObjects[0].reference.objectId;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting shared object ID:', error);
      return null;
    }
  }
  
  /**
   * Get the current epoch (for deadline calculations)
   * @returns {Promise<number>} Current epoch
   */
  async getCurrentEpoch() {
    const response = await this.client.getLatestSuiSystemState();
    return parseInt(response.epoch);
  }
  
  /**
   * Create a factory
   * @param {Ed25519Keypair} keypair - The keypair for signing
   * @returns {Promise<string>} The factory ID
   */
  async createFactory(keypair) {
    const tx = new TransactionBlock();
    
    tx.moveCall({
      target: `${this.packageId}::${this.MODULE_FACTORY}::create_factory`,
      arguments: [],
    });
    
    tx.setGasBudget(this.GAS_BUDGET);
    
    const result = await this.client.signAndExecuteTransactionBlock({ 
      signer: keypair,
      transactionBlock: tx,
      options: { showEffects: true, showObjectChanges: true }
    });
    
    const factoryId = this.extractSharedObjectId(result);
    if (!factoryId) {
      throw new Error('Failed to extract factory ID from transaction result');
    }
    
    return factoryId;
  }
  
  /**
   * Create a pool for a token pair
   * @param {Ed25519Keypair} keypair - The keypair for signing
   * @param {string} factoryId - The factory ID
   * @param {string} coinTypeA - First coin type
   * @param {string} coinTypeB - Second coin type
   * @returns {Promise<string>} The pool ID
   */
  async createPool(keypair, factoryId, coinTypeA, coinTypeB) {
    try {
      // Validate coin types
      if (!coinTypeA.includes('::') || !coinTypeB.includes('::')) {
        throw new Error('Coin types must be fully qualified (e.g., "0x2::sui::SUI")');
      }
      
      const tx = new TransactionBlock();
      
      tx.moveCall({
        target: `${this.packageId}::${this.MODULE_FACTORY}::create_pool`,
        typeArguments: [coinTypeA, coinTypeB],
        arguments: [tx.object(factoryId)],
      });
      
      tx.setGasBudget(this.GAS_BUDGET);
      
      const result = await this.client.signAndExecuteTransactionBlock({ 
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true }
      });
      
      // Try to extract pool ID
      let poolId = null;
      
      // First, try to find pool-specific objects in the result
      if (result.objectChanges) {
        const poolObject = result.objectChanges.find(
          change => change.type === 'created' && 
                    change.objectType && 
                    change.objectType.includes('::pool::Pool')
        );
        
        if (poolObject) {
          poolId = poolObject.objectId;
        }
      }
      
      // If we couldn't find the pool in the result, try to get it from the factory
      if (!poolId) {
        const senderAddress = keypair.getPublicKey().toSuiAddress();
        const poolAddr = await this.getPoolAddress(factoryId, coinTypeA, coinTypeB, senderAddress);
        if (poolAddr) {
          poolId = poolAddr;
        }
      }
      
      if (!poolId) {
        throw new Error('Failed to extract pool ID from transaction result');
      }
      
      return poolId;
    } catch (error) {
      console.error('Error creating pool:', error);
      
      if (error.message && error.message.includes('TypeArityMismatch')) {
        throw new Error('Type mismatch error: Check if your coin types are correctly specified with all required type parameters.');
      }
      
      throw error;
    }
  }
  
  /**
   * Check if a pool exists for a token pair
   * @param {string} factoryId - The factory ID
   * @param {string} coinTypeA - First coin type
   * @param {string} coinTypeB - Second coin type
   * @param {string} senderAddress - The sender address
   * @returns {Promise<boolean>} Whether the pool exists
   */
  async poolExists(factoryId, coinTypeA, coinTypeB, senderAddress) {
    try {
      const tx = new TransactionBlock();
      
      tx.moveCall({
        target: `${this.packageId}::${this.MODULE_FACTORY}::pool_exists`,
        typeArguments: [coinTypeA, coinTypeB],
        arguments: [tx.object(factoryId)],
      });
      
      const result = await this.client.devInspectTransactionBlock({
        sender: senderAddress,
        transactionBlock: tx,
      });
      
      if (result.effects?.status?.status === 'success' && result.results?.[0]?.returnValues) {
        return Boolean(result.results[0].returnValues[0][0]);
      }
      
      return false;
    } catch (error) {
      console.error('Error checking if pool exists:', error);
      return false;
    }
  }
  
  /**
   * Get the pool address for a token pair
   * @param {string} factoryId - The factory ID
   * @param {string} coinTypeA - First coin type
   * @param {string} coinTypeB - Second coin type
   * @param {string} senderAddress - The sender address
   * @returns {Promise<string|null>} The pool address or null if not found
   */
  async getPoolAddress(factoryId, coinTypeA, coinTypeB, senderAddress) {
    try {
      const tx = new TransactionBlock();
      
      tx.moveCall({
        target: `${this.packageId}::${this.MODULE_FACTORY}::get_pool`,
        typeArguments: [coinTypeA, coinTypeB],
        arguments: [tx.object(factoryId)],
      });
      
      const result = await this.client.devInspectTransactionBlock({
        sender: senderAddress,
        transactionBlock: tx,
      });
      
      if (result.effects?.status?.status === 'success' && result.results?.[0]?.returnValues) {
        const exists = Boolean(result.results[0].returnValues[0][0]);
        if (exists) {
          return result.results[0].returnValues[0][1];
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting pool address:', error);
      return null;
    }
  }
  
  /**
   * Add liquidity to a pool
   * @param {Ed25519Keypair} keypair - The keypair for signing
   * @param {string} factoryId - The factory ID
   * @param {string} poolId - The pool ID
   * @param {string} coinTypeA - First coin type
   * @param {string} coinTypeB - Second coin type
   * @param {string} coinAObjectId - Coin A object ID
   * @param {string} coinBObjectId - Coin B object ID
   * @param {string|number} amountAMin - Minimum amount of coin A
   * @param {string|number} amountBMin - Minimum amount of coin B
   * @param {string|number} deadline - Transaction deadline timestamp (optional, defaults to current epoch + 10)
   * @returns {Promise<Object>} Transaction result with LP token information
   */
  async addLiquidity(
    keypair,
    factoryId,
    poolId,
    coinTypeA,
    coinTypeB,
    coinAObjectId,
    coinBObjectId,
    amountAMin,
    amountBMin,
    deadline = null
  ) {
    try {
      // Use current epoch + 10 as deadline if not specified
      if (deadline === null) {
        const currentEpoch = await this.getCurrentEpoch();
        deadline = currentEpoch + 10;
      }
      
      const address = keypair.getPublicKey().toSuiAddress();
      
      // Special handling for SUI as coinA
      if (coinTypeA === this.SUI_TYPE) {
        // Get all SUI coins for this address
        const coins = await this.getCoins(address);
        
        if (coins.length === 0) {
          throw new Error('No SUI coins found in wallet');
        }
        
        // Sort coins by balance (descending)
        coins.sort((a, b) => parseInt(b.balance) - parseInt(a.balance));
        
        // Check if we need to split coins
        if (coins.length === 1 && coinAObjectId === coins[0].coinObjectId) {
          console.log(`Only one SUI coin found (${coinAObjectId}). Splitting for gas payment...`);
          
          // Make sure the coin has enough balance for both transaction and gas
          if (parseInt(coins[0].balance) <= parseInt(amountAMin) + this.GAS_BUDGET) {
            throw new Error(`Insufficient balance: ${coins[0].balance} is not enough for amount (${amountAMin}) and gas (${this.GAS_BUDGET})`);
          }
          
          try {
            // Split the coin to create a separate one for transaction input
            const newCoinId = await this.splitCoin(keypair, coinAObjectId, parseInt(amountAMin));
            console.log(`Successfully split coin. Using ${newCoinId} for transaction input and original coin for gas.`);
            
            // Use the new coin as input and recall this function
            return this.addLiquidity(
              keypair,
              factoryId,
              poolId,
              coinTypeA,
              coinTypeB,
              newCoinId,
              coinBObjectId,
              amountAMin,
              amountBMin,
              deadline
            );
          } catch (splitError) {
            throw new Error(`Failed to split coin: ${splitError.message}`);
          }
        } else if (coins.length > 1) {
          // We have multiple coins, so verify we're using a different one for gas
          const otherCoins = coins.filter(coin => coin.coinObjectId !== coinAObjectId);
          
          if (otherCoins.length > 0 && parseInt(otherCoins[0].balance) >= this.GAS_BUDGET) {
            console.log(`Using ${coinAObjectId} for transaction input and ${otherCoins[0].coinObjectId} for gas payment.`);
            // Continue with normal execution using separate coins
          } else {
            console.log(`No suitable gas coin found among ${coins.length} coins. Will use the same coin.`);
            // Continue with normal execution, but the transaction might fail
          }
        }
      }
      
      // Create the transaction
      const tx = new TransactionBlock();
      
      // Set gas budget explicitly
      tx.setGasBudget(this.GAS_BUDGET);
      
      // Handle gas payment if needed
      if (coinTypeA === this.SUI_TYPE) {
        const coins = await this.getCoins(address);
        const gasCoin = coins.find(coin => 
          coin.coinObjectId !== coinAObjectId && 
          parseInt(coin.balance) >= this.GAS_BUDGET
        );
        
        if (gasCoin) {
          console.log(`Setting explicit gas payment with coin: ${gasCoin.coinObjectId}`);
          tx.setGasPayment([tx.object(gasCoin.coinObjectId)]);
        }
      }
      
      // Create the transaction call
      const lpCoin = tx.moveCall({
        target: `${this.packageId}::${this.MODULE_ROUTER}::add_liquidity`,
        typeArguments: [coinTypeA, coinTypeB],
        arguments: [
          tx.object(factoryId),
          tx.object(poolId),
          tx.object(coinAObjectId),
          tx.object(coinBObjectId),
          tx.pure(amountAMin),
          tx.pure(amountBMin),
          tx.pure(deadline),
        ],
      });
      
      // Transfer LP tokens to sender
      tx.transferObjects([lpCoin], tx.pure(address));
      
      // Execute the transaction
      const result = await this.client.signAndExecuteTransactionBlock({ 
        signer: keypair,
        transactionBlock: tx,
        options: { 
          showEffects: true, 
          showObjectChanges: true,
          showEvents: true
        }
      });
      
      // Extract LP token information from the result
      let lpTokenId = null;
      if (result.objectChanges) {
        // Look for created objects of LP token type
        const lpTokenObj = result.objectChanges.find(
          change => change.type === 'created' && 
                    change.objectType && 
                    change.objectType.includes('lp_token::LP')
        );
        
        if (lpTokenObj) {
          lpTokenId = lpTokenObj.objectId;
        }
      }
      
      return {
        ...result,
        lpTokenId
      };
    } catch (error) {
      console.error('Error adding liquidity:', error);
      throw error;
    }
  }
  
  /**
   * Swap exact input for output
   * @param {Ed25519Keypair} keypair - The keypair for signing
   * @param {string} factoryId - The factory ID
   * @param {string} poolId - The pool ID
   * @param {string} coinTypeIn - Input coin type
   * @param {string} coinTypeOut - Output coin type
   * @param {string} coinInObjectId - Input coin object ID
   * @param {string|number} amountOutMin - Minimum output amount
   * @param {string|number} deadline - Transaction deadline timestamp (optional, defaults to current epoch + 10)
   * @returns {Promise<Object>} Transaction result
   */
  async swapExactInput(
    keypair,
    factoryId,
    poolId,
    coinTypeIn,
    coinTypeOut,
    coinInObjectId,
    amountOutMin,
    deadline = null
  ) {
    try {
      // Use current epoch + 10 as deadline if not specified
      if (deadline === null) {
        const currentEpoch = await this.getCurrentEpoch();
        deadline = currentEpoch + 10;
      }
      
      const address = keypair.getPublicKey().toSuiAddress();
      
      // Special handling for SUI as input coin
      if (coinTypeIn === this.SUI_TYPE) {
        // Get all SUI coins for this address
        const coins = await this.getCoins(address);
        
        if (coins.length === 0) {
          throw new Error('No SUI coins found in wallet');
        }
        
        // If we have only one coin that's used for both input and gas, split it
        if (coins.length === 1 && coinInObjectId === coins[0].coinObjectId) {
          console.log(`Only one SUI coin found (${coinInObjectId}). Will attempt to split for gas payment...`);
          
          // Make sure the coin has enough balance
          const coinBalance = parseInt(coins[0].balance);
          const requiredAmount = parseInt(amountOutMin) + this.GAS_BUDGET;
          
          if (coinBalance <= requiredAmount) {
            throw new Error(`Insufficient balance: ${coinBalance} is not enough for swap (${amountOutMin}) and gas (${this.GAS_BUDGET})`);
          }
          
          try {
            // Get the swap amount - assume half of the coin balance minus gas budget
            const swapAmount = Math.floor((coinBalance - this.GAS_BUDGET) / 2);
            
            // Split the coin to create a new one for the swap input
            const newCoinId = await this.splitCoin(keypair, coinInObjectId, swapAmount);
            console.log(`Successfully split coin. Using ${newCoinId} for swap input and original coin for gas.`);
            
            // Recurse with the new coin ID
            return this.swapExactInput(
              keypair,
              factoryId,
              poolId,
              coinTypeIn,
              coinTypeOut,
              newCoinId,
              amountOutMin,
              deadline
            );
          } catch (splitError) {
            throw new Error(`Failed to split coin for swap: ${splitError.message}`);
          }
        }
      }
      
      const tx = new TransactionBlock();
      
      tx.setGasBudget(this.GAS_BUDGET);
      
      // Handle gas payment if using SUI as input
      if (coinTypeIn === this.SUI_TYPE) {
        const coins = await this.getCoins(address);
        const gasCoin = coins.find(coin => 
          coin.coinObjectId !== coinInObjectId && 
          parseInt(coin.balance) >= this.GAS_BUDGET
        );
        
        if (gasCoin) {
          console.log(`Setting explicit gas payment with coin: ${gasCoin.coinObjectId}`);
          tx.setGasPayment([tx.object(gasCoin.coinObjectId)]);
        }
      }
      
      tx.moveCall({
        target: `${this.packageId}::${this.MODULE_ROUTER}::swap_exact_input`,
        typeArguments: [coinTypeIn, coinTypeOut],
        arguments: [
          tx.object(factoryId),
          tx.object(poolId),
          tx.object(coinInObjectId),
          tx.pure(amountOutMin),
          tx.pure(deadline),
        ],
      });
      
      const result = await this.client.signAndExecuteTransactionBlock({ 
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true }
      });
      
      return result;
    } catch (error) {
      console.error('Error swapping tokens:', error);
      throw error;
    }
  }
  
  /**
   * Remove liquidity from a pool
   * @param {Ed25519Keypair} keypair - The keypair for signing
   * @param {string} factoryId - The factory ID
   * @param {string} poolId - The pool ID
   * @param {string} coinTypeA - First coin type
   * @param {string} coinTypeB - Second coin type
   * @param {string} lpCoinId - LP token coin ID
   * @param {string|number} amountAMin - Minimum amount of coin A
   * @param {string|number} amountBMin - Minimum amount of coin B
   * @param {string|number} deadline - Transaction deadline timestamp (optional, defaults to current epoch + 10)
   * @returns {Promise<Object>} Transaction result
   */
  async removeLiquidity(
    keypair,
    factoryId,
    poolId,
    coinTypeA,
    coinTypeB,
    lpCoinId,
    amountAMin,
    amountBMin,
    deadline = null
  ) {
    try {
      // Use current epoch + 10 as deadline if not specified
      if (deadline === null) {
        const currentEpoch = await this.getCurrentEpoch();
        deadline = currentEpoch + 10;
      }
      
      const address = keypair.getPublicKey().toSuiAddress();
      
      // Make sure we have a gas coin
      const gasCoin = await this.getGasCoin(address);
      if (!gasCoin) {
        throw new Error('No suitable gas coin found');
      }
      
      const tx = new TransactionBlock();
      
      tx.setGasBudget(this.GAS_BUDGET);
      
      // Set explicit gas payment
      if (gasCoin) {
        tx.setGasPayment([tx.object(gasCoin)]);
      }
      
      tx.moveCall({
        target: `${this.packageId}::${this.MODULE_ROUTER}::remove_liquidity`,
        typeArguments: [coinTypeA, coinTypeB],
        arguments: [
          tx.object(factoryId),
          tx.object(poolId),
          tx.object(lpCoinId),
          tx.pure(amountAMin),
          tx.pure(amountBMin),
          tx.pure(deadline),
        ],
      });
      
      const result = await this.client.signAndExecuteTransactionBlock({ 
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true }
      });
      
      return result;
    } catch (error) {
      console.error('Error removing liquidity:', error);
      throw error;
    }
  }
  
  /**
   * Get pool information
   * @param {string} poolId - The pool ID
   * @returns {Promise<Object>} Pool information
   */
  async getPoolInfo(poolId) {
    try {
      const poolInfo = await this.client.getObject({
        id: poolId,
        options: { showContent: true, showDisplay: true }
      });
      
      return poolInfo;
    } catch (error) {
      console.error('Error getting pool information:', error);
      throw error;
    }
  }
  
  /**
   * Get factory information
   * @param {string} factoryId - The factory ID
   * @returns {Promise<Object>} Factory information
   */
  async getFactoryInfo(factoryId) {
    try {
      const factoryInfo = await this.client.getObject({
        id: factoryId,
        options: { showContent: true }
      });
      
      return factoryInfo;
    } catch (error) {
      console.error('Error getting factory information:', error);
      throw error;
    }
  }
}

// Export the SDK class
module.exports = SuiDexSDK; 