import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";

const client = new SuiClient({
    url: getFullnodeUrl('testnet'),
});

async function getOwnedObjects() {
    try {
        const ownerAddress = "0x13aa2d91c2372ef39151af009b74669f2faa2ddd64c5c3b213d5aa63a307c219";
        
        // Getting objects with more complete details
        const objects = await client.getOwnedObjects({
            owner: ownerAddress,
            options: { showContent: true, showDisplay: true, showType: true }
        });
        
        // Processing and displaying the objects in detail
        console.log("Total objects:", objects.data.length);
        console.log("Has next page:", objects.hasNextPage);
        
        if (objects.data.length > 0) {
            console.log("\nObject details:");
            objects.data.forEach((obj, index) => {
                const objectData = obj.data;
                console.log(`\n[${index + 1}] Object ID: ${objectData.objectId}`);
                console.log(`    Type: ${objectData.type || 'Not available'}`);
                console.log(`    Version: ${objectData.version}`);
                console.log(`    Digest: ${objectData.digest}`);
                
                // If we have content details
                if (objectData.content) {
                    console.log("    Content:");
                    console.log("      Type:", objectData.content.dataType);
                    
                    if (objectData.content.fields) {
                        console.log("      Fields:", JSON.stringify(objectData.content.fields, null, 2).slice(0, 200) + "...");
                    }
                }
                
                // If we have display details
                if (objectData.display && objectData.display.data) {
                    console.log("    Display:", JSON.stringify(objectData.display.data, null, 2).slice(0, 200) + "...");
                }
            });
        }
        
        return objects;
    } catch (error) {
        console.error("Error fetching objects:", error);
    }
}

// Execute the function
getOwnedObjects();