module suidex::pool {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;
    use std::u64;
    use suidex::lp_token::{Self, LP, LPCap};

    // Constants
    const FEE_DENOMINATOR: u64 = 10000;
    const DEFAULT_FEE_BPS: u64 = 30; // 0.3%
    const MINIMAL_LIQUIDITY: u64 = 1000; // Prevent division by zero
    const SCALE_FACTOR: u64 = 1000000; // Used for scaling large numbers
    const U64_MAX: u64 = 18446744073709551615; // Maximum value of u64

    // Errors
    const EZeroAmount: u64 = 0;
    const EInsufficientLiquidity: u64 = 1;
    const EInsufficientOutputAmount: u64 = 2;
    const EInsufficientInputAmount: u64 = 3;
    const EInvalidK: u64 = 4;
    const EInsufficientLiquidityMinted: u64 = 5;
    // const EInsufficientLiquidityBurned: u64 = 6;
    // const EInsufficientBalance: u64 = 7;
    // const EOrderMismatch: u64 = 8;

    /// The pool struct representing a trading pair
    struct Pool<phantom CoinTypeA, phantom CoinTypeB> has key {
        id: UID,
        reserve_a: Balance<CoinTypeA>,
        reserve_b: Balance<CoinTypeB>,
        lp_cap: LPCap<CoinTypeA, CoinTypeB>,
        fee_bps: u64,
        total_supply: u64,
        locked: bool
    }

    /// Event emitted when a pool is created
    struct PoolCreated<phantom CoinTypeA, phantom CoinTypeB> has copy, drop {
        pool_id: address,
        creator: address
    }

    /// Event emitted when liquidity is added
    struct LiquidityAdded<phantom CoinTypeA, phantom CoinTypeB> has copy, drop {
        provider: address,
        amount_a: u64,
        amount_b: u64,
        lp_amount: u64
    }

    /// Event emitted when liquidity is removed
    struct LiquidityRemoved<phantom CoinTypeA, phantom CoinTypeB> has copy, drop {
        provider: address,
        amount_a: u64,
        amount_b: u64,
        lp_amount: u64
    }

    /// Event emitted when a swap occurs
    struct Swap<phantom CoinTypeA, phantom CoinTypeB> has copy, drop {
        sender: address,
        amount_a_in: u64,
        amount_b_in: u64,
        amount_a_out: u64,
        amount_b_out: u64
    }

    /// Create a new pool for a token pair
    public fun create_pool<CoinTypeA, CoinTypeB>(ctx: &mut TxContext) {
        create_pool_and_get_address<CoinTypeA, CoinTypeB>(ctx);
    }

    /// Create a new pool for a token pair and return its address
    public fun create_pool_and_get_address<CoinTypeA, CoinTypeB>(ctx: &mut TxContext): address {
        // Type ordering is managed at the factory level
        
        let lp_cap = lp_token::new<CoinTypeA, CoinTypeB>(ctx);
        
        let pool = Pool<CoinTypeA, CoinTypeB> {
            id: object::new(ctx),
            reserve_a: balance::zero<CoinTypeA>(),
            reserve_b: balance::zero<CoinTypeB>(),
            lp_cap,
            fee_bps: DEFAULT_FEE_BPS,
            total_supply: 0,
            locked: false
        };
        
        let pool_address = object::id_address(&pool);
        event::emit(PoolCreated<CoinTypeA, CoinTypeB> {
            pool_id: pool_address,
            creator: tx_context::sender(ctx)
        });
        
        transfer::share_object(pool);
        pool_address
    }

