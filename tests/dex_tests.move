// #[test_only]
// module suidex::dex_tests {    
//     use sui::test_scenario::{Self as ts, Scenario};
//     use sui::coin::{Self, Coin};
//     use sui::test_utils::assert_eq;
//     use sui::transfer;    
//     use sui::tx_context::TxContext;
//     use std::option::{Self, Option};
//     use std::vector;
//     use suidex::factory::{Self, DexFactory};
//     use suidex::pool::{Self, Pool};
//     use suidex::lp_token::{Self as lp_token, LP, LPCap};
//     use suidex::router;

//     // Test tokens with their own module context
//     struct USDC has drop {}
//     struct SUI has drop {}
//     struct WETH has drop {}
//     struct DAI has drop {}

//     const ADMIN: address = @0xA11CE;
//     const USER1: address = @0xB0B;
//     const USER2: address = @0xCAFE;
//     const USER3: address = @0xD00D;
    
//     // Error constants
//     const EPoolExists: u64 = 0;
//     const EZeroAmount: u64 = 0;
//     const EInsufficientLiquidity: u64 = 1;
//     const EInsufficientOutputAmount: u64 = 2;
//     const EInsufficientInputAmount: u64 = 3;
//     const EInvalidK: u64 = 4;
//     const EInsufficientLiquidityMinted: u64 = 5;
//     const EPoolNotFound: u64 = 0;
//     const EDeadlineExceeded: u64 = 3;

//     // Test initialization of DEX with factory
//     #[test]
//     fun test_dex_init() {
//         let scenario = ts::begin(ADMIN);
        
//         // Create the factory
//         create_factory(&mut scenario);
        
//         // Check that the factory was created and shared
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             assert!(ts::has_most_recent_shared<DexFactory>(), 0);
//         };
        
//         ts::end(scenario);
//     }

//     // Test creating a pool
//     #[test]
//     fun test_create_pool() {
//         let scenario = ts::begin(ADMIN);
        
//         // Setup tokens and factory
//         setup_tokens_and_factory(&mut scenario);
        
//         // Create a pool for SUI/USDC
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(&mut scenario));
//             ts::return_shared(factory);
//         };
        
//         // Verify the pool was created
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             assert!(ts::has_most_recent_shared<Pool<SUI, USDC>>(), 1);
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             assert_eq(factory::pool_count(&factory), 1);
//             ts::return_shared(factory);
//         };
        
//         ts::end(scenario);
//     }

//     // Test adding liquidity to a pool
//     #[test]
//     fun test_add_liquidity() {
//         let scenario = ts::begin(ADMIN);
        
//         // Setup tokens, factory, and create pool
//         setup_tokens_and_create_pool(&mut scenario);
        
//         // Mint tokens for liquidity provider
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario)); // 1 USDC
//             let sui_coin = create_test_sui(5000000, ts::ctx(&mut scenario)); // 5 SUI
//             transfer::public_transfer(usdc_coin, USER1);
//             transfer::public_transfer(sui_coin, USER1);
//         };
        
//         // USER1 adds liquidity
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario); // SUI is token A
//             let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario); // USDC is token B
            
//             // Add liquidity
//             let lp_tokens = router::add_liquidity<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin, // coin_a
//                 usdc_coin, // coin_b
//                 0, // min amounts (no slippage check for test)
//                 0,
//                 0, // no deadline
//                 ts::ctx(&mut scenario)
//             );
            
//             transfer::public_transfer(lp_tokens, USER1);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify liquidity was added correctly
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
//             // Check reserves
//             let (reserve_sui, reserve_usdc) = pool::get_reserves(&pool);
//             assert!(reserve_sui > 0, 2);
//             assert!(reserve_usdc > 0, 3);
            
//             // Check that USER1 received LP tokens
//             assert!(ts::has_most_recent_for_address<LP<SUI, USDC>>(USER1), 4);
            
//             ts::return_shared(pool);
//         };
        
//         ts::end(scenario);
//     }

//     // Test adding liquidity using the entry function
//     #[test]
//     fun test_add_liquidity_and_transfer() {
//         let scenario = ts::begin(ADMIN);
        
//         // Setup tokens, factory, and create pool
//         setup_tokens_and_create_pool(&mut scenario);
        
