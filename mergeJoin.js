import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { fromB64, fromHEX } from "@mysten/sui.js/utils";

// Initialize Sui client
const client = new SuiClient({
    url: getFullnodeUrl('testnet'),
});

// Configuration - Replace these with command line arguments later
const privateKeyWithPrefix = "suiprivkey1qp9nqvy44tysxv02cdqnu53e9aujkxjmdyywavd86wy3axj3yu4kk26y87m";
const ownerAddress = "0x13aa2d91c2372ef39151af009b74669f2faa2ddd64c5c3b213d5aa63a307c219";
const packageId = "0x56a79f74ddcf35a7a9130166d694f4898193ebfcbee23ba124db75bdafa929bf";
const coinTypeA = "0x047785d2c6e186bd1b2f19707b68bde7a95929253f79882edf3a4061eae63746::token::TOKEN";
const coinTypeB = "0xc1f9abae404c59b857dc805f399d71f013897d7fb774b08113b6d882a0d43e77::token::TOKEN";
const requestedLpAmount = "1000"; // Amount requested for operation - will check against available

// Create keypair from private key
let keypair;
try {
    // Extract the base64 part from the suiprivkey format
    const privateKeyB64 = privateKeyWithPrefix.replace(/^suiprivkey1/, '');
    // Create keypair from the private key
    keypair = Ed25519Keypair.fromSecretKey(fromB64(privateKeyB64));
    console.log("Using provided private key. Address:", keypair.toSuiAddress());
} catch (error) {
    console.error("Failed to create keypair from provided private key:", error);
    console.log("Falling back to test keypair for development...");
    
    // For testing purposes, create a new keypair if we can't decode the provided one
    keypair = new Ed25519Keypair();
    console.log("Created test keypair for development. Address:", keypair.toSuiAddress());
    console.log("WARNING: Using a test keypair, not your actual key!");
}

/**
 * Find all LP tokens for a specific pair of coin types
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} ownerAddress - Wallet address
 * @param {string} [packageId] - Optional package ID filter
 * @returns {Promise<Array>} - Array of LP token objects
 */
async function getAllLPTokens(coinTypeA, coinTypeB, ownerAddress, packageId = null) {
    console.log(`Searching for LP tokens with pair: ${coinTypeA} and ${coinTypeB}`);
    
    let lpTokens = [];
    let cursor = null;
    let hasNextPage = true;
    
    while (hasNextPage) {
        try {
            const response = await client.getOwnedObjects({
                owner: ownerAddress,
                cursor: cursor,
                options: { showContent: true, showType: true }
            });
            
            // Filter for LP tokens matching our token pair
            const matchingTokens = response.data.filter(obj => {
                // Check if object has type and it includes "lp_token::lp"
                if (!obj.data.type || !obj.data.type.toLowerCase().includes("lp_token::lp")) {
                    return false;
                }
                
                // Filter by package ID if provided
                if (packageId && !obj.data.type.startsWith(packageId)) {
                    return false;
                }
                
                // Extract token pair from LP<TokenA, TokenB> format
                const typeMatch = obj.data.type.match(/LP<(.+?)>/);
                if (!typeMatch || !typeMatch[1]) return false;
                
                const tokenPair = typeMatch[1].split(', ');
                
                // Check if pair matches our target tokens (in either order)
                return (tokenPair[0] === coinTypeA && tokenPair[1] === coinTypeB) || 
                       (tokenPair[0] === coinTypeB && tokenPair[1] === coinTypeA);
            });
            
            // Parse LP token data
            const parsedTokens = matchingTokens.map(token => {
                const typeMatch = token.data.type.match(/LP<(.+?)>/);
                if (!typeMatch || !typeMatch[1]) return null;
                
                const [tokenA, tokenB] = typeMatch[1].split(', ');
                const balance = token.data.content?.fields?.balance 
                    ? BigInt(token.data.content.fields.balance) 
                    : BigInt(0);
                
                return {
                    tokenA,
                    tokenB,
                    objectId: token.data.objectId,
                    balance
                };
            }).filter(t => t !== null);
            
            lpTokens = [...lpTokens, ...parsedTokens];
            
            // Update pagination
            hasNextPage = response.hasNextPage;
            cursor = response.nextCursor;
        } catch (error) {
            console.error("Error fetching LP tokens:", error);
            break;
        }
    }
    
    console.log(`Found ${lpTokens.length} LP tokens for the specified pair`);
    
    // Sort tokens by balance (ascending)
    return lpTokens.sort((a, b) => a.balance > b.balance ? 1 : -1);
}

