module suidex::factory {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::transfer;
    use sui::event;
    use std::type_name::{Self, TypeName};
    use std::vector;
    use std::bcs;
    use suidex::pool;

    // Error codes
    const EPoolExists: u64 = 0;

    /// Pool registry that tracks all pairs
    struct DexFactory has key {
        id: UID,
        /// Mapping of token pair identifier to pool address
        pools: Table<vector<u8>, address>,
        /// Number of pools created
        pool_count: u64,
        /// Owner of the factory
        owner: address
    }

    /// Event emitted when factory is created
    struct FactoryCreated has copy, drop {
        factory_id: address,
        owner: address
    }

    /// Event emitted when a new pool is created
    struct PoolRegistered has copy, drop {
        token_a: vector<u8>,
        token_b: vector<u8>,
        pool_address: address
    }

    /// Create a new factory
    public fun create_factory(ctx: &mut TxContext) {
        let factory = DexFactory {
            id: object::new(ctx),
            pools: table::new(ctx),
            pool_count: 0,
            owner: tx_context::sender(ctx)
        };
        
        let factory_address = object::id_address(&factory);
        event::emit(FactoryCreated {
            factory_id: factory_address,
            owner: tx_context::sender(ctx)
        });
        
        transfer::share_object(factory);
    }

    /// Create a new trading pair pool
    public fun create_pool<CoinTypeA, CoinTypeB>(
        factory: &mut DexFactory,
        ctx: &mut TxContext
    ) {
        // Ensure token types are ordered correctly
        let type_a = type_name::get<CoinTypeA>();
        let type_b = type_name::get<CoinTypeB>();
        
        // Order the types based on their BCS-serialized representations
        let (type_a_bytes, type_b_bytes) = ensure_ordered_types(type_a, type_b);
        
        // Make sure pool doesn't already exist
        let pool_key = get_pool_key(&type_a_bytes, &type_b_bytes);
        assert!(!table::contains(&factory.pools, pool_key), EPoolExists);
        
        // Create the pool (internally handles ordering)
        pool::create_pool<CoinTypeA, CoinTypeB>(ctx);
        
        // Get the newly created pool's address (this would require an event listener in practice)
        // For now, we'll use a placeholder approach - in a real implementation, we'd capture the
        // pool address from an event emitted by pool::create_pool
        factory.pool_count = factory.pool_count + 1;
        
        // Emit event for pool registration
        event::emit(PoolRegistered {
            token_a: type_a_bytes,
            token_b: type_b_bytes,
            pool_address: @0x0 // This is a placeholder - in a real implementation, we'd get the actual pool address
        });
    }

    /// Get the address of a pool for a token pair
    public fun get_pool<CoinTypeA, CoinTypeB>(factory: &DexFactory): (bool, address) {
        let type_a = type_name::get<CoinTypeA>();
        let type_b = type_name::get<CoinTypeB>();
        
        // Order the types based on their BCS-serialized representations
        let (type_a_bytes, type_b_bytes) = ensure_ordered_types(type_a, type_b);
        
        let pool_key = get_pool_key(&type_a_bytes, &type_b_bytes);
        
        if (table::contains(&factory.pools, pool_key)) {
            (true, *table::borrow(&factory.pools, pool_key))
        } else {
            (false, @0x0)
        }
    }

    /// Check if a pool exists for a token pair
    public fun pool_exists<CoinTypeA, CoinTypeB>(factory: &DexFactory): bool {
        let (exists, _) = get_pool<CoinTypeA, CoinTypeB>(factory);
        exists
    }

    /// Register a pool in the factory - internal function called by event handler
    /// In a real-world implementation, this would be called by a system that listens
    /// for PoolCreated events from the pool module
    public fun register_pool(
        factory: &mut DexFactory,
        token_a: TypeName,
        token_b: TypeName,
        pool_address: address
    ) {
        // Order the types based on their BCS-serialized representations
        let type_a_bytes = bcs::to_bytes(&token_a);
        let type_b_bytes = bcs::to_bytes(&token_b);
        let (ordered_a, ordered_b) = if (compare_bytes(&type_a_bytes, &type_b_bytes) < 0) {
            (type_a_bytes, type_b_bytes)
        } else {
            (type_b_bytes, type_a_bytes)
        };
        
        let pool_key = get_pool_key(&ordered_a, &ordered_b);
        table::add(&mut factory.pools, pool_key, pool_address);
    }

    /// Create a unique key for pool lookups by concatenating the BCS representations
    fun get_pool_key(type_a_bytes: &vector<u8>, type_b_bytes: &vector<u8>): vector<u8> {
        let key = *type_a_bytes;
        vector::append(&mut key, *type_b_bytes);
        key
    }

    /// Compare two byte vectors lexicographically
    fun compare_bytes(a: &vector<u8>, b: &vector<u8>): u8 {
        let a_length = vector::length(a);
        let b_length = vector::length(b);
        let idx = 0;
        
        while (idx < a_length && idx < b_length) {
            let a_byte = *vector::borrow(a, idx);
            let b_byte = *vector::borrow(b, idx);
            
            if (a_byte < b_byte) return 0; // a < b
            if (a_byte > b_byte) return 2; // a > b
            
            idx = idx + 1;
        };
        
        if (a_length < b_length) return 0; // a < b
        if (a_length > b_length) return 2; // a > b
        
        1 // a == b
    }

    /// Helper function to ensure type ordering based on BCS serialization
    fun ensure_ordered_types(type_a: TypeName, type_b: TypeName): (vector<u8>, vector<u8>) {
        let type_a_bytes = bcs::to_bytes(&type_a);
        let type_b_bytes = bcs::to_bytes(&type_b);
        
        if (compare_bytes(&type_a_bytes, &type_b_bytes) < 2) {
            (type_a_bytes, type_b_bytes)
        } else {
            (type_b_bytes, type_a_bytes)
        }
    }

    /// Get the total number of pools
    public fun pool_count(factory: &DexFactory): u64 {
        factory.pool_count
    }
} 