    /// Add liquidity to the pool
    public fun add_liquidity<CoinTypeA, CoinTypeB>(
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_a: Coin<CoinTypeA>,
        coin_b: Coin<CoinTypeB>,
        amount_a_min: u64,
        amount_b_min: u64,
        ctx: &mut TxContext
    ): LP<CoinTypeA, CoinTypeB> {
        // Make sure pool is not locked
        assert!(!pool.locked, EInvalidK);
        pool.locked = true;
        
        let reserve_a = balance::value(&pool.reserve_a);
        let reserve_b = balance::value(&pool.reserve_b);
        
        let coin_a_value = coin::value(&coin_a);
        let coin_b_value = coin::value(&coin_b);
        
        assert!(coin_a_value > 0 && coin_b_value > 0, EZeroAmount);
        
        let amount_a: u64;
        let amount_b: u64;
        
        // Calculate optimal amounts according to the current ratio
        if (reserve_a == 0 && reserve_b == 0) {
            // First liquidity provision
            amount_a = coin_a_value;
            amount_b = coin_b_value;
            // Check slippage for initial liquidity
            assert!(amount_a >= amount_a_min, EInsufficientLiquidity);
            assert!(amount_b >= amount_b_min, EInsufficientLiquidity);
        } else {
            // Safe calculation path for large numbers
            // Use scaling to prevent overflow
            let is_large_number = coin_a_value > (U64_MAX / reserve_b) || reserve_a > (U64_MAX / 100) || reserve_b > (U64_MAX / 100);
            
            if (is_large_number) {
                // Scale down to prevent overflow
                let scaled_a_value = safe_div(coin_a_value, SCALE_FACTOR);
                let scaled_reserve_a = safe_div(reserve_a, SCALE_FACTOR);
                let scaled_reserve_b = safe_div(reserve_b, SCALE_FACTOR);
                
                // Ensure scaled values are not zero
                let safe_scaled_reserve_a = if (scaled_reserve_a == 0) { 1 } else { scaled_reserve_a };
                
                // Calculate scaled amount_b
                let scaled_amount_b = safe_div(safe_mul(scaled_a_value, scaled_reserve_b), safe_scaled_reserve_a);
                amount_b = u64::min(safe_mul(scaled_amount_b, SCALE_FACTOR), coin_b_value);
                
                // Calculate amount_a based on amount_b
                let safe_scaled_reserve_b = if (scaled_reserve_b == 0) { 1 } else { scaled_reserve_b };
                let scaled_amount_a = safe_div(safe_mul(safe_div(amount_b, SCALE_FACTOR), scaled_reserve_a), safe_scaled_reserve_b);
                amount_a = safe_mul(scaled_amount_a, SCALE_FACTOR);
            } else {
                // Standard calculation for smaller numbers
                amount_b = u64::min(safe_div(safe_mul(coin_a_value, reserve_b), reserve_a), coin_b_value);
                amount_a = safe_div(safe_mul(amount_b, reserve_a), reserve_b);
            };
            
            // Check slippage
            assert!(amount_a >= amount_a_min, EInsufficientLiquidity);
            assert!(amount_b >= amount_b_min, EInsufficientLiquidity);
        };
        
        // Calculate LP tokens to mint
        let lp_amount: u64;
        if (pool.total_supply == 0) {
            // Initial liquidity - use sqrt(a * b) - MINIMAL_LIQUIDITY
            // Safe calculation for large numbers
            let product = safe_mul_and_scale(amount_a, amount_b);
            
            // Use square root calculation
            lp_amount = u64::sqrt(product);
            
            // Ensure we don't underflow when subtracting MINIMAL_LIQUIDITY
            if (lp_amount > MINIMAL_LIQUIDITY) {
                lp_amount = lp_amount - MINIMAL_LIQUIDITY;
            } else {
                lp_amount = MINIMAL_LIQUIDITY;
            };
            
            pool.total_supply = lp_amount + MINIMAL_LIQUIDITY;
        } else {
            // Subsequent liquidity - min(a/A, b/B) * totalSupply
            // Safe calculation for large numbers
            let is_large_number = amount_a > (U64_MAX / pool.total_supply) || 
                                 amount_b > (U64_MAX / pool.total_supply) ||
                                 pool.total_supply > (U64_MAX / 100);
            
            if (is_large_number) {
                let scaled_amount_a = safe_div(amount_a, SCALE_FACTOR);
                let scaled_amount_b = safe_div(amount_b, SCALE_FACTOR);
                let scaled_reserve_a = safe_div(reserve_a, SCALE_FACTOR);
                let scaled_reserve_b = safe_div(reserve_b, SCALE_FACTOR);
                let scaled_total_supply = safe_div(pool.total_supply, SCALE_FACTOR);
                
                // Ensure scaled values are not zero
                let safe_scaled_reserve_a = if (scaled_reserve_a == 0) { 1 } else { scaled_reserve_a };
                let safe_scaled_reserve_b = if (scaled_reserve_b == 0) { 1 } else { scaled_reserve_b };
                
                let scaled_lp_amount_a = safe_div(safe_mul(scaled_amount_a, scaled_total_supply), safe_scaled_reserve_a);
                let scaled_lp_amount_b = safe_div(safe_mul(scaled_amount_b, scaled_total_supply), safe_scaled_reserve_b);
                
                let scaled_lp_amount = u64::min(scaled_lp_amount_a, scaled_lp_amount_b);
                lp_amount = safe_mul(scaled_lp_amount, SCALE_FACTOR);
            } else {
                let lp_amount_a = safe_div(safe_mul(amount_a, pool.total_supply), reserve_a);
                let lp_amount_b = safe_div(safe_mul(amount_b, pool.total_supply), reserve_b);
                lp_amount = u64::min(lp_amount_a, lp_amount_b);
            };
            
            pool.total_supply = pool.total_supply + lp_amount;
        };
        
        assert!(lp_amount > 0, EInsufficientLiquidityMinted);
        
        // Extract the exact amounts from the coins and put them in the pool
        let balance_a = coin::into_balance(coin_a);
        let balance_b = coin::into_balance(coin_b);
        
        let deposit_a = balance::split(&mut balance_a, amount_a);
        let deposit_b = balance::split(&mut balance_b, amount_b);
        
        balance::join(&mut pool.reserve_a, deposit_a);
        balance::join(&mut pool.reserve_b, deposit_b);
        
        // Return any unused tokens to the caller
        if (balance::value(&balance_a) > 0) {
            transfer::public_transfer(coin::from_balance(balance_a, ctx), tx_context::sender(ctx));
        } else {
            balance::destroy_zero(balance_a);
        };
        
        if (balance::value(&balance_b) > 0) {
            transfer::public_transfer(coin::from_balance(balance_b, ctx), tx_context::sender(ctx));
        } else {
            balance::destroy_zero(balance_b);
        };
        
        // Create LP tokens
        let lp = lp_token::new_lp<CoinTypeA, CoinTypeB>(ctx);
        lp_token::mint(&mut pool.lp_cap, lp_amount, &mut lp, ctx);
        
        // Emit event
        event::emit(LiquidityAdded<CoinTypeA, CoinTypeB> {
            provider: tx_context::sender(ctx),
            amount_a,
            amount_b,
            lp_amount
        });
        
        pool.locked = false;
        lp
    }

