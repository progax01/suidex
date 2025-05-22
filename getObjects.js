import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";

const client = new SuiClient({
    url: getFullnodeUrl('testnet'),
});

/**
 * Find LP tokens for a specific pair of coin types and return tokenA, tokenB, and objectId
 * @param {string} coinTypeA - First coin type to search for
 * @param {string} coinTypeB - Second coin type to search for
 * @param {string} ownerAddress - The wallet address to search within
 * @param {string} [packageId] - Optional package ID to filter by
 * @returns {Promise<Array>} - Array of objects containing tokenA, tokenB, and objectId
 */
async function getLPTokensByPair(coinTypeA, coinTypeB, ownerAddress, packageId = null) {
    let matchingLPTokens = [];
    let hasNextPage = true;
    let cursor = null;
    
    while (hasNextPage) {
        try {
            const objects = await client.getOwnedObjects({
                owner: ownerAddress,
                cursor: cursor,
                options: { showContent: true, showType: true }
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
                    return (tokenPair[0] === coinTypeA && tokenPair[1] === coinTypeB) || 
                           (tokenPair[0] === coinTypeB && tokenPair[1] === coinTypeA);
                }
                
                return false;
            });
            
            matchingLPTokens = [...matchingLPTokens, ...lpTokensInPage];
            
            hasNextPage = objects.hasNextPage;
            cursor = objects.nextCursor;
        } catch (error) {
            console.error("Error fetching page:", error);
            break;
        }
    }
    
    // Extract only tokenA, tokenB, and objectId
    const tokenPairs = matchingLPTokens.map(token => {
        const typeMatch = token.data.type.match(/LP<(.+?)>/);
        if (typeMatch && typeMatch[1]) {
            const [tokenA, tokenB] = typeMatch[1].split(', ');
            return {
                tokenA,
                tokenB,
                objectId: token.data.objectId
            };
        }
        return null;
    }).filter(pair => pair !== null);
    
    return tokenPairs;
}

// Example usage
async function runExample() {
    const ownerAddress = "0x13aa2d91c2372ef39151af009b74669f2faa2ddd64c5c3b213d5aa63a307c219";
    const packageId = "0x56a79f74ddcf35a7a9130166d694f4898193ebfcbee23ba124db75bdafa929bf";
    
    // Define the two coin types to search for
    const coinTypeA = "0x047785d2c6e186bd1b2f19707b68bde7a95929253f79882edf3a4061eae63746::token::TOKEN";
    const coinTypeB = "0xc1f9abae404c59b857dc805f399d71f013897d7fb774b08113b6d882a0d43e77::token::TOKEN";
    
    // Find LP tokens for the specific pair
    const result = await getLPTokensByPair(coinTypeA, coinTypeB, ownerAddress, packageId);
    
    console.log("LP Tokens for Exact Pair:");
    result.forEach((pair, index) => {
        console.log(`[${index + 1}] Token A: ${pair.tokenA}`);
        console.log(`      Token B: ${pair.tokenB}`);
        console.log(`      Object ID: $a{pair.objectId}`);
    });
}

// Run the example
runExample();