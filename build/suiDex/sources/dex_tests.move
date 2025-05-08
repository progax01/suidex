#[test_only]
module suidex::dex_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin, TreasuryCap, CoinMetadata};
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use sui::object;
    use std::option;
    use sui::tx_context::{Self, TxContext};
    
    use suidex::factory::{Self, DexFactory};
    use suidex::pool::{Self, Pool};
    use suidex::lp_token::{Self, LP};
    use suidex::router;

    // Test tokens with one-time witness pattern
    struct USDC has drop {}
    
    struct SUI has drop {}

    const ADMIN: address = @0xA11CE;
    const USER1: address = @0xB0B;
    const USER2: address = @0xCAFE;

    const USDC_DECIMALS: u8 = 6;
    const SUI_DECIMALS: u8 = 9;

    // Test initialization of DEX with factory
    #[test]
    fun test_dex_init() {
        let scenario = ts::begin(ADMIN);
        
        // Create the factory
        create_factory(&mut scenario);
        
        // Check that the factory was created and shared
        ts::next_tx(&mut scenario, ADMIN);
        {
            assert!(ts::has_most_recent_shared<DexFactory>(), 0);
        };
        
        ts::end(scenario);
    }

    // Test creating a pool
    #[test]
    fun test_create_pool() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens and factory
        let (usdc_cap, sui_cap) = setup_tokens_and_factory(&mut scenario);
        
        // Create a pool for USDC/SUI
        ts::next_tx(&mut scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            factory::create_pool<USDC, SUI>(&mut factory, ts::ctx(&mut scenario));
            ts::return_shared(factory);
        };
        
        // Verify the pool was created
        ts::next_tx(&mut scenario, ADMIN);
        {
            assert!(ts::has_most_recent_shared<Pool<USDC, SUI>>(), 1);
            let factory = ts::take_shared<DexFactory>(&scenario);
            assert_eq(factory::pool_count(&factory), 1);
            ts::return_shared(factory);
        };
        
        // Clean up
        ts::next_tx(&mut scenario, ADMIN);
        {
            transfer::public_transfer(usdc_cap, ADMIN);
            transfer::public_transfer(sui_cap, ADMIN);
        };
        
        ts::end(scenario);
    }

    // Test adding liquidity to a pool
    #[test]
    fun test_add_liquidity() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens, factory, and create pool
        let (usdc_cap, sui_cap) = setup_tokens_and_create_pool(&mut scenario);
        
        // Mint tokens for liquidity provider
        ts::next_tx(&mut scenario, ADMIN);
        {
            let usdc_coin = coin::mint<USDC>(&mut usdc_cap, 1000000000, ts::ctx(&mut scenario)); // 1000 USDC
            let sui_coin = coin::mint<SUI>(&mut sui_cap, 5000000000000, ts::ctx(&mut scenario)); // 5000 SUI
            transfer::public_transfer(usdc_coin, USER1);
            transfer::public_transfer(sui_coin, USER1);
        };
        
        // USER1 adds liquidity
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<USDC, SUI>>(&scenario);
            
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            // Add liquidity
            let lp_tokens = router::add_liquidity<USDC, SUI>(
                &factory,
                &mut pool,
                usdc_coin,
                sui_coin,
                0, // min amounts (no slippage check for test)
                0,
                0, // no deadline
                ts::ctx(&mut scenario)
            );
            
            transfer::public_transfer(lp_tokens, USER1);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        // Verify liquidity was added correctly
        ts::next_tx(&mut scenario, USER1);
        {
            let pool = ts::take_shared<Pool<USDC, SUI>>(&scenario);
            
            // Check reserves
            let (reserve_usdc, reserve_sui) = pool::get_reserves(&pool);
            assert!(reserve_usdc > 0, 2);
            assert!(reserve_sui > 0, 3);
            
            // Check that USER1 received LP tokens
            assert!(ts::has_most_recent_for_address<LP<USDC, SUI>>(USER1), 4);
            
            ts::return_shared(pool);
        };
        
        // Clean up
        ts::next_tx(&mut scenario, ADMIN);
        {
            transfer::public_transfer(usdc_cap, ADMIN);
            transfer::public_transfer(sui_cap, ADMIN);
        };
        
        ts::end(scenario);
    }

    // Test swapping tokens
    #[test]
    fun test_swap() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens, factory, create pool, and add initial liquidity
        let (usdc_cap, sui_cap) = setup_pool_with_liquidity(&mut scenario);
        
        // Mint some SUI for USER2 to swap
        ts::next_tx(&mut scenario, ADMIN);
        {
            let sui_coin = coin::mint<SUI>(&mut sui_cap, 100000000000, ts::ctx(&mut scenario)); // 100 SUI
            transfer::public_transfer(sui_coin, USER2);
        };
        
        // USER2 swaps SUI for USDC
        ts::next_tx(&mut scenario, USER2);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<USDC, SUI>>(&scenario);
            
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            // Create empty USDC coin
            let usdc_coin = coin::zero<USDC>(ts::ctx(&mut scenario));
            
            // For Pool<USDC, SUI>, we need to swap B for A (SUI for USDC)
            // coin_a_in should be empty USDC, coin_b_in should be SUI
            let (usdc_out, sui_out) = pool::swap(
                &mut pool,
                usdc_coin,   // coin_a_in: Coin<USDC>
                sui_coin,    // coin_b_in: Coin<SUI>
                0,           // amount_a_out_min: u64 (min USDC out)
                0,           // amount_b_out_min: u64 (min SUI out, should be 0)
                ts::ctx(&mut scenario)
            );
            
            // Verify we got some USDC out
            assert!(coin::value(&usdc_out) > 0, 5);
            
            transfer::public_transfer(usdc_out, USER2);
            transfer::public_transfer(sui_out, USER2); // This should be empty
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        // Verify USER2 received USDC
        ts::next_tx(&mut scenario, USER2);
        {
            assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER2), 8);
        };
        
        // Clean up
        ts::next_tx(&mut scenario, ADMIN);
        {
            transfer::public_transfer(usdc_cap, ADMIN);
            transfer::public_transfer(sui_cap, ADMIN);
        };
        
        ts::end(scenario);
    }

    // Test removing liquidity
    #[test]
    fun test_remove_liquidity() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens, factory, create pool, and add initial liquidity
        let (usdc_cap, sui_cap) = setup_pool_with_liquidity(&mut scenario);
        
        // USER1 removes liquidity
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<USDC, SUI>>(&scenario);
            let lp_tokens = ts::take_from_sender<LP<USDC, SUI>>(&scenario);
            
            // Get initial reserves
            let (usdc_reserve_before, sui_reserve_before) = pool::get_reserves(&pool);
            
            // Remove liquidity
            let (usdc_coin, sui_coin) = router::remove_liquidity<USDC, SUI>(
                &factory,
                &mut pool,
                lp_tokens,
                0, // min amounts (no slippage check for test)
                0,
                0, // no deadline
                ts::ctx(&mut scenario)
            );
            
            // Verify reserves decreased
            let (usdc_reserve_after, sui_reserve_after) = pool::get_reserves(&pool);
            assert!(usdc_reserve_after < usdc_reserve_before, 9);
            assert!(sui_reserve_after < sui_reserve_before, 10);
            
            // Verify coins were received
            assert!(coin::value(&usdc_coin) > 0, 11);
            assert!(coin::value(&sui_coin) > 0, 12);
            
            transfer::public_transfer(usdc_coin, USER1);
            transfer::public_transfer(sui_coin, USER1);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        // Clean up
        ts::next_tx(&mut scenario, ADMIN);
        {
            transfer::public_transfer(usdc_cap, ADMIN);
            transfer::public_transfer(sui_cap, ADMIN);
        };
        
        ts::end(scenario);
    }

    // Helper function to create a factory
    fun create_factory(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            factory::create_factory(ts::ctx(scenario));
        };
    }

    // Helper function to setup test tokens and factory
    fun setup_tokens_and_factory(scenario: &mut Scenario): (TreasuryCap<USDC>, TreasuryCap<SUI>) {
        // Create USDC
        ts::next_tx(scenario, ADMIN);
        {
            let (treasury_cap, metadata) = coin::create_currency<USDC>(
                USDC {}, 
                USDC_DECIMALS, 
                b"USDC", 
                b"USD Coin", 
                b"Test stablecoin for DEX", 
                option::none(), 
                ts::ctx(scenario)
            );
            
            transfer::public_transfer(treasury_cap, ADMIN);
            transfer::public_share_object(metadata);
        };
        
        // Create SUI test token
        ts::next_tx(scenario, ADMIN);
        {
            let (treasury_cap, metadata) = coin::create_currency<SUI>(
                SUI {}, 
                SUI_DECIMALS, 
                b"SUI", 
                b"Sui Token", 
                b"Test SUI token for DEX", 
                option::none(), 
                ts::ctx(scenario)
            );
            
            transfer::public_transfer(treasury_cap, ADMIN);
            transfer::public_share_object(metadata);
        };
        
        // Get treasury caps
        ts::next_tx(scenario, ADMIN);
        let usdc_cap = ts::take_from_address<TreasuryCap<USDC>>(scenario, ADMIN);
        
        ts::next_tx(scenario, ADMIN);
        let sui_cap = ts::take_from_address<TreasuryCap<SUI>>(scenario, ADMIN);
        
        // Create factory
        create_factory(scenario);
        
        (usdc_cap, sui_cap)
    }

    // Helper function to setup tokens, factory, and create pool
    fun setup_tokens_and_create_pool(scenario: &mut Scenario): (TreasuryCap<USDC>, TreasuryCap<SUI>) {
        let (usdc_cap, sui_cap) = setup_tokens_and_factory(scenario);
        
        // Create pool
        ts::next_tx(scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(scenario);
            factory::create_pool<USDC, SUI>(&mut factory, ts::ctx(scenario));
            ts::return_shared(factory);
        };
        
        (usdc_cap, sui_cap)
    }

    // Helper function to setup tokens, factory, create pool, and add initial liquidity
    fun setup_pool_with_liquidity(scenario: &mut Scenario): (TreasuryCap<USDC>, TreasuryCap<SUI>) {
        let (usdc_cap, sui_cap) = setup_tokens_and_create_pool(scenario);
        
        // Mint tokens for initial liquidity provider (USER1)
        ts::next_tx(scenario, ADMIN);
        {
            let usdc_coin = coin::mint<USDC>(&mut usdc_cap, 1000000000, ts::ctx(scenario)); // 1000 USDC
            let sui_coin = coin::mint<SUI>(&mut sui_cap, 5000000000000, ts::ctx(scenario)); // 5000 SUI
            transfer::public_transfer(usdc_coin, USER1);
            transfer::public_transfer(sui_coin, USER1);
        };
        
        // USER1 adds initial liquidity
        ts::next_tx(scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(scenario);
            let pool = ts::take_shared<Pool<USDC, SUI>>(scenario);
            
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(scenario);
            
            let lp_tokens = router::add_liquidity<USDC, SUI>(
                &factory,
                &mut pool,
                usdc_coin,
                sui_coin,
                0, 0, 0,
                ts::ctx(scenario)
            );
            
            transfer::public_transfer(lp_tokens, USER1);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        (usdc_cap, sui_cap)
    }
} 