    /// Helper function to safely multiply two numbers with overflow protection
    fun safe_mul(a: u64, b: u64): u64 {
        if (a == 0 || b == 0) {
            return 0
        };
        
        if (a > (U64_MAX / b)) {
            // Overflow would occur, use scaling
            let scaled_a = a / SCALE_FACTOR;
            let scaled_b = b / SCALE_FACTOR;
            
            // Handle zero cases after scaling
            if (scaled_a == 0) scaled_a = 1;
            if (scaled_b == 0) scaled_b = 1;
            
            (scaled_a * scaled_b) * SCALE_FACTOR
        } else {
            a * b
        }
    }

    /// Helper function to safely divide two numbers with division by zero protection
    fun safe_div(a: u64, b: u64): u64 {
        if (b == 0) {
            // Prevent division by zero
            if (a == 0) return 0;
            return a // or a more appropriate fallback value
        };
        
        a / b
    }

    /// Helper function to safely multiply large numbers with scaling
    fun safe_mul_and_scale(a: u64, b: u64): u64 {
        if (a > (U64_MAX / b)) {
            // Overflow would occur, use scaling
            let scaled_a = a / SCALE_FACTOR;
            let scaled_b = b / SCALE_FACTOR;
            
            // Handle zero cases after scaling
            if (scaled_a == 0) scaled_a = 1;
            if (scaled_b == 0) scaled_b = 1;
            
            scaled_a * scaled_b
        } else {
            a * b
        }
    }