/**
 * Find the optimal set of LP tokens to use for the requested amount
 * @param {Array} lpTokens - Array of LP token objects
 * @param {BigInt} requestedAmount - Requested LP token amount
 * @returns {Object} - Result with tokens to use and strategy
 */
function findOptimalLPTokens(lpTokens, requestedAmount) {
    if (lpTokens.length === 0) {
        return { success: false, reason: "No LP tokens found" };
    }
    
    // Calculate total available balance
    const totalBalance = lpTokens.reduce((sum, token) => sum + token.balance, BigInt(0));
    console.log(`Total available LP balance: ${totalBalance}`);
    
    if (totalBalance < requestedAmount) {
        console.log(`Requested amount (${requestedAmount}) exceeds available balance (${totalBalance})`);
        console.log(`Will use maximum available: ${totalBalance}`);
        return { 
            success: true, 
            useAllTokens: true, 
            tokensToUse: lpTokens,
            totalAmount: totalBalance,
            needsSplit: false,
            needsMerge: lpTokens.length > 1
        };
    }
    
    // Case 1: We have a single LP token with the exact amount
    const exactToken = lpTokens.find(token => token.balance === requestedAmount);
    if (exactToken) {
        console.log(`Found LP token with exact amount: ${exactToken.objectId}`);
        return {
            success: true,
            useAllTokens: false,
            tokensToUse: [exactToken],
            totalAmount: requestedAmount,
            needsSplit: false,
            needsMerge: false
        };
    }
    
    // Case 2: We have a single LP token with more than requested amount
    const largerToken = lpTokens.find(token => token.balance > requestedAmount);
    if (largerToken) {
        console.log(`Found LP token with larger amount: ${largerToken.objectId} (${largerToken.balance})`);
        return {
            success: true,
            useAllTokens: false,
            tokensToUse: [largerToken],
            totalAmount: requestedAmount,
            needsSplit: true,
            splitAmount: requestedAmount,
            sourceToken: largerToken,
            needsMerge: false
        };
    }
    
    // Case 3: We need to combine multiple tokens
    // Sort tokens by balance (smallest first)
    const sortedTokens = [...lpTokens].sort((a, b) => a.balance > b.balance ? 1 : -1);
    
    // Strategy: Greedy combination starting with smallest tokens
    let currentSum = BigInt(0);
    const tokensToUse = [];
    
    for (const token of sortedTokens) {
        tokensToUse.push(token);
        currentSum += token.balance;
        
        if (currentSum >= requestedAmount) {
            break;
        }
    }
    
    console.log(`Need to merge ${tokensToUse.length} tokens to reach or exceed requested amount`);
    
    // Determine if we need to split after merging
    const needsSplit = currentSum > requestedAmount;
    
    return {
        success: true,
        useAllTokens: currentSum === requestedAmount,
        tokensToUse,
        totalAmount: currentSum,
        needsMerge: tokensToUse.length > 1,
        needsSplit,
        splitAmount: requestedAmount
    };
}

/**
 * Merge multiple LP tokens into one
 * @param {Array} lpTokens - Array of LP token objects to merge
 * @param {string} packageId - Package ID
 * @returns {Promise<string|null>} - Object ID of merged token or null
 */
