import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";

const client = new SuiClient({
    url: getFullnodeUrl('testnet'),
});

/**
 * Find LP tokens containing a specific pair of coin types and calculate total LP balance
 * @param {string} coinTypeA - First coin type to search for
 * @param {string} coinTypeB - Second coin type to search for
 * @param {string} ownerAddress - The wallet address to search within
 * @param {string} [packageId] - Optional package ID to filter by
 * @returns {Promise<Object>} - Results containing matching LP tokens and total balance
 */
async function getLPTokensByPair(coinTypeA, coinTypeB, ownerAddress, packageId = null) {
    let matchingLPTokens = [];
    let hasNextPage = true;
    let cursor = null;
    let totalLPBalance = BigInt(0); // Initialize as BigInt
    
    console.log(`Searching for LP tokens with pair: ${coinTypeA} and ${coinTypeB}`);
    console.log(`Owner address: ${ownerAddress}`);
    if (packageId) {
        console.log(`Filtering by package ID: ${packageId}`);
    }
    
    while (hasNextPage) {
        try {
            const objects = await client.getOwnedObjects({
                owner: ownerAddress,
                cursor: cursor,
                options: { showContent: true, showDisplay: true, showType: true }
            });
            
            // Filter for LP tokens that contain both specified coin types
            const lpTokensInPage = objects.data.filter(obj => {
                if (!obj.data.type || !obj.data.type.toLowerCase().includes("lp_token::lp")) {
                    return false;
                }
                
                // If packageId is specified, check if the token is from that package
                if (packageId && !obj.data.type.startsWith(packageId)) {
                    return false;
                }
                
                // Extract token pair information from the type string
                const typeMatch = obj.data.type.match(/LP<(.+?)>/);
                if (typeMatch && typeMatch[1]) {
                    const tokenPair = typeMatch[1].split(', ');
                    
                    // Check if the token pair matches our specified coins (in any order)
                    return (tokenPair[0] === coinTypeA && tokenPair[1] === coinTypeB) || 
                           (tokenPair[0] === coinTypeB && tokenPair[1] === coinTypeA);
                }
                
                return false;
            });
            
            matchingLPTokens = [...matchingLPTokens, ...lpTokensInPage];
            
            console.log(`Found ${lpTokensInPage.length} matching LP tokens in current page`);
            
            hasNextPage = objects.hasNextPage;
            cursor = objects.nextCursor;
            
            if (hasNextPage) {
                console.log(`Moving to next page with cursor: ${cursor}`);
            }
        } catch (error) {
            console.error("Error fetching page:", error);
            break;
        }
    }
    
    console.log(`\nTotal LP tokens found for pair (${coinTypeA}, ${coinTypeB}): ${matchingLPTokens.length}`);
    
    // Display the filtered LP tokens and calculate total balance
    if (matchingLPTokens.length > 0) {
        matchingLPTokens.forEach((token, index) => {
            const objectData = token.data;
            console.log(`\n[${index + 1}] Object ID: ${objectData.objectId}`);
            console.log(`Type: ${objectData.type}`);
            
            // Extract package ID from the type string
            const packageId = objectData.type.split('::')[0];
            console.log(`Package ID: ${packageId}`);
            
            // Extract token pair information from the type string
            const typeMatch = objectData.type.match(/LP<(.+?)>/);
            if (typeMatch && typeMatch[1]) {
                const tokenPair = typeMatch[1].split(', ');
                console.log(`Token A: ${tokenPair[0]}`);
                console.log(`Token B: ${tokenPair[1]}`);
            }
            
            console.log(`Version: ${objectData.version}`);
            
            // Show LP token balance and add to total
            if (objectData.content && objectData.content.fields && objectData.content.fields.balance) {
                const balance = BigInt(objectData.content.fields.balance);
                console.log(`LP Balance: ${balance.toString()}`);
                totalLPBalance += balance;
            }
        });
        
        console.log(`\nTotal LP Balance for all matching LP tokens: ${totalLPBalance.toString()}`);
    } else {
        console.log(`No LP tokens found for pair (${coinTypeA}, ${coinTypeB})`);
    }
    
    return {
        tokens: matchingLPTokens,
        totalBalance: totalLPBalance.toString()
    };
}