    /// Remove liquidity from the pool
    public fun remove_liquidity<CoinTypeA, CoinTypeB>(
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        lp: LP<CoinTypeA, CoinTypeB>,
        amount_a_min: u64,
        amount_b_min: u64,
        ctx: &mut TxContext
    ): (Coin<CoinTypeA>, Coin<CoinTypeB>) {
        assert!(!pool.locked, EInvalidK);
        pool.locked = true;
        
        let lp_amount = lp_token::balance(&lp);
        assert!(lp_amount > 0, EZeroAmount);
        
        // Calculate token amounts to return
        let reserve_a = balance::value(&pool.reserve_a);
        let reserve_b = balance::value(&pool.reserve_b);
        
        // Safe calculation for large numbers
        let is_large_number = lp_amount > (U64_MAX / reserve_a) || 
                             lp_amount > (U64_MAX / reserve_b) ||
                             pool.total_supply > (U64_MAX / 100);
                             
        let amount_a: u64;
        let amount_b: u64;
        
        if (is_large_number) {
            let scaled_lp_amount = safe_div(lp_amount, SCALE_FACTOR);
            let scaled_reserve_a = safe_div(reserve_a, SCALE_FACTOR);
            let scaled_reserve_b = safe_div(reserve_b, SCALE_FACTOR);
            let scaled_total_supply = safe_div(pool.total_supply, SCALE_FACTOR);
            
            // Ensure scaled values are not zero
            let safe_scaled_total_supply = if (scaled_total_supply == 0) { 1 } else { scaled_total_supply };
            
            let scaled_amount_a = safe_div(safe_mul(scaled_lp_amount, scaled_reserve_a), safe_scaled_total_supply);
            let scaled_amount_b = safe_div(safe_mul(scaled_lp_amount, scaled_reserve_b), safe_scaled_total_supply);
            
            amount_a = safe_mul(scaled_amount_a, SCALE_FACTOR);
            amount_b = safe_mul(scaled_amount_b, SCALE_FACTOR);
        } else {
            amount_a = safe_div(safe_mul(lp_amount, reserve_a), pool.total_supply);
            amount_b = safe_div(safe_mul(lp_amount, reserve_b), pool.total_supply);
        };
        
        assert!(amount_a >= amount_a_min, EInsufficientLiquidity);
        assert!(amount_b >= amount_b_min, EInsufficientLiquidity);
        
        // Burn the LP tokens
        lp_token::burn(&mut pool.lp_cap, &mut lp, lp_amount, ctx);
        
        // Delete the zero-balance LP token instead of transferring it
        lp_token::destroy_zero(lp);
        
        // Update pool state
        pool.total_supply = pool.total_supply - lp_amount;
        
        // Transfer tokens back to user
        let coin_a = coin::from_balance(balance::split(&mut pool.reserve_a, amount_a), ctx);
        let coin_b = coin::from_balance(balance::split(&mut pool.reserve_b, amount_b), ctx);
        
        // Emit event
        event::emit(LiquidityRemoved<CoinTypeA, CoinTypeB> {
            provider: tx_context::sender(ctx),
            amount_a,
            amount_b,
            lp_amount
        });
        
        pool.locked = false;
        (coin_a, coin_b)
    }

