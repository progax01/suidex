// sui-types.js - Utilities for working with Sui Move types in JavaScript
const { bcs } = require('@mysten/sui.js/bcs');

/**
 * Encode a TypeName for use in Move calls
 * This is a simplified implementation - a more complete version would handle full
 * type serialization according to the Move type system
 * 
 * @param {string} typeName - The fully qualified type name (e.g., '0x2::sui::SUI')
 * @returns {Uint8Array} BCS encoded TypeName
 */
function   encodeTypeName(typeName) {
  // Simplified implementation - in a real app you'd need to properly handle
  // struct TypeName { address: address, module: string, name: string }
  const [address, module, name] = parseTypeNameString(typeName);
  
  return bcs.ser('TypeName', {
    address,
    module,
    name
  }).toBytes();
}

/**
 * Parse a type name string into its components
 * 
 * @param {string} typeNameStr - Type name string in format '0x123::module::Name'
 * @returns {Object} Object with address, module, and name components
 */
function parseTypeNameString(typeNameStr) {
  const parts = typeNameStr.split('::');
  if (parts.length !== 3) {
    throw new Error(`Invalid type name format: ${typeNameStr}. Expected format: 0x123::module::Name`);
  }
  
  return {
    address: parts[0],
    module: parts[1],
    name: parts[2]
  };
}

/**
 * Generates a unique pool key from two coin types
 * This should match the logic in the Move contract
 * 
 * @param {string} coinTypeA - First coin type
 * @param {string} coinTypeB - Second coin type
 * @returns {string} Hex string of the pool key
 */
function generatePoolKey(coinTypeA, coinTypeB) {
  // Encode types as BCS
  const typeABytes = encodeTypeName(coinTypeA);
  const typeBBytes = encodeTypeName(coinTypeB);
  
  // Order types based on BCS serialization (simplified)
  let firstType, secondType;
  if (compareBytes(typeABytes, typeBBytes) < 0) {
    firstType = typeABytes;
    secondType = typeBBytes;
  } else {
    firstType = typeBBytes;
    secondType = typeABytes;
  }
  
  // Concatenate bytes
  const key = new Uint8Array(firstType.length + secondType.length);
  key.set(firstType);
  key.set(secondType, firstType.length);
  
  // Convert to hex string
  return Array.from(key)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compare two byte arrays lexicographically
 * This should match the logic in the Move contract
 * 
 * @param {Uint8Array} a - First byte array
 * @param {Uint8Array} b - Second byte array
 * @returns {number} -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareBytes(a, b) {
  const length = Math.min(a.length, b.length);
  
  for (let i = 0; i < length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  
  return 0;
}

/**
 * Parse BCS-encoded return values from Sui transactions
 * 
 * @param {Array} returnValues - Return values from the transaction
 * @param {Array} types - Array of BCS types to decode
 * @returns {Array} Decoded values
 */
function parseReturnValues(returnValues, types) {
  if (!returnValues || returnValues.length === 0) {
    return [];
  }
  
  try {
    return types.map((type, index) => {
      if (returnValues[0] && returnValues[0][index]) {
        return bcs.de(type, returnValues[0][index]);
      }
      return null;
    });
  } catch (error) {
    console.error('Failed to parse return values:', error);
    return [];
  }
}

module.exports = {
  encodeTypeName,
  generatePoolKey,
  parseReturnValues
}; 