async function mergeLPTokens(lpTokens, packageId) {
    if (lpTokens.length < 2) {
        console.log("At least two LP tokens are required for merging");
        return lpTokens[0]?.objectId || null;
    }
    
    console.log(`Merging ${lpTokens.length} LP tokens...`);
    
    try {
        const tx = new TransactionBlock();
        
        // Get first LP token as the primary one
        const primaryLpToken = tx.object(lpTokens[0].objectId);
        
        // Join all other LP tokens into the primary one
        for (let i = 1; i < lpTokens.length; i++) {
            const secondaryLpToken = tx.object(lpTokens[i].objectId);
            
            tx.moveCall({
                target: `${packageId}::lp_token::join`,
                arguments: [primaryLpToken, secondaryLpToken],
                typeArguments: [lpTokens[0].tokenA, lpTokens[0].tokenB]
            });
        }
        
        // Execute transaction
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            signer: keypair,
            options: { showEffects: true }
        });
        
        // Check transaction status
        const status = result.effects?.status?.status;
        if (status !== "success") {
            console.error("Merge transaction failed:", result.effects?.status);
            return null;
        }
        
        console.log(`Successfully merged LP tokens into: ${lpTokens[0].objectId}`);
        return lpTokens[0].objectId;
    } catch (error) {
        console.error("Error during LP token merge:", error);
        return null;
    }
}

/**
 * Split an LP token into two pieces
 * @param {Object} lpToken - LP token object to split
 * @param {BigInt} splitAmount - Amount to split off
 * @param {string} packageId - Package ID
 * @returns {Promise<string|null>} - Object ID of new LP token or null
 */
async function splitLPToken(lpToken, splitAmount, packageId) {
    console.log(`Splitting LP token ${lpToken.objectId} to extract ${splitAmount} units`);
    
    try {
        const tx = new TransactionBlock();
        
        // Get reference to the LP token object
        const lpObject = tx.object(lpToken.objectId);
        
        // Call the split function to create a new LP token
        const newLpToken = tx.moveCall({
            target: `${packageId}::lp_token::split`,
            arguments: [lpObject, tx.pure(splitAmount.toString())],
            typeArguments: [lpToken.tokenA, lpToken.tokenB]
        });
        
        // Transfer the new LP token back to the owner
        tx.transferObjects([newLpToken], tx.pure(ownerAddress));
        
        // Execute transaction
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            signer: keypair,
            options: { showEffects: true, showObjectChanges: true }
        });
        
        // Check transaction status
        const status = result.effects?.status?.status;
        if (status !== "success") {
            console.error("Split transaction failed:", result.effects?.status);
            return null;
        }
        
        // Find the newly created LP token object
        const newObjectId = result.objectChanges
            ?.find(change => 
                change.type === "created" && 
                change.objectType.includes(`LP<${lpToken.tokenA}, ${lpToken.tokenB}>`)
            )?.objectId;
        
        if (!newObjectId) {
            console.error("Failed to locate the new LP token object ID");
            return null;
        }
        
        console.log(`Successfully split LP token. New object ID: ${newObjectId}`);
        return newObjectId;
    } catch (error) {
        console.error("Error during LP token split:", error);
        return null;
    }
}

/**
 * Process LP tokens to achieve the requested amount using optimal strategy
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @param {string} ownerAddress - Owner wallet address
 * @param {string|number|BigInt} requestedAmount - Requested LP amount
 * @param {string} packageId - Package ID
 * @returns {Promise<string|null>} - Object ID of the resulting LP token
 */
async function processLPTokens(coinTypeA, coinTypeB, ownerAddress, requestedAmount, packageId) {
    // Convert requested amount to BigInt
    const requestedAmountBigInt = BigInt(requestedAmount);
    console.log(`Processing request for ${requestedAmountBigInt} LP tokens`);
    
    // Step 1: Get all LP tokens for the specified pair
    const lpTokens = await getAllLPTokens(coinTypeA, coinTypeB, ownerAddress, packageId);
    if (lpTokens.length === 0) {
        console.error("No LP tokens found for the specified pair");
        return null;
    }
    
    console.log("Found LP tokens:", lpTokens);
    
    // Step 2: Find optimal tokens to use for the requested amount
    const strategy = findOptimalLPTokens(lpTokens, requestedAmountBigInt);
    if (!strategy.success) {
        console.error("Failed to determine strategy:", strategy.reason);
        return null;
    }
    
    // Step 3: Execute the strategy
    let resultObjectId = null;
    
    // Step 3a: Merge tokens if needed
    if (strategy.needsMerge) {
        console.log(`Strategy requires merging ${strategy.tokensToUse.length} tokens`);
        resultObjectId = await mergeLPTokens(strategy.tokensToUse, packageId);
        if (!resultObjectId) {
            console.error("Failed to merge LP tokens");
            return null;
        }
    } else {
        // Use the single token
        resultObjectId = strategy.tokensToUse[0].objectId;
    }
    
    // Step 3b: Split token if needed
    if (strategy.needsSplit) {
        console.log(`Strategy requires splitting to get ${strategy.splitAmount} tokens`);
        
        // If we merged tokens, we need fresh token info
        let tokenToSplit;
        if (strategy.needsMerge) {
            // Fetch the updated token info after merging
            const updatedTokens = await getAllLPTokens(coinTypeA, coinTypeB, ownerAddress, packageId);
            tokenToSplit = updatedTokens.find(t => t.objectId === resultObjectId);
            if (!tokenToSplit) {
                console.error("Failed to find merged token for splitting");
                return null;
            }
        } else {
            // Use the source token directly
            tokenToSplit = strategy.sourceToken || strategy.tokensToUse[0];
        }
        
        resultObjectId = await splitLPToken(tokenToSplit, strategy.splitAmount, packageId);
        if (!resultObjectId) {
            console.error("Failed to split LP token");
            return null;
        }
    }
    
    // Step 4: Return the final LP token object ID
    return resultObjectId;
}

/**
 * Check if the wallet has SUI for gas fees
 * @param {string} address - Wallet address to check
 * @returns {Promise<boolean>} - True if the wallet has SUI tokens
 */
async function checkSuiBalance(address) {
    try {
        const balance = await client.getBalance({
            owner: address
        });
        
        console.log(`SUI balance: ${balance.totalBalance}`);
        return BigInt(balance.totalBalance) > 0;
    } catch (error) {
        console.error("Error checking SUI balance:", error);
        return false;
    }
}

/**
 * Main function to run the example
 */
async function main() {
    try {
        // Check if the wallet has SUI for gas fees
        const walletAddress = keypair.toSuiAddress();
        const hasSui = await checkSuiBalance(walletAddress);
        
        if (!hasSui) {
            console.error(`ERROR: Wallet ${walletAddress} has no SUI tokens for gas fees!`);
            console.error(`Please send some SUI tokens to this address for transaction fees.`);
            process.exit(1);
        }
        
        console.log(`Processing LP tokens for token pair:`);
        console.log(`- Token A: ${coinTypeA}`);
        console.log(`- Token B: ${coinTypeB}`);
        console.log(`- Owner address: ${ownerAddress}`);
        console.log(`- Requested amount: ${requestedLpAmount}`);
        
        const resultObjectId = await processLPTokens(
            coinTypeA, 
            coinTypeB, 
            ownerAddress, 
            requestedLpAmount, 
            packageId
        );
        
        if (resultObjectId) {
            console.log("\n========== SUCCESS ==========");
            console.log(`LP token ready for use: ${resultObjectId}`);
            console.log("This token can now be used for removing liquidity or other operations");
        } else {
            console.log("\n========== FAILED ==========");
            console.log("Failed to process LP tokens");
        }
    } catch (error) {
        console.error("Error in main execution:", error);
    }
}

// Execute the main function
main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});