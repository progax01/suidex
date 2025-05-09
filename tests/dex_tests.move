#[test_only]
module suidex::dex_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use sui::tx_context::TxContext;
    use suidex::factory::{Self, DexFactory};
    use suidex::pool::{Self, Pool};
    use suidex::lp_token::LP;
    use suidex::router;

    // Test tokens with their own module context
    struct USDC has drop {}
    struct SUI has drop {}

    const ADMIN: address = @0xA11CE;
    const USER1: address = @0xB0B;
    const USER2: address = @0xCAFE;

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
        setup_tokens_and_factory(&mut scenario);
        
        // Create a pool for SUI/USDC
        ts::next_tx(&mut scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(&mut scenario));
            ts::return_shared(factory);
        };
        
        // Verify the pool was created
        ts::next_tx(&mut scenario, ADMIN);
        {
            assert!(ts::has_most_recent_shared<Pool<SUI, USDC>>(), 1);
            let factory = ts::take_shared<DexFactory>(&scenario);
            assert_eq(factory::pool_count(&factory), 1);
            ts::return_shared(factory);
        };
        
        ts::end(scenario);
    }

    // Test adding liquidity to a pool
    #[test]
    fun test_add_liquidity() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens, factory, and create pool
        setup_tokens_and_create_pool(&mut scenario);
        
        // Mint tokens for liquidity provider
        ts::next_tx(&mut scenario, ADMIN);
        {
            let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario)); // 1 USDC
            let sui_coin = create_test_sui(5000000, ts::ctx(&mut scenario)); // 5 SUI
            transfer::public_transfer(usdc_coin, USER1);
            transfer::public_transfer(sui_coin, USER1);
        };
        
        // USER1 adds liquidity
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario); // SUI is token A
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario); // USDC is token B
            
            // Add liquidity
            let lp_tokens = router::add_liquidity<SUI, USDC>(
                &factory,
                &mut pool,
                sui_coin, // coin_a
                usdc_coin, // coin_b
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
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
            // Check reserves
            let (reserve_sui, reserve_usdc) = pool::get_reserves(&pool);
            assert!(reserve_sui > 0, 2);
            assert!(reserve_usdc > 0, 3);
            
            // Check that USER1 received LP tokens
            assert!(ts::has_most_recent_for_address<LP<SUI, USDC>>(USER1), 4);
            
            ts::return_shared(pool);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_add_liquidity_exact_min_amounts() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_create_pool(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario));
            let sui_coin = create_test_sui(5000000, ts::ctx(&mut scenario));
            transfer::public_transfer(usdc_coin, USER1);
            transfer::public_transfer(sui_coin, USER1);
        };
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            // Add liquidity with min amounts exactly equal to provided
            let lp_tokens = router::add_liquidity<SUI, USDC>(
                &factory,
                &mut pool,
                sui_coin,
                usdc_coin,
                5000000,
                1000000,
                0,
                ts::ctx(&mut scenario)
            );
            transfer::public_transfer(lp_tokens, USER1);
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = suidex::pool)]
    fun test_remove_liquidity_min_amounts_too_high() {
        let scenario = ts::begin(ADMIN);
        setup_pool_with_liquidity(&mut scenario);
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);

            // Get current reserves to set high min amounts
            let (reserve_sui, reserve_usdc) = pool::get_reserves(&pool);
            
            // Try to remove liquidity with min amounts higher than possible
            let (sui_coin, usdc_coin) = router::remove_liquidity<SUI, USDC>(
                &factory,
                &mut pool,
                lp_tokens,
                reserve_sui + 1,  // Request more than total SUI reserve
                reserve_usdc + 1, // Request more than total USDC reserve
                0,
                ts::ctx(&mut scenario)
            );
            transfer::public_transfer(sui_coin, USER1);
            transfer::public_transfer(usdc_coin, USER1);
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = suidex::pool)]
    fun test_swap_min_amount_out_too_high() {
        let scenario = ts::begin(ADMIN);
        setup_pool_with_liquidity(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let sui_coin = create_test_sui(1000000, ts::ctx(&mut scenario));
            transfer::public_transfer(sui_coin, USER2);
        };
        ts::next_tx(&mut scenario, USER2);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            // Set min amount out too high
            let usdc_out = router::swap_exact_input<SUI, USDC>(
                &factory,
                &mut pool,
                sui_coin,
                999999999,
                0,
                ts::ctx(&mut scenario)
            );
            // Transfer to dummy address to satisfy ability constraint
            transfer::public_transfer(usdc_out, @0xCAFE);
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_swap_min_amount_out_exact() {
        let scenario = ts::begin(ADMIN);
        setup_pool_with_liquidity(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let sui_coin = create_test_sui(1000000, ts::ctx(&mut scenario));
            transfer::public_transfer(sui_coin, USER2);
        };
        ts::next_tx(&mut scenario, USER2);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            // Calculate expected amount out
            let expected_out = router::get_amount_out<SUI, USDC>(&pool, coin::value(&sui_coin));
            let usdc_out = router::swap_exact_input<SUI, USDC>(
                &factory,
                &mut pool,
                sui_coin,
                expected_out,
                0,
                ts::ctx(&mut scenario)
            );
            assert!(coin::value(&usdc_out) == expected_out, 200);
            transfer::public_transfer(usdc_out, USER2);
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 3, location = suidex::router)]
    fun test_add_liquidity_deadline_expired() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_create_pool(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario));
            let sui_coin = create_test_sui(5000000, ts::ctx(&mut scenario));
            transfer::public_transfer(usdc_coin, USER1);
            transfer::public_transfer(sui_coin, USER1);
        };
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            // Use deadline in the past
            let lp_tokens = router::add_liquidity<SUI, USDC>(
                &factory,
                &mut pool,
                sui_coin,
                usdc_coin,
                0,
                0,
                0, // deadline expired
                ts::ctx(&mut scenario)
            );
            // Transfer to dummy address to satisfy ability constraint
            transfer::public_transfer(lp_tokens, @0xCAFE);
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }

    // Test swapping tokens
    #[test]
    fun test_swap() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens, factory, create pool, and add initial liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // Mint some SUI for USER2 to swap
        ts::next_tx(&mut scenario, ADMIN);
        {
            let sui_coin = create_test_sui(1000000, ts::ctx(&mut scenario)); // 1 SUI
            transfer::public_transfer(sui_coin, USER2);
        };
        
        // USER2 swaps SUI for USDC
        ts::next_tx(&mut scenario, USER2);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            // Swap using router (SUI -> USDC)
            let usdc_out = router::swap_exact_input<SUI, USDC>(
                &factory,
                &mut pool,
                sui_coin,
                0, // min amount out
                0, // no deadline
                ts::ctx(&mut scenario)
            );
            
            // Verify we got some USDC out
            assert!(coin::value(&usdc_out) > 0, 5);
            
            transfer::public_transfer(usdc_out, USER2);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        // Verify USER2 received USDC
        ts::next_tx(&mut scenario, USER2);
        {
            assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER2), 8);
        };
        
        ts::end(scenario);
    }

    // Test swapping tokens in the reverse direction (USDC -> SUI)
    #[test]
    fun test_reverse_swap() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens, factory, create pool, and add initial liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // Mint some USDC for USER2 to swap
        ts::next_tx(&mut scenario, ADMIN);
        {
            let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario)); // 1 USDC
            transfer::public_transfer(usdc_coin, USER2);
        };
        
        // USER2 swaps USDC for SUI
        ts::next_tx(&mut scenario, USER2);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            
            // Create empty SUI coin for input
            let sui_empty = coin::zero<SUI>(ts::ctx(&mut scenario));
            
            // Swap directly using pool::swap (USDC -> SUI)
            // Note: We need to maintain the SUI, USDC type order but swap USDC for SUI
            let (sui_out, usdc_out) = pool::swap(
                &mut pool,
                sui_empty,    // Empty SUI coin (not providing SUI)
                usdc_coin,    // USDC coin to swap
                0,            // min SUI out
                0,            // We don't expect USDC back
                ts::ctx(&mut scenario)
            );
            
            // Verify we got some SUI out and no USDC out
            assert!(coin::value(&sui_out) > 0, 9);
            assert!(coin::value(&usdc_out) == 0, 10);
            
            transfer::public_transfer(sui_out, USER2);
            transfer::public_transfer(usdc_out, USER2); // Transfer empty coin
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        // Verify USER2 received SUI
        ts::next_tx(&mut scenario, USER2);
        {
            assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER2), 11);
        };
        
        ts::end(scenario);
    }

    // Test removing liquidity from a pool
    #[test]
    fun test_remove_liquidity() {
        let scenario = ts::begin(ADMIN);
        
        // Setup tokens, factory, create pool, and add initial liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // Take LP tokens from USER1 and remove liquidity
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
            let (sui_coin, usdc_coin) = router::remove_liquidity<SUI, USDC>(
                &factory,
                &mut pool,
                lp_tokens,
                0, // min amounts (no slippage check for test)
                0,
                0, // no deadline
                ts::ctx(&mut scenario)
            );
            
            // Verify we got some tokens out
            assert!(coin::value(&sui_coin) > 0, 6);
            assert!(coin::value(&usdc_coin) > 0, 7);
            
            transfer::public_transfer(sui_coin, USER1);
            transfer::public_transfer(usdc_coin, USER1);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        ts::end(scenario);
    }

    // Create a test USDC coin directly for testing (bypassing TreasuryCap)
    fun create_test_usdc(amount: u64, ctx: &mut TxContext): Coin<USDC> {
        coin::mint_for_testing<USDC>(amount, ctx)
    }
    
    // Create a test SUI coin directly for testing (bypassing TreasuryCap)
    fun create_test_sui(amount: u64, ctx: &mut TxContext): Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, ctx)
    }

    // Helper function to create a new factory
    fun create_factory(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            factory::create_factory(ts::ctx(scenario));
        };
    }

    // Helper function to setup tokens and create factory
    fun setup_tokens_and_factory(scenario: &mut Scenario) {
        // No need to create metadata since we're using the mint_for_testing approach
        // Just create the factory
        create_factory(scenario);
    }

    // Helper function to setup tokens, factory, and create a pool
    fun setup_tokens_and_create_pool(scenario: &mut Scenario) {
        // Setup tokens and factory
        setup_tokens_and_factory(scenario);
        
        // Create a pool for SUI/USDC
        ts::next_tx(scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(scenario);
            factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(scenario));
            ts::return_shared(factory);
        };
    }

    // Helper function to setup tokens, factory, create pool, and add initial liquidity
    fun setup_pool_with_liquidity(scenario: &mut Scenario) {
        // Setup tokens, factory, and create pool
        setup_tokens_and_create_pool(scenario);
        
        // Mint tokens for liquidity provider
        ts::next_tx(scenario, ADMIN);
        {
            let usdc_coin = create_test_usdc(1000000, ts::ctx(scenario)); // 1 USDC
            let sui_coin = create_test_sui(5000000, ts::ctx(scenario)); // 5 SUI
            transfer::public_transfer(usdc_coin, USER1);
            transfer::public_transfer(sui_coin, USER1);
        };
        
        // USER1 adds liquidity
        ts::next_tx(scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(scenario);
            
            let sui_coin = ts::take_from_sender<Coin<SUI>>(scenario); // SUI is token A
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(scenario); // USDC is token B
            
            // Add liquidity
            let lp_tokens = router::add_liquidity<SUI, USDC>(
                &factory,
                &mut pool,
                sui_coin, // coin_a
                usdc_coin, // coin_b
                0, // min amounts (no slippage check for test)
                0,
                0, // no deadline
                ts::ctx(scenario)
            );
            
            transfer::public_transfer(lp_tokens, USER1);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
    }

    #[test]
    #[expected_failure(abort_code = 0, location = suidex::factory)]
    fun test_create_pool_already_exists() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_create_pool(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            // This should abort with code 0
            factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(&mut scenario));
            ts::return_shared(factory);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 0, location = suidex::factory)]
    fun test_create_pool_already_exists_negative() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_create_pool(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            // This should abort with code 0 (EPoolExists)
            factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(&mut scenario));
            ts::return_shared(factory);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_get_pool_not_exists_negative() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_factory(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let (exists, addr) = factory::get_pool<SUI, USDC>(&factory);
            assert!(!exists, 100);
            assert_eq(addr, @0x0);
            ts::return_shared(factory);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_pool_exists_not_exists_negative() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_factory(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let exists = factory::pool_exists<SUI, USDC>(&factory);
            assert!(!exists, 101);
            ts::return_shared(factory);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 0, location = suidex::pool)]
    fun test_add_liquidity_zero_amount() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_create_pool(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let sui_coin = create_test_sui(0, ts::ctx(&mut scenario));
            let usdc_coin = create_test_usdc(0, ts::ctx(&mut scenario));
            transfer::public_transfer(sui_coin, USER1);
            transfer::public_transfer(usdc_coin, USER1);
        };
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            // Assign and consume the returned LP
            let _lp = router::add_liquidity<SUI, USDC>(&factory, &mut pool, sui_coin, usdc_coin, 0, 0, 0, ts::ctx(&mut scenario));
            let dummy_address = @0xCAFE;
            transfer::public_transfer(_lp, dummy_address);
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = suidex::pool)]
    fun test_add_liquidity_min_amounts_too_high() {
        let scenario = ts::begin(ADMIN);
        setup_tokens_and_create_pool(&mut scenario);
        ts::next_tx(&mut scenario, ADMIN);
        {
            let sui_coin = create_test_sui(1000, ts::ctx(&mut scenario));
            let usdc_coin = create_test_usdc(1000, ts::ctx(&mut scenario));
            transfer::public_transfer(sui_coin, USER1);
            transfer::public_transfer(usdc_coin, USER1);
        };
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            // Assign and consume the returned LP
            let _lp = router::add_liquidity<SUI, USDC>(&factory, &mut pool, sui_coin, usdc_coin, 2000, 2000, 0, ts::ctx(&mut scenario));
            let dummy_address = @0xCAFE;
            transfer::public_transfer(_lp, dummy_address);
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        ts::end(scenario);
    }
}