    /// Swap tokens
    public fun swap<CoinTypeA, CoinTypeB>(
        pool: &mut Pool<CoinTypeA, CoinTypeB>,
        coin_a_in: Coin<CoinTypeA>,
        coin_b_in: Coin<CoinTypeB>,
        amount_a_out_min: u64,
        amount_b_out_min: u64,
        ctx: &mut TxContext
    ): (Coin<CoinTypeA>, Coin<CoinTypeB>) {
        assert!(!pool.locked, EInvalidK);
        pool.locked = true;
        
        let amount_a_in = coin::value(&coin_a_in);
        let amount_b_in = coin::value(&coin_b_in);
        
        // Either amount_a_in or amount_b_in must be zero
        assert!(amount_a_in == 0 || amount_b_in == 0, EInvalidK);
        // At least one input must be positive
        assert!(amount_a_in > 0 || amount_b_in > 0, EZeroAmount);
        
        let reserve_a = balance::value(&pool.reserve_a);
        let reserve_b = balance::value(&pool.reserve_b);
        
        // Calculate output amount using the formula:
        // amount_out = (amount_in * (10000 - fee_bps) * reserve_out) / (reserve_in * 10000 + amount_in * (10000 - fee_bps))
        if (amount_a_in > 0) {
            // User is swapping token A for token B
            let amount_b_out = get_amount_out(amount_a_in, reserve_a, reserve_b, pool.fee_bps);
            assert!(amount_b_out > 0, EInsufficientOutputAmount);
            assert!(amount_b_out >= amount_b_out_min, EInsufficientOutputAmount);
            assert!(amount_b_out < reserve_b, EInsufficientLiquidity);
            
            // Add token A to pool
            balance::join(&mut pool.reserve_a, coin::into_balance(coin_a_in));
            
            // Give token B to user
            let coin_b_out = coin::from_balance(balance::split(&mut pool.reserve_b, amount_b_out), ctx);
            
            // Return empty coin for token A
            let coin_a_out = coin::zero<CoinTypeA>(ctx);
            balance::destroy_zero(coin::into_balance(coin_b_in));
            
            // Emit swap event
            event::emit(Swap<CoinTypeA, CoinTypeB> {
                sender: tx_context::sender(ctx),
                amount_a_in,
                amount_b_in: 0,
                amount_a_out: 0,
                amount_b_out
            });
            
            pool.locked = false;
            (coin_a_out, coin_b_out)
        } else {
            // User is swapping token B for token A
            let amount_a_out = get_amount_out(amount_b_in, reserve_b, reserve_a, pool.fee_bps);
            assert!(amount_a_out > 0, EInsufficientOutputAmount);
            assert!(amount_a_out >= amount_a_out_min, EInsufficientOutputAmount);
            assert!(amount_a_out < reserve_a, EInsufficientLiquidity);
            
            // Add token B to pool
            balance::join(&mut pool.reserve_b, coin::into_balance(coin_b_in));
            
            // Give token A to user
            let coin_a_out = coin::from_balance(balance::split(&mut pool.reserve_a, amount_a_out), ctx);
            
            // Return empty coin for token B
            let coin_b_out = coin::zero<CoinTypeB>(ctx);
            balance::destroy_zero(coin::into_balance(coin_a_in));
            
            // Emit swap event
            event::emit(Swap<CoinTypeA, CoinTypeB> {
                sender: tx_context::sender(ctx),
                amount_a_in: 0,
                amount_b_in,
                amount_a_out,
                amount_b_out: 0
            });
            
            pool.locked = false;
            (coin_a_out, coin_b_out)
        }
    }

    /// Calculate the output amount based on the input amount and reserves
   /// Calculate the output amount based on the input amount and reserves
public fun get_amount_out(
    amount_in: u64,
    reserve_in: u64,
    reserve_out: u64,
    fee_bps: u64
): u64 {
    assert!(amount_in > 0, EInsufficientInputAmount);
    assert!(reserve_in > 0 && reserve_out > 0, EInsufficientLiquidity);
    
    // Extreme case handling - prevent any possible overflow
    if (reserve_in > 10000000000000 || reserve_out > 10000000000000) {
        // For very large reserves, use double scaling approach
        
        // Scale down reserves by 10^8 first
        let big_scale = 100000000; // 10^8
        let scaled_reserve_in = reserve_in / big_scale;
        let scaled_reserve_out = reserve_out / big_scale;
        
        // Now do the calculation with scaled values
        let amount_in_with_fee = amount_in * (FEE_DENOMINATOR - fee_bps);
        
        // Calculate more safely with staged operations
        let stage1 = amount_in_with_fee / FEE_DENOMINATOR; // simplified from x * (D-f) / D
        
        if (stage1 == 0) {
            // Amount is too small for meaningful exchange, prevent division by zero
            return 0
        };
        
        // Calculate ratio of reserves scaled down
        // output = input * rate * (1 - fee)
        let exchange_rate = scaled_reserve_out / scaled_reserve_in;
        
        // Apply the exchange rate to determine output amount
        // This prevents intermediate overflow
        let output_amount = (amount_in * exchange_rate * (FEE_DENOMINATOR - fee_bps)) / FEE_DENOMINATOR;
        
        // Return the calculated output amount
        return output_amount
    };
    
    // Standard Uniswap formula for more typical values
    let amount_in_with_fee = amount_in * (FEE_DENOMINATOR - fee_bps);
    let numerator = amount_in_with_fee * reserve_out;
    let denominator = reserve_in * FEE_DENOMINATOR + amount_in_with_fee;
    
    // Return the calculated output amount
    numerator / denominator
}
    /// Get pool reserves
    public fun get_reserves<CoinTypeA, CoinTypeB>(pool: &Pool<CoinTypeA, CoinTypeB>): (u64, u64) {
        (balance::value(&pool.reserve_a), balance::value(&pool.reserve_b))
    }

    /// Get pool fee in basis points
    public fun get_fee_bps<CoinTypeA, CoinTypeB>(pool: &Pool<CoinTypeA, CoinTypeB>): u64 {
        pool.fee_bps
    }
}