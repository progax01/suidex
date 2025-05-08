module suidex::router {
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use suidex::factory::{Self, DexFactory};
    use suidex::pool::{Self, Pool};
    use suidex::lp_token::{LP};

    // Error codes
    const EPoolNotFound: u64 = 0;
    const EInsufficientAmountOut: u64 = 1;
    const EExcessiveInputAmount: u64 = 2;
    const EDeadlineExceeded: u64 = 3;
    const EZeroAmount: u64 = 4;

    /// Adds liquidity to a pool
    public fun add_liquidity<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_a: Coin<CoinTypeA>,
        coin_b: Coin<CoinTypeB>,
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): LP<CoinTypeA, CoinTypeB> {
        // Check if the pool exists in the factory
        let (exists, _) = factory::get_pool<CoinTypeA, CoinTypeB>(factory);
        assert!(exists, EPoolNotFound);
        
        // Check deadline
        assert!(tx_context::epoch(ctx) <= deadline, EDeadlineExceeded);
        
        // Delegate to pool module
        pool::add_liquidity(pool, coin_a, coin_b, amount_a_min, amount_b_min, ctx)
    }

    /// Removes liquidity from a pool
    public fun remove_liquidity<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        lp: LP<CoinTypeA, CoinTypeB>,
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): (Coin<CoinTypeA>, Coin<CoinTypeB>) {
        // Check if the pool exists in the factory
        let (exists, _) = factory::get_pool<CoinTypeA, CoinTypeB>(factory);
        assert!(exists, EPoolNotFound);
        
        // Check deadline
        assert!(tx_context::epoch(ctx) <= deadline, EDeadlineExceeded);
        
        // Delegate to pool module
        pool::remove_liquidity(pool, lp, amount_a_min, amount_b_min, ctx)
    }

    /// Swap exact amount of token A for token B
    public fun swap_exact_input<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_in: Coin<CoinTypeA>,
        amount_out_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): Coin<CoinTypeB> {
        // Check if the pool exists in the factory
        let (exists, _) = factory::get_pool<CoinTypeA, CoinTypeB>(factory);
        assert!(exists, EPoolNotFound);
        
        // Check deadline
        assert!(tx_context::epoch(ctx) <= deadline, EDeadlineExceeded);
        
        // Check that input amount is positive
        assert!(coin::value(&coin_in) > 0, EZeroAmount);
        
        // Create empty coins for the types we don't provide
        let coin_b_in = coin::zero<CoinTypeB>(ctx);
        
        // Delegate to pool module
        let (coin_a_out, coin_b_out) = pool::swap(
            pool,
            coin_in,
            coin_b_in,
            0, // We don't expect token A back
            amount_out_min,
            ctx
        );
        
        // We should get an empty coin for token A
        assert!(coin::value(&coin_a_out) == 0, EExcessiveInputAmount);
        transfer::public_transfer(coin_a_out, tx_context::sender(ctx));
        
        // Return the output token B
        coin_b_out
    }

    /// Swap token A for exact amount of token B
    public fun swap_exact_output<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_in: Coin<CoinTypeA>,
        amount_out: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): (Coin<CoinTypeB>, Coin<CoinTypeA>) {
        // Check if the pool exists in the factory
        let (exists, _) = factory::get_pool<CoinTypeA, CoinTypeB>(factory);
        assert!(exists, EPoolNotFound);
        
        // Check deadline
        assert!(tx_context::epoch(ctx) <= deadline, EDeadlineExceeded);
        
        // Check that input amount is positive
        assert!(coin::value(&coin_in) > 0, EZeroAmount);
        assert!(amount_out > 0, EZeroAmount);
        
        // Get current pool reserves
        let (reserve_a, reserve_b) = pool::get_reserves(pool);
        
        // Calculate how much input is needed to get the exact output
        let fee_bps = pool::get_fee_bps(pool);
        let numerator = reserve_a * amount_out * FEE_DENOMINATOR;
        let denominator = (reserve_b - amount_out) * (FEE_DENOMINATOR - fee_bps);
        let amount_in_required = (numerator / denominator) + 1; // +1 to handle rounding
        
        // Verify we have enough input token
        assert!(coin::value(&coin_in) >= amount_in_required, EInsufficientAmountOut);
        
        // Split the required amount from the input coin
        let coin_to_swap = coin::split(&mut coin_in, amount_in_required, ctx);
        
        // Create empty coins for the types we don't provide
        let coin_b_in = coin::zero<CoinTypeB>(ctx);
        
        // Delegate to pool module
        let (coin_a_out, coin_b_out) = pool::swap(
            pool,
            coin_to_swap,
            coin_b_in,
            0, // We don't expect token A back
            amount_out, // Exact amount we want out
            ctx
        );
        
        // We should get an empty coin for token A
        assert!(coin::value(&coin_a_out) == 0, EExcessiveInputAmount);
        transfer::public_transfer(coin_a_out, tx_context::sender(ctx));
        
        // Return both the output token B and the remaining input token A
        (coin_b_out, coin_in)
    }

    /// Utility function to calculate the amount that will be received for a given input
    public fun get_amount_out<CoinTypeA, CoinTypeB>(
        pool: &Pool<CoinTypeA, CoinTypeB>,
        amount_in: u64
    ): u64 {
        assert!(amount_in > 0, EZeroAmount);
        
        let (reserve_a, reserve_b) = pool::get_reserves(pool);
        let fee_bps = pool::get_fee_bps(pool);
        
        pool::get_amount_out(amount_in, reserve_a, reserve_b, fee_bps)
    }

    // Constants
    const FEE_DENOMINATOR: u64 = 10000;
} 