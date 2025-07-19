module suidex::router {
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use std::option::{Self, Option}; // Add this import
    use suidex::factory::{Self, DexFactory};
    use suidex::pool::{Self, Pool};
    use suidex::lp_token::{Self, LP};

    // Error codes
    const EPoolNotFound: u64 = 0;
    const EInsufficientAmountOut: u64 = 1;
    const EExcessiveInputAmount: u64 = 2;
    const EDeadlineExceeded: u64 = 3;
    const EZeroAmount: u64 = 4;

    /// Internal function to add liquidity to a pool
    fun add_liquidity_internal<CoinTypeA, CoinTypeB>(
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

    /// Adds liquidity to a pool and returns the LP token
    /// This function is for other modules to use
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
        add_liquidity_internal(factory, pool, coin_a, coin_b, amount_a_min, amount_b_min, deadline, ctx)
    }

    /// Entry function for adding liquidity, always transfers the LP token to the sender
    public entry fun add_liquidity_and_transfer<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_a: Coin<CoinTypeA>,
        coin_b: Coin<CoinTypeB>,
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ) {
        let lp = add_liquidity_internal(
            factory,
            pool,
            coin_a,
            coin_b,
            amount_a_min,
            amount_b_min,
            deadline,
            ctx
        );
        
        // Transfer the LP token to the sender
        lp_token::transfer(lp, tx_context::sender(ctx));
    }

    /// Internal function to remove liquidity from a pool with option for partial removal
    /// If lp_amount is 0, removes all liquidity from the LP token
    /// Otherwise, removes the specified amount of liquidity
    fun remove_liquidity_internal<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        lp: LP<CoinTypeA, CoinTypeB>,
        lp_amount: u64,  // Amount of LP tokens to burn (0 means all)
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): (Coin<CoinTypeA>, Coin<CoinTypeB>, Option<LP<CoinTypeA, CoinTypeB>>) {
        // Check if the pool exists in the factory
        let (exists, _) = factory::get_pool<CoinTypeA, CoinTypeB>(factory);
        assert!(exists, EPoolNotFound);
        
        // Check deadline
        assert!(tx_context::epoch(ctx) <= deadline, EDeadlineExceeded);
        
        let total_lp_amount = lp_token::balance(&lp);
        assert!(total_lp_amount > 0, EZeroAmount);
        
        // If lp_amount is 0 or greater than/equal to total, remove all
        if (lp_amount == 0 || lp_amount >= total_lp_amount) {
            // Use the entire LP token directly
            let (coin_a, coin_b) = pool::remove_liquidity(
                pool,
                lp,
                amount_a_min,
                amount_b_min,
                ctx
            );
            (coin_a, coin_b, option::none())
        } else {
            // Partial removal - split the LP token
            let split_lp = lp_token::split(&mut lp, lp_amount, ctx);
            
            // Remove liquidity with the split portion
            let (coin_a, coin_b) = pool::remove_liquidity(
                pool,
                split_lp,
                amount_a_min,
                amount_b_min,
                ctx
            );
            
            // Return coins and remaining LP token
            (coin_a, coin_b, option::some(lp))
        }
    }

    /// Removes liquidity from a pool and returns the coins
    /// If lp_amount is 0, removes all liquidity
    /// Otherwise, removes the specified amount and returns remaining LP tokens
    public fun remove_liquidity<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        lp: LP<CoinTypeA, CoinTypeB>,
        lp_amount: u64,
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): (Coin<CoinTypeA>, Coin<CoinTypeB>, Option<LP<CoinTypeA, CoinTypeB>>) {
        remove_liquidity_internal(factory, pool, lp, lp_amount, amount_a_min, amount_b_min, deadline, ctx)
    }

    /// Entry function for removing liquidity, always transfers coins and remaining LP to the sender
    public entry fun remove_liquidity_and_transfer<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        lp: LP<CoinTypeA, CoinTypeB>,
        lp_amount: u64,  // Amount of LP tokens to burn (0 means all)
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ) {
        let (coin_a, coin_b, remaining_lp_opt) = remove_liquidity_internal(
            factory,
            pool,
            lp,
            lp_amount,
            amount_a_min,
            amount_b_min,
            deadline,
            ctx
        );
        
        // Transfer both coins to the sender
        transfer::public_transfer(coin_a, tx_context::sender(ctx));
        transfer::public_transfer(coin_b, tx_context::sender(ctx));
        
        // If there's a remaining LP token, transfer it back to the sender
        if (option::is_some(&remaining_lp_opt)) {
            let remaining_lp = option::extract(&mut remaining_lp_opt);
            transfer::public_transfer(remaining_lp, tx_context::sender(ctx));
        };
        
        option::destroy_none(remaining_lp_opt);
    }

    /// Internal function to swap exact amount of token A for token B
    fun swap_exact_input_internal<CoinTypeA, CoinTypeB>(
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

    /// Swap exact amount of token A for token B
    /// This function is for other modules to use
    public fun swap_exact_input<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_in: Coin<CoinTypeA>,
        amount_out_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): Coin<CoinTypeB> {
        swap_exact_input_internal(factory, pool, coin_in, amount_out_min, deadline, ctx)
    }

    /// Entry function for swapping exact input, always transfers output to sender
    public entry fun swap_exact_input_and_transfer<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_in: Coin<CoinTypeA>,
        amount_out_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ) {
        let coin_out = swap_exact_input_internal(
            factory,
            pool,
            coin_in,
            amount_out_min,
            deadline,
            ctx
        );
        
        // Transfer output coin to sender
        transfer::public_transfer(coin_out, tx_context::sender(ctx));
    }

    /// Entry function for swapping exact input B to A, always transfers output to sender
    public entry fun swap_exact_input_b_to_a_and_transfer<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_b_in: Coin<CoinTypeB>,
        amount_a_out_min: u64,
        deadline: u64,
        ctx: &mut TxContext
    ) {
        // Check if the pool exists in the factory
        let (exists, _) = factory::get_pool<CoinTypeA, CoinTypeB>(factory);
        assert!(exists, EPoolNotFound);
        
        // Check deadline
        assert!(tx_context::epoch(ctx) <= deadline, EDeadlineExceeded);
        
        // Check that input amount is positive
        assert!(coin::value(&coin_b_in) > 0, EZeroAmount);
        
        // Create zero coin for A (required by pool swap interface)
        let coin_a_in = coin::zero<CoinTypeA>(ctx);
        
        // Perform the swap: B -> A
        let (coin_a_out, coin_b_out) = pool::swap(
            pool,
            coin_a_in,          // Must provide both coins, A is zero
            coin_b_in,          // B is the actual input
            amount_a_out_min,   // Minimum A tokens we want out
            0,                  // We don't expect any B tokens back
            ctx
        );
        
        // Transfer A tokens to the sender
        transfer::public_transfer(coin_a_out, tx_context::sender(ctx));
        
        // Destroy the empty B coin returned by swap
        coin::destroy_zero(coin_b_out);
    }

    /// Internal function to swap token A for exact amount of token B
    fun swap_exact_output_internal<CoinTypeA, CoinTypeB>(
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

    /// Swap token A for exact amount of token B
    /// This function is for other modules to use
    public fun swap_exact_output<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_in: Coin<CoinTypeA>,
        amount_out: u64,
        deadline: u64,
        ctx: &mut TxContext
    ): (Coin<CoinTypeB>, Coin<CoinTypeA>) {
        swap_exact_output_internal(factory, pool, coin_in, amount_out, deadline, ctx)
    }

    /// Entry function for swapping exact output, always transfers output to sender
    public entry fun swap_exact_output_and_transfer<CoinTypeA, CoinTypeB>(
        factory: &DexFactory,
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_in: Coin<CoinTypeA>,
        amount_out: u64,
        deadline: u64,
        ctx: &mut TxContext
    ) {
        let (coin_b_out, coin_a_remaining) = swap_exact_output_internal(
            factory,
            pool,
            coin_in,
            amount_out,
            deadline,
            ctx
        );
        
        // Transfer output and remaining coins to sender
        transfer::public_transfer(coin_b_out, tx_context::sender(ctx));
        transfer::public_transfer(coin_a_remaining, tx_context::sender(ctx));
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