/**
 * Find all LP tokens that include either of the specified coin types
 * @param {string} coinTypeA - First coin type to search for
 * @param {string} coinTypeB - Second coin type to search for 
 * @param {string} ownerAddress - The wallet address to search within
 * @param {string} [packageId] - Optional package ID to filter by
 * @returns {Promise<Object>} - Results organized by coin type
 */
async function getAllLPTokensForCoinTypes(coinTypeA, coinTypeB, ownerAddress, packageId = null) {
    let allLPTokens = [];
    let hasNextPage = true;
    let cursor = null;
    
    // Track balances by coin type using BigInt
    const results = {
        [coinTypeA]: {
            tokens: [],
            totalBalance: BigInt(0)
        },
        [coinTypeB]: {
            tokens: [],
            totalBalance: BigInt(0)
        },
        exactPair: {
            tokens: [],
            totalBalance: BigInt(0)
        }
    };
    
    console.log(`Searching for all LP tokens containing either: ${coinTypeA} or ${coinTypeB}`);
    console.log(`Owner address: ${ownerAddress}`);
    if (packageId) {
        console.log(`Filtering by package ID: ${packageId}`);
    }
    
    while (hasNextPage) {
        try {
            const objects = await client.getOwnedObjects({
                owner: ownerAddress,
                cursor: cursor,
                options: { showContent: true, showDisplay: true, showType: true }
            });
            
            // Filter for LP tokens that contain either specified coin type
            const lpTokensInPage = objects.data.filter(obj => {
                if (!obj.data.type || !obj.data.type.toLowerCase().includes("lp_token::lp")) {
                    return false;
                }
                
                // If packageId is specified, check if the token is from that package
                if (packageId && !obj.data.type.startsWith(packageId)) {
                    return false;
                }
                
                // Extract token pair information from the type string
                const typeMatch = obj.data.type.match(/LP<(.+?)>/);
                if (typeMatch && typeMatch[1]) {
                    const tokenPair = typeMatch[1].split(', ');
                    
                    // Check if either token in the pair matches our target coin types
                    return tokenPair[0] === coinTypeA || tokenPair[1] === coinTypeA || 
                           tokenPair[0] === coinTypeB || tokenPair[1] === coinTypeB;
                }
                
                return false;
            });
            
            allLPTokens = [...allLPTokens, ...lpTokensInPage];
            
            console.log(`Found ${lpTokensInPage.length} matching LP tokens in current page`);
            
            hasNextPage = objects.hasNextPage;
            cursor = objects.nextCursor;
            
            if (hasNextPage) {
                console.log(`Moving to next page with cursor: ${cursor}`);
            }
        } catch (error) {
            console.error("Error fetching page:", error);
            break;
        }
    }
    
    console.log(`\nTotal LP tokens found: ${allLPTokens.length}`);
    
    // Process and categorize the LP tokens
    allLPTokens.forEach((token, index) => {
        const objectData = token.data;
        let tokensInPair = [];
        let isExactPair = false;
        
        // Extract token pair information
        const typeMatch = objectData.type.match(/LP<(.+?)>/);
        if (typeMatch && typeMatch[1]) {
            tokensInPair = typeMatch[1].split(', ');
            
            // Check if this is the exact pair we're looking for
            isExactPair = (tokensInPair[0] === coinTypeA && tokensInPair[1] === coinTypeB) || 
                          (tokensInPair[0] === coinTypeB && tokensInPair[1] === coinTypeA);
                          
            // Get LP token balance
            let balance = BigInt(0);
            if (objectData.content && objectData.content.fields && objectData.content.fields.balance) {
                balance = BigInt(objectData.content.fields.balance);
            }
            
            // Add to exact pair results if applicable
            if (isExactPair) {
                results.exactPair.tokens.push(token);
                results.exactPair.totalBalance += balance;
            }
            
            // Add to coinTypeA results if applicable
            if (tokensInPair[0] === coinTypeA || tokensInPair[1] === coinTypeA) {
                results[coinTypeA].tokens.push(token);
                results[coinTypeA].totalBalance += balance;
            }
            
            // Add to coinTypeB results if applicable
            if (tokensInPair[0] === coinTypeB || tokensInPair[1] === coinTypeB) {
                results[coinTypeB].tokens.push(token);
                results[coinTypeB].totalBalance += balance;
            }
        }
    });
    
    // Display summary
    console.log("\n=== SUMMARY ===");
    console.log(`\nLP tokens containing ${coinTypeA}: ${results[coinTypeA].tokens.length}`);
    console.log(`Total LP Balance: ${results[coinTypeA].totalBalance.toString()}`);
    
    console.log(`\nLP tokens containing ${coinTypeB}: ${results[coinTypeB].tokens.length}`);
    console.log(`Total LP Balance: ${results[coinTypeB].totalBalance.toString()}`);
    
    console.log(`\nLP tokens with exact pair (${coinTypeA}, ${coinTypeB}): ${results.exactPair.tokens.length}`);
    console.log(`Total LP Balance: ${results.exactPair.totalBalance.toString()}`);
    
    // Display the detailed list of LP tokens
    console.log("\n=== DETAILED LIST ===");
    allLPTokens.forEach((token, index) => {
        const objectData = token.data;
        console.log(`\n[${index + 1}] Object ID: ${objectData.objectId}`);
        console.log(`Type: ${objectData.type}`);
        
        // Extract package ID from the type string
        const packageId = objectData.type.split('::')[0];
        console.log(`Package ID: ${packageId}`);
        
        // Extract token pair information from the type string
        const typeMatch = objectData.type.match(/LP<(.+?)>/);
        if (typeMatch && typeMatch[1]) {
            const tokenPair = typeMatch[1].split(', ');
            console.log(`Token A: ${tokenPair[0]}`);
            console.log(`Token B: ${tokenPair[1]}`);
            
            // Identify which tokens match our search
            if (tokenPair[0] === coinTypeA || tokenPair[0] === coinTypeB) {
                console.log(`Matched Token: ${tokenPair[0]} (Token A)`);
            }
            if (tokenPair[1] === coinTypeA || tokenPair[1] === coinTypeB) {
                console.log(`Matched Token: ${tokenPair[1]} (Token B)`);
            }
        }
        
        console.log(`Version: ${objectData.version}`);
        
        // Show LP token balance
        if (objectData.content && objectData.content.fields && objectData.content.fields.balance) {
            const balance = objectData.content.fields.balance;
            console.log(`LP Balance: ${balance}`);
        }
    });
    
    // Convert BigInt values to strings for JSON compatibility
    return {
        [coinTypeA]: {
            tokens: results[coinTypeA].tokens,
            totalBalance: results[coinTypeA].totalBalance.toString(),
            count: results[coinTypeA].tokens.length
        },
        [coinTypeB]: {
            tokens: results[coinTypeB].tokens,
            totalBalance: results[coinTypeB].totalBalance.toString(),
            count: results[coinTypeB].tokens.length
        },
        exactPair: {
            tokens: results.exactPair.tokens,
            totalBalance: results.exactPair.totalBalance.toString(),
            count: results.exactPair.tokens.length
        },
        allTokens: allLPTokens
    };
}

// Example usage
async function runExample() {
    const ownerAddress = "0x13aa2d91c2372ef39151af009b74669f2faa2ddd64c5c3b213d5aa63a307c219";
    const packageId = "0x56a79f74ddcf35a7a9130166d694f4898193ebfcbee23ba124db75bdafa929bf";
    
    // Define the two coin types to search for
    const coinTypeA = "0x047785d2c6e186bd1b2f19707b68bde7a95929253f79882edf3a4061eae63746::token::TOKEN";
    const coinTypeB = "0xb70e00b9d85ba8738c74b6e0667d34653853a2a63070165ed487daa61c2651d8::token::TOKEN";
    
    // Find LP tokens where both specific coins are paired together
    console.log("SEARCHING FOR EXACT PAIR:");
    await getLPTokensByPair(coinTypeA, coinTypeB, ownerAddress, packageId);
    
    console.log("\n\n----------------------------------------\n");
    
    // Find ALL LP tokens containing either of the specified coins
    console.log("SEARCHING FOR ALL LP TOKENS WITH EITHER COIN:");
    await getAllLPTokensForCoinTypes(coinTypeA, coinTypeB, ownerAddress, packageId);
}

// Run the example
runExample();