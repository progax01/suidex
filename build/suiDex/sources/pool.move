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

    // Errors
    const EZeroAmount: u64 = 0;
    const EInsufficientLiquidity: u64 = 1;
    const EInsufficientOutputAmount: u64 = 2;
    const EInsufficientInputAmount: u64 = 3;
    const EInvalidK: u64 = 4;
    const EInsufficientLiquidityMinted: u64 = 5;
    const EInsufficientLiquidityBurned: u64 = 6;
    const EInsufficientBalance: u64 = 7;
    const EOrderMismatch: u64 = 8;

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
        } else {
            // Calculate amounts based on the ratio
            amount_b = u64::min((coin_a_value * reserve_b) / reserve_a, coin_b_value);
            amount_a = (amount_b * reserve_a) / reserve_b;
            
            // Check slippage
            assert!(amount_a >= amount_a_min, EInsufficientLiquidity);
            assert!(amount_b >= amount_b_min, EInsufficientLiquidity);
        };
        
        // Calculate LP tokens to mint
        let lp_amount: u64;
        if (pool.total_supply == 0) {
            // Initial liquidity - use sqrt(a * b) - MINIMAL_LIQUIDITY
            lp_amount = u64::sqrt(amount_a * amount_b) - MINIMAL_LIQUIDITY;
            pool.total_supply = lp_amount + MINIMAL_LIQUIDITY;
        } else {
            // Subsequent liquidity - min(a/A, b/B) * totalSupply
            let lp_amount_a = (amount_a * pool.total_supply) / reserve_a;
            let lp_amount_b = (amount_b * pool.total_supply) / reserve_b;
            lp_amount = u64::min(lp_amount_a, lp_amount_b);
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
        
        let amount_a = (lp_amount * reserve_a) / pool.total_supply;
        let amount_b = (lp_amount * reserve_b) / pool.total_supply;
        
        assert!(amount_a >= amount_a_min, EInsufficientLiquidity);
        assert!(amount_b >= amount_b_min, EInsufficientLiquidity);
        
        // Burn the LP tokens
        lp_token::burn(&mut pool.lp_cap, &mut lp, lp_amount, ctx);
        lp_token::transfer(lp, tx_context::sender(ctx));
        
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
        
        let amount_a_out = 0;
        let amount_b_out = 0;
        
        // Calculate output amount using the formula:
        // amount_out = (amount_in * (10000 - fee_bps) * reserve_out) / (reserve_in * 10000 + amount_in * (10000 - fee_bps))
        if (amount_a_in > 0) {
            // User is swapping token A for token B
            amount_b_out = get_amount_out(amount_a_in, reserve_a, reserve_b, pool.fee_bps);
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
            amount_a_out = get_amount_out(amount_b_in, reserve_b, reserve_a, pool.fee_bps);
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
    public fun get_amount_out(
        amount_in: u64,
        reserve_in: u64,
        reserve_out: u64,
        fee_bps: u64
    ): u64 {
        assert!(amount_in > 0, EInsufficientInputAmount);
        assert!(reserve_in > 0 && reserve_out > 0, EInsufficientLiquidity);
        
        let amount_in_with_fee = amount_in * (FEE_DENOMINATOR - fee_bps);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * FEE_DENOMINATOR + amount_in_with_fee;
        
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