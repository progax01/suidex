// interaction.js - SuiDex SDK for frontend integration
const { SuiClient } = require('@mysten/sui.js/client');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');

// Package ID from publishing the contract
const DEFAULT_PACKAGE_ID = '0x8991b315b7c2d72bfe12fbeb7ca5203db480fbb43658260c0d38051bcf1e6519';

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
function initClient(network = 'devnet', customUrl = null) {
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
 * Add liquidity transaction
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
    const tx = new TransactionBlock();
    
    // Use the provided coin object IDs
    const coinA = tx.object(coinAObjectId);
    const coinB = tx.object(coinBObjectId);

    tx.moveCall({
        target: `${packageId}::${MODULE_ROUTER}::add_liquidity`,
        typeArguments: [coinTypeA, coinTypeB],
        arguments: [
            tx.object(factoryId),
            tx.object(poolId),
            coinA,
            coinB,
            tx.pure(amountAMin),
            tx.pure(amountBMin),
            tx.pure(deadline),
        ],
    });

    return tx;
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
 * @returns {Promise<Object>} Transaction result
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
    
    tx.setGasBudget(GAS_BUDGET);
    const result = await client.signAndExecuteTransactionBlock({ 
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true, showObjectChanges: true }
    });
    return result;
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
    initClient,
    createFactoryTx,
    createFactory,
    createPoolTx,
    createPool,
    getFactory,
    addLiquidityTx,
    addLiquidity,
    swapExactInputTx,
    swapExactInput,
    poolExists,
    getPoolAddress,
    extractSharedObjectId,
    createKeypairFromPrivateKey,
    testCreateFactory,
    testCreatePool,
    testPoolExists,
    // Constants
    DEFAULT_PACKAGE_ID,
    MODULE_FACTORY,
    MODULE_POOL,
    MODULE_ROUTER
};