//         // Mint tokens for liquidity provider
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario)); 
//             let sui_coin = create_test_sui(5000000, ts::ctx(&mut scenario)); 
//             transfer::public_transfer(usdc_coin, USER1);
//             transfer::public_transfer(sui_coin, USER1);
//         };
        
//         // USER1 adds liquidity using entry function
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
//             let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            
//             // Add liquidity using entry function
//             router::add_liquidity_and_transfer<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 usdc_coin,
//                 0,
//                 0,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify LP tokens were transferred to USER1
//         ts::next_tx(&mut scenario, USER1);
//         {
//             assert!(ts::has_most_recent_for_address<LP<SUI, USDC>>(USER1), 4);
//         };
        
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_add_liquidity_exact_min_amounts() {
//         let scenario = ts::begin(ADMIN);
//         setup_tokens_and_create_pool(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario));
//             let sui_coin = create_test_sui(5000000, ts::ctx(&mut scenario));
//             transfer::public_transfer(usdc_coin, USER1);
//             transfer::public_transfer(sui_coin, USER1);
//         };
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
//             let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
//             // Add liquidity with min amounts exactly equal to provided
//             let lp_tokens = router::add_liquidity<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 usdc_coin,
//                 5000000,
//                 1000000,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
//             transfer::public_transfer(lp_tokens, USER1);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     #[expected_failure(abort_code = 1, location = suidex::pool)]
//     fun test_remove_liquidity_min_amounts_too_high() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);

//             // Get current reserves to set high min amounts
//             let (reserve_sui, reserve_usdc) = pool::get_reserves(&pool);
            
//             // Try to remove liquidity with min amounts higher than possible
//             let (sui_coin, usdc_coin, remaining_lp_opt) = router::remove_liquidity<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 lp_tokens,
//                 0, // lp_amount (0 means all)
//                 reserve_sui + 1,  // Request more than total SUI reserve
//                 reserve_usdc + 1, // Request more than total USDC reserve
//                 0, // deadline
//                 ts::ctx(&mut scenario)
//             );
            
//             transfer::public_transfer(sui_coin, USER1);
//             transfer::public_transfer(usdc_coin, USER1);
            
//             if (option::is_some(&remaining_lp_opt)) {
//                 let remaining_lp = option::extract(&mut remaining_lp_opt);
//                 transfer::public_transfer(remaining_lp, USER1);
//             };
//             option::destroy_none(remaining_lp_opt);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     // Test removing liquidity using the entry function
//     #[test]
//     fun test_remove_liquidity_and_transfer() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
//             // Remove liquidity using entry function
//             router::remove_liquidity_and_transfer<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 lp_tokens,
//                 0, // lp_amount (0 means all)
//                 0, // min_a
//                 0, // min_b
//                 0, // deadline
//                 ts::ctx(&mut scenario)
//             );
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify USER1 received both coins
//         ts::next_tx(&mut scenario, USER1);
//         {
//             assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER1), 6);
//             assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER1), 7);
//         };
        
//         ts::end(scenario);
//     }

//     #[test]
//     #[expected_failure(abort_code = 2, location = suidex::pool)]
//     fun test_swap_min_amount_out_too_high() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(1000000, ts::ctx(&mut scenario));
//             transfer::public_transfer(sui_coin, USER2);
//         };
//         ts::next_tx(&mut scenario, USER2);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
//             // Set min amount out too high
//             let usdc_out = router::swap_exact_input<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 999999999,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
//             // Transfer to dummy address to satisfy ability constraint
//             transfer::public_transfer(usdc_out, @0xCAFE);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_swap_min_amount_out_exact() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(1000000, ts::ctx(&mut scenario));
//             transfer::public_transfer(sui_coin, USER2);
//         };
//         ts::next_tx(&mut scenario, USER2);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
//             // Calculate expected amount out
//             let expected_out = router::get_amount_out<SUI, USDC>(&pool, coin::value(&sui_coin));
//             let usdc_out = router::swap_exact_input<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 expected_out,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
//             assert!(coin::value(&usdc_out) == expected_out, 200);
//             transfer::public_transfer(usdc_out, USER2);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }    

//     // Test swapping using entry function
//     #[test]
//     fun test_swap_exact_input_and_transfer() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(1000000, ts::ctx(&mut scenario));
//             transfer::public_transfer(sui_coin, USER2);
//         };
//         ts::next_tx(&mut scenario, USER2);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            
//             // Swap using entry function
//             router::swap_exact_input_and_transfer<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 0,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify USER2 received USDC
//         ts::next_tx(&mut scenario, USER2);
//         {
//             assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER2), 8);
//         };
        
//         ts::end(scenario);
//     }

//     // Test swapping tokens
//     #[test]
//     fun test_swap() {
//         let scenario = ts::begin(ADMIN);
        
//         // Setup tokens, factory, create pool, and add initial liquidity
//         setup_pool_with_liquidity(&mut scenario);
        
//         // Mint some SUI for USER2 to swap
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(1000000, ts::ctx(&mut scenario)); // 1 SUI
//             transfer::public_transfer(sui_coin, USER2);
//         };
        
//         // USER2 swaps SUI for USDC
//         ts::next_tx(&mut scenario, USER2);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            
//             // Swap using router (SUI -> USDC)
//             let usdc_out = router::swap_exact_input<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 0, // min amount out
//                 0, // no deadline
//                 ts::ctx(&mut scenario)
//             );
            
//             // Verify we got some USDC out
//             assert!(coin::value(&usdc_out) > 0, 5);
            
//             transfer::public_transfer(usdc_out, USER2);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify USER2 received USDC
//         ts::next_tx(&mut scenario, USER2);
//         {
//             assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER2), 8);
//         };
        
//         ts::end(scenario);
//     }

//     // Test swapping tokens in the reverse direction (USDC -> SUI)
//     #[test]
//     fun test_reverse_swap() {
//         let scenario = ts::begin(ADMIN);
        
//         // Setup tokens, factory, create pool, and add initial liquidity
//         setup_pool_with_liquidity(&mut scenario);
        
//         // Mint some USDC for USER2 to swap
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let usdc_coin = create_test_usdc(1000000, ts::ctx(&mut scenario)); // 1 USDC
//             transfer::public_transfer(usdc_coin, USER2);
//         };
        
//         // USER2 swaps USDC for SUI
//         ts::next_tx(&mut scenario, USER2);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            
//             let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            
//             // Create empty SUI coin for input
//             let sui_empty = coin::zero<SUI>(ts::ctx(&mut scenario));
            
//             // Swap directly using pool::swap (USDC -> SUI)
//             // Note: We need to maintain the SUI, USDC type order but swap USDC for SUI
//             let (sui_out, usdc_out) = pool::swap(
//                 &mut pool,
//                 sui_empty,    // Empty SUI coin (not providing SUI)
//                 usdc_coin,    // USDC coin to swap
//                 0,            // min SUI out
//                 0,            // We don't expect USDC back
//                 ts::ctx(&mut scenario)
//             );
            
//             // Verify we got some SUI out and no USDC out
//             assert!(coin::value(&sui_out) > 0, 9);
//             assert!(coin::value(&usdc_out) == 0, 10);
            
//             transfer::public_transfer(sui_out, USER2);
//             transfer::public_transfer(usdc_out, USER2); // Transfer empty coin
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify USER2 received SUI
//         ts::next_tx(&mut scenario, USER2);
//         {
//             assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER2), 11);
//         };
        
//         ts::end(scenario);
//     }

//     // Test removing liquidity from a pool
//     #[test]
//     fun test_remove_liquidity() {
//         let scenario = ts::begin(ADMIN);
        
//         // Setup tokens, factory, create pool, and add initial liquidity
//         setup_pool_with_liquidity(&mut scenario);
        
//         // Take LP tokens from USER1 and remove liquidity
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
//             let (sui_coin, usdc_coin, remaining_lp_opt) = router::remove_liquidity<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 lp_tokens,
//                 0, // lp_amount (0 means all)
//                 0, // min amounts (no slippage check for test)
//                 0,
//                 0, // no deadline
//                 ts::ctx(&mut scenario)
//             );
            
//             // Verify we got some tokens out
//             assert!(coin::value(&sui_coin) > 0, 6);
//             assert!(coin::value(&usdc_coin) > 0, 7);
            
//             // Verify there are no remaining LP tokens
//             assert!(option::is_none(&remaining_lp_opt), 8);
            
//             transfer::public_transfer(sui_coin, USER1);
//             transfer::public_transfer(usdc_coin, USER1);
//             option::destroy_none(remaining_lp_opt);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         ts::end(scenario);
//     }   

//     // Test swapping with exact output
//     #[test]
//     fun test_swap_exact_output() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(2000000, ts::ctx(&mut scenario));
//             transfer::public_transfer(sui_coin, USER2);
//         };
//         ts::next_tx(&mut scenario, USER2);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            
//             // Define an exact amount of USDC to receive
//             let exact_out = 100000; // 0.1 USDC
            
//             // Swap for exact output
//             let (usdc_out, sui_remaining) = router::swap_exact_output<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 exact_out,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
            
//             // Verify exact amount out and remaining SUI
//             assert!(coin::value(&usdc_out) == exact_out, 201);
//             assert!(coin::value(&sui_remaining) > 0, 202); // Should have some SUI remaining
            
//             transfer::public_transfer(usdc_out, USER2);
//             transfer::public_transfer(sui_remaining, USER2);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     // Test swapping with exact output using entry function
//     #[test]
//     fun test_swap_exact_output_and_transfer() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(2000000, ts::ctx(&mut scenario));
//             transfer::public_transfer(sui_coin, USER2);
//         };
//         ts::next_tx(&mut scenario, USER2);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            
//             // Define an exact amount of USDC to receive
//             let exact_out = 100000; // 0.1 USDC
            
//             // Swap for exact output using entry function
//             router::swap_exact_output_and_transfer<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 exact_out,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify USER2 received both USDC and remaining SUI
//         ts::next_tx(&mut scenario, USER2);
//         {
//             assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER2), 203);
//             assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER2), 204);
//         };
        
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_lp_token_split_join() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
//             let original_balance = lp_token::balance(&lp_tokens);            
//             let half_balance = original_balance / 2;
            
//             // Split LP tokens - Note: due to Move's integer division, we need to handle rounding
//             let split_lp = lp_token::split(&mut lp_tokens, half_balance, ts::ctx(&mut scenario));
//             let remaining_balance = original_balance - half_balance; // This accounts for integer division rounding
//             assert!(lp_token::balance(&lp_tokens) == remaining_balance, 0);
//             assert!(lp_token::balance(&split_lp) == half_balance, 1);
            
//             // Join LP tokens back
//             lp_token::join(&mut lp_tokens, split_lp);
//             assert!(lp_token::balance(&lp_tokens) == original_balance, 2);
            
//             // Clean up
//             transfer::public_transfer(lp_tokens, USER1);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     #[expected_failure(abort_code = 0, location = suidex::lp_token)]
//     fun test_lp_token_split_insufficient_balance() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
//             let balance = lp_token::balance(&lp_tokens);
//             // Try to split more than available
//             let split_lp = lp_token::split(&mut lp_tokens, balance + 1, ts::ctx(&mut scenario));
//             transfer::public_transfer(split_lp, USER1);
            
//             transfer::public_transfer(lp_tokens, USER1);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_lp_token_split_zero() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
//             let original_balance = lp_token::balance(&lp_tokens);
//             // Split zero amount
//             let split_lp = lp_token::split(&mut lp_tokens, 0, ts::ctx(&mut scenario));
            
//             assert!(lp_token::balance(&lp_tokens) == original_balance, 0);
//             assert!(lp_token::balance(&split_lp) == 0, 1);
            
//             // Join back the zero balance LP token
//             lp_token::join(&mut lp_tokens, split_lp);
//             assert!(lp_token::balance(&lp_tokens) == original_balance, 2);
            
//             transfer::public_transfer(lp_tokens, USER1);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_remove_partial_liquidity() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
//             // Get initial balance
//             let initial_balance = lp_token::balance(&lp_tokens);
//             let partial_amount = initial_balance / 2; // Remove half the liquidity
            
//             // Remove partial liquidity (half)
//             let (sui_coin, usdc_coin, remaining_lp_opt) = router::remove_liquidity<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 lp_tokens,
//                 partial_amount, // Remove half
//                 0, // min amounts (no slippage check for test)
//                 0,
//                 0, // no deadline
//                 ts::ctx(&mut scenario)
//             );
            
//             // Verify we got some tokens out
//             assert!(coin::value(&sui_coin) > 0, 300);
//             assert!(coin::value(&usdc_coin) > 0, 301);
            
//             // Verify we got remaining LP tokens
//             assert!(option::is_some(&remaining_lp_opt), 302);
//             let remaining_lp = option::extract(&mut remaining_lp_opt);
            
//             // Verify the remaining balance
//             assert!(lp_token::balance(&remaining_lp) == (initial_balance - partial_amount), 303);
            
//             transfer::public_transfer(sui_coin, USER1);
//             transfer::public_transfer(usdc_coin, USER1);
//             transfer::public_transfer(remaining_lp, USER1);
//             option::destroy_none(remaining_lp_opt);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_remove_partial_liquidity_and_transfer() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
//             // Get initial balance
//             let initial_balance = lp_token::balance(&lp_tokens);
//             let partial_amount = initial_balance / 2; // Remove half the liquidity
            
//             // Remove partial liquidity using entry function
//             router::remove_liquidity_and_transfer<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 lp_tokens,
//                 partial_amount, // Remove half
//                 0,
//                 0,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         // Verify USER1 received both coins and remaining LP tokens
//         ts::next_tx(&mut scenario, USER1);
//         {
//             assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER1), 304);
//             assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER1), 305);
//             assert!(ts::has_most_recent_for_address<LP<SUI, USDC>>(USER1), 306);
//         };
        
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_remove_zero_amount_removes_all() {
//         let scenario = ts::begin(ADMIN);
//         setup_pool_with_liquidity(&mut scenario);
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
//             // Get initial balance to verify full removal
//             let initial_balance = lp_token::balance(&lp_tokens);
            
//             // Remove liquidity with amount 0 (should remove all)
//             let (sui_coin, usdc_coin, remaining_lp_opt) = router::remove_liquidity<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 lp_tokens,
//                 0, // Remove all
//                 0, 
//                 0,
//                 0,
//                 ts::ctx(&mut scenario)
//             );
            
//             // Verify we got tokens proportional to full LP amount
//             // Because we're the only liquidity provider, we should get all reserves minus fees
//             let (_reserve_sui, _reserve_usdc) = pool::get_reserves(&pool);
//             assert!(coin::value(&sui_coin) > 0, 307);
//             assert!(coin::value(&usdc_coin) > 0, 308);
            
//             // Verify there are no remaining LP tokens
//             assert!(option::is_none(&remaining_lp_opt), 309);
            
//             transfer::public_transfer(sui_coin, USER1);
//             transfer::public_transfer(usdc_coin, USER1);
//             option::destroy_none(remaining_lp_opt);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
        
//         ts::end(scenario);
//     }

//     // Create a test USDC coin directly for testing (bypassing TreasuryCap)
//     fun create_test_usdc(amount: u64, ctx: &mut TxContext): Coin<USDC> {
//         coin::mint_for_testing<USDC>(amount, ctx)
//     }
    
//     // Create a test SUI coin directly for testing (bypassing TreasuryCap)
//     fun create_test_sui(amount: u64, ctx: &mut TxContext): Coin<SUI> {
//         coin::mint_for_testing<SUI>(amount, ctx)
//     }

//     // Helper function to create a new factory
//     fun create_factory(scenario: &mut Scenario) {
//         ts::next_tx(scenario, ADMIN);
//         {
//             factory::create_factory(ts::ctx(scenario));
//         };
//     }

//     // Helper function to setup tokens and create factory
//     fun setup_tokens_and_factory(scenario: &mut Scenario) {
//         // No need to create metadata since we're using the mint_for_testing approach
//         // Just create the factory
//         create_factory(scenario);
//     }

//     // Helper function to setup tokens, factory, and create a pool
//     fun setup_tokens_and_create_pool(scenario: &mut Scenario) {
//         // Setup tokens and factory
//         setup_tokens_and_factory(scenario);
        
//         // Create a pool for SUI/USDC
//         ts::next_tx(scenario, ADMIN);
//         {
//             let factory = ts::take_shared<DexFactory>(scenario);
//             factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(scenario));
//             ts::return_shared(factory);
//         };
//     }

//     // Helper function to setup tokens, factory, create pool, and add initial liquidity
//     fun setup_pool_with_liquidity(scenario: &mut Scenario) {
//         // Setup tokens, factory, and create pool
//         setup_tokens_and_create_pool(scenario);
        
//         // Mint tokens for liquidity provider
//         ts::next_tx(scenario, ADMIN);
//         {
//             let usdc_coin = create_test_usdc(1000000, ts::ctx(scenario)); // 1 USDC
//             let sui_coin = create_test_sui(5000000, ts::ctx(scenario)); // 5 SUI
//             transfer::public_transfer(usdc_coin, USER1);
//             transfer::public_transfer(sui_coin, USER1);
//         };
        
//         // USER1 adds liquidity
//         ts::next_tx(scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(scenario);
            
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(scenario);
//             let usdc_coin = ts::take_from_sender<Coin<USDC>>(scenario);
            
//             // Add liquidity
//             let lp_tokens = router::add_liquidity<SUI, USDC>(
//                 &factory,
//                 &mut pool,
//                 sui_coin,
//                 usdc_coin,
//                 0,
//                 0,
//                 0,
//                 ts::ctx(scenario)
//             );
            
//             transfer::public_transfer(lp_tokens, USER1);
            
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//     }
    
//     #[test]
//     #[expected_failure(abort_code = 0, location = suidex::factory)]
//     fun test_create_pool_already_exists() {
//         let scenario = ts::begin(ADMIN);
//         setup_tokens_and_create_pool(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             // This should abort with code 0
//             factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(&mut scenario));
//             ts::return_shared(factory);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_get_pool_not_exists() {
//         let scenario = ts::begin(ADMIN);
//         setup_tokens_and_factory(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let (exists, addr) = factory::get_pool<SUI, USDC>(&factory);
//             assert!(!exists, 100);
//             assert_eq(addr, @0x0);
//             ts::return_shared(factory);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     fun test_pool_exists_not_exists() {
//         let scenario = ts::begin(ADMIN);
//         setup_tokens_and_factory(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let exists = factory::pool_exists<SUI, USDC>(&factory);
//             assert!(!exists, 101);
//             ts::return_shared(factory);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     #[expected_failure(abort_code = 0, location = suidex::pool)]
//     fun test_add_liquidity_zero_amount() {
//         let scenario = ts::begin(ADMIN);
//         setup_tokens_and_create_pool(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(0, ts::ctx(&mut scenario));
//             let usdc_coin = create_test_usdc(0, ts::ctx(&mut scenario));
//             transfer::public_transfer(sui_coin, USER1);
//             transfer::public_transfer(usdc_coin, USER1);
//         };
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
//             let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
//             // Assign and consume the returned LP
//             let _lp = router::add_liquidity<SUI, USDC>(&factory, &mut pool, sui_coin, usdc_coin, 0, 0, 0, ts::ctx(&mut scenario));
//             let dummy_address = @0xCAFE;
//             transfer::public_transfer(_lp, dummy_address);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }

//     #[test]
//     #[expected_failure(abort_code = 1, location = suidex::pool)]
//     fun test_add_liquidity_min_amounts_too_high() {
//         let scenario = ts::begin(ADMIN);
//         setup_tokens_and_create_pool(&mut scenario);
//         ts::next_tx(&mut scenario, ADMIN);
//         {
//             let sui_coin = create_test_sui(1000, ts::ctx(&mut scenario));
//             let usdc_coin = create_test_usdc(1000, ts::ctx(&mut scenario));
//             transfer::public_transfer(sui_coin, USER1);
//             transfer::public_transfer(usdc_coin, USER1);
//         };
//         ts::next_tx(&mut scenario, USER1);
//         {
//             let factory = ts::take_shared<DexFactory>(&scenario);
//             let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
//             let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
//             let usdc_coin = ts::take_from_sender<Coin<USDC>>(&scenario);
//             // Assign and consume the returned LP
//             let _lp = router::add_liquidity<SUI, USDC>(&factory, &mut pool, sui_coin, usdc_coin, 2000, 2000, 0, ts::ctx(&mut scenario));
//             let dummy_address = @0xCAFE;
//             transfer::public_transfer(_lp, dummy_address);
//             ts::return_shared(factory);
//             ts::return_shared(pool);
//         };
//         ts::end(scenario);
//     }   
// }


#[test_only]
module suidex::lp_destroy_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use sui::tx_context;
    use std::option;
    use suidex::factory::{Self, DexFactory};
    use suidex::pool::{Self, Pool};
    use suidex::lp_token::{Self, LP};
    use suidex::router;

    // Test tokens
    struct USDC has drop {}
    struct SUI has drop {}

    // Test addresses - corrected format for Sui Move
    const ADMIN: address = @0xA11CE;
    const USER1: address = @0xB0B;
    
    // Test the destroy_zero function directly
    #[test]
    fun test_destroy_zero() {
        let scenario = ts::begin(ADMIN);
        
        // Create a pool and add liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // Create a zero LP token and destroy it
        ts::next_tx(&mut scenario, USER1);
        {
            let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
            // Get initial LP balance
            let total_balance = lp_token::balance(&lp_tokens);
            
            // Split off a zero-balance LP token
            let zero_lp = lp_token::split(&mut lp_tokens, 0, ts::ctx(&mut scenario));
            
            // Verify the split token has zero balance
            assert_eq(lp_token::balance(&zero_lp), 0);
            
            // Test our new destroy_zero function
            lp_token::destroy_zero(zero_lp);
            
            // The original token should still have its full balance
            assert_eq(lp_token::balance(&lp_tokens), total_balance);
            
            transfer::public_transfer(lp_tokens, USER1);
        };
        
        ts::end(scenario);
    }
    
    // Test that destroy_zero aborts when called with a non-zero balance token
    #[test]
    #[expected_failure(abort_code = 0, location = suidex::lp_token)]
    fun test_destroy_zero_with_balance() {
        let scenario = ts::begin(ADMIN);
        
        // Create a pool and add liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // Try to destroy an LP token with non-zero balance
        ts::next_tx(&mut scenario, USER1);
        {
            let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
            // Verify it has a positive balance
            assert!(lp_token::balance(&lp_tokens) > 0, 0);
            
            // This should abort with code 0
            lp_token::destroy_zero(lp_tokens);
            
            // We should never reach here
        };
        
        ts::end(scenario);
    }
    
    // Test removing all liquidity from a pool with the updated function
    #[test]
    fun test_remove_all_liquidity() {
        let scenario = ts::begin(ADMIN);
        
        // Create a pool and add liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // USER1 removes all liquidity
        ts::next_tx(&mut scenario, USER1);
        {
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
            // Get initial reserves and LP token amount
            let (reserve_a_before, reserve_b_before) = pool::get_reserves(&pool);
            let _lp_amount = lp_token::balance(&lp_tokens);
            
            // Remove all liquidity
            let (coin_a, coin_b) = pool::remove_liquidity(
                &mut pool,
                lp_tokens,
                0, // minimum amounts
                0,
                ts::ctx(&mut scenario)
            );
            
            // Check we received tokens
            assert!(coin::value(&coin_a) > 0, 1);
            assert!(coin::value(&coin_b) > 0, 2);
            
            // Check reserves decreased
            let (reserve_a_after, reserve_b_after) = pool::get_reserves(&pool);
            assert!(reserve_a_after < reserve_a_before, 3);
            assert!(reserve_b_after < reserve_b_before, 4);
            
            // Return tokens to user
            transfer::public_transfer(coin_a, USER1);
            transfer::public_transfer(coin_b, USER1);
            
            ts::return_shared(pool);
        };
        
        // Verify USER1 received tokens but NOT LP tokens
        ts::next_tx(&mut scenario, USER1);
        {
            // Should have received coins
            assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER1), 5);
            assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER1), 6);
            
            // Most importantly, verify NO LP tokens exist for USER1
            // This confirms our fix where we destroy the zero-balance LP token
            assert!(!ts::has_most_recent_for_address<LP<SUI, USDC>>(USER1), 7);
        };
        
        ts::end(scenario);
    }
    
    // Test removing partial liquidity works as expected
    #[test]
    fun test_remove_partial_liquidity() {
        let scenario = ts::begin(ADMIN);
        
        // Create a pool and add liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // Remove half the liquidity
        ts::next_tx(&mut scenario, USER1);
        {
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
            // Record initial balance
            let initial_balance = lp_token::balance(&lp_tokens);
            let half_amount = initial_balance / 2;
            
            // Split the LP tokens
            let split_lp = lp_token::split(&mut lp_tokens, half_amount, ts::ctx(&mut scenario));
            
            // Remove liquidity using the split portion
            let (coin_a, coin_b) = pool::remove_liquidity(
                &mut pool,
                split_lp, // This consumes the split LP tokens
                0,
                0,
                ts::ctx(&mut scenario)
            );
            
            // Check the original token has the remaining balance
            assert_eq(lp_token::balance(&lp_tokens), initial_balance - half_amount);
            
            // Return the tokens
            transfer::public_transfer(lp_tokens, USER1);
            transfer::public_transfer(coin_a, USER1);
            transfer::public_transfer(coin_b, USER1);
            
            ts::return_shared(pool);
        };
        
        // Verify USER1 still has LP tokens
        ts::next_tx(&mut scenario, USER1);
        {
            assert!(ts::has_most_recent_for_address<LP<SUI, USDC>>(USER1), 8);
            assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER1), 9);
            assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER1), 10);
        };
        
        ts::end(scenario);
    }
    
    // Test the router's remove_liquidity function with the updated pool logic
    #[test]
    fun test_router_remove_all_liquidity() {
        let scenario = ts::begin(ADMIN);
        
        // Create a pool and add liquidity
        setup_pool_with_liquidity(&mut scenario);
        
        // Remove all liquidity through the router
        ts::next_tx(&mut scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(&scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(&scenario);
            let lp_tokens = ts::take_from_sender<LP<SUI, USDC>>(&scenario);
            
            // Remove all liquidity (lp_amount = 0 means all)
            let (coin_a, coin_b, remaining_lp_opt) = router::remove_liquidity<SUI, USDC>(
                &factory,
                &mut pool,
                lp_tokens,
                0, // lp_amount = 0 means remove all
                0, // min amounts
                0,
                0, // deadline
                ts::ctx(&mut scenario)
            );
            
            // Verify we received tokens
            assert!(coin::value(&coin_a) > 0, 11);
            assert!(coin::value(&coin_b) > 0, 12);
            
            // Verify there are no remaining LP tokens
            assert!(option::is_none(&remaining_lp_opt), 13);
            
            // Return tokens
            transfer::public_transfer(coin_a, USER1);
            transfer::public_transfer(coin_b, USER1);
            option::destroy_none(remaining_lp_opt);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
        
        // Verify USER1 has no LP tokens
        ts::next_tx(&mut scenario, USER1);
        {
            assert!(ts::has_most_recent_for_address<Coin<SUI>>(USER1), 14);
            assert!(ts::has_most_recent_for_address<Coin<USDC>>(USER1), 15);
            assert!(!ts::has_most_recent_for_address<LP<SUI, USDC>>(USER1), 16);
        };
        
        ts::end(scenario);
    }
    
    // Helper function to create a pool and add liquidity
    fun setup_pool_with_liquidity(scenario: &mut Scenario) {
        // Create factory
        ts::next_tx(scenario, ADMIN);
        {
            factory::create_factory(ts::ctx(scenario));
        };
        
        // Create pool
        ts::next_tx(scenario, ADMIN);
        {
            let factory = ts::take_shared<DexFactory>(scenario);
            factory::create_pool<SUI, USDC>(&mut factory, ts::ctx(scenario));
            ts::return_shared(factory);
        };
        
        // Mint tokens for USER1
        ts::next_tx(scenario, ADMIN);
        {
            let sui_coin = coin::mint_for_testing<SUI>(10000000, ts::ctx(scenario));
            let usdc_coin = coin::mint_for_testing<USDC>(5000000, ts::ctx(scenario));
            
            transfer::public_transfer(sui_coin, USER1);
            transfer::public_transfer(usdc_coin, USER1);
        };
        
        // USER1 adds liquidity
        ts::next_tx(scenario, USER1);
        {
            let factory = ts::take_shared<DexFactory>(scenario);
            let pool = ts::take_shared<Pool<SUI, USDC>>(scenario);
            
            let sui_coin = ts::take_from_sender<Coin<SUI>>(scenario);
            let usdc_coin = ts::take_from_sender<Coin<USDC>>(scenario);
            
            // Add liquidity directly using pool module
            let lp_tokens = pool::add_liquidity(
                &mut pool,
                sui_coin,
                usdc_coin,
                0,
                0,
                ts::ctx(scenario)
            );
            
            transfer::public_transfer(lp_tokens, USER1);
            
            ts::return_shared(factory);
            ts::return_shared(pool);
        };
    }
}