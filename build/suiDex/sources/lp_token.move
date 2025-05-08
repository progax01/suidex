module suidex::lp_token {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::balance::{Self, Supply};
    use sui::event;

    /// LP Token for the DEX
    struct LP<phantom X, phantom Y> has key, store {
        id: UID,
        balance: u64
    }

    /// Type for LP token logic
    struct LPToken<phantom X, phantom Y> has drop {}

    /// Capability allowing the pool to mint and burn LP tokens
    struct LPCap<phantom X, phantom Y> has key, store {
        id: UID,
        supply: Supply<LPToken<X, Y>>
    }

    /// Event emitted when LP tokens are minted
    struct LPMinted<phantom X, phantom Y> has copy, drop {
        amount: u64,
        recipient: address
    }

    /// Event emitted when LP tokens are burned
    struct LPBurned<phantom X, phantom Y> has copy, drop {
        amount: u64,
        recipient: address
    }

    /// Initialize a new LP token for a token pair
    public fun new<X, Y>(ctx: &mut TxContext): LPCap<X, Y> {
        LPCap<X, Y> {
            id: object::new(ctx),
            supply: balance::create_supply(LPToken<X, Y> {})
        }
    }

    /// Create a new empty LP token object
    public fun new_lp<X, Y>(ctx: &mut TxContext): LP<X, Y> {
        LP<X, Y> {
            id: object::new(ctx),
            balance: 0
        }
    }

    /// Mint new LP tokens
    public fun mint<X, Y>(
        cap: &mut LPCap<X, Y>, 
        amount: u64, 
        recipient: &mut LP<X, Y>, 
        ctx: &mut TxContext
    ) {
        let balance = balance::increase_supply(&mut cap.supply, amount);
        let value = balance::value(&balance);
        balance::destroy_zero(balance);
        
        recipient.balance = recipient.balance + value;
        
        event::emit(LPMinted<X, Y> {
            amount,
            recipient: tx_context::sender(ctx)
        });
    }

    /// Burn LP tokens
    public fun burn<X, Y>(
        cap: &mut LPCap<X, Y>, 
        lp: &mut LP<X, Y>, 
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(lp.balance >= amount, 0);
        lp.balance = lp.balance - amount;
        
        // Create a zero balance and increase it to the amount we want to burn
        let zero_balance = balance::zero<LPToken<X, Y>>();
        let burn_balance = balance::increase_supply(&mut cap.supply, amount);
        
        // Decrease the supply using the created balance
        balance::decrease_supply(&mut cap.supply, burn_balance);
        balance::destroy_zero(zero_balance);
        
        event::emit(LPBurned<X, Y> {
            amount,
            recipient: tx_context::sender(ctx)
        });
    }

    /// Get the balance of LP tokens
    public fun balance<X, Y>(lp: &LP<X, Y>): u64 {
        lp.balance
    }

    /// Split LP tokens
    public fun split<X, Y>(
        lp: &mut LP<X, Y>, 
        amount: u64, 
        ctx: &mut TxContext
    ): LP<X, Y> {
        assert!(lp.balance >= amount, 0);
        lp.balance = lp.balance - amount;
        
        LP<X, Y> {
            id: object::new(ctx),
            balance: amount
        }
    }

    /// Join (merge) LP tokens
    public fun join<X, Y>(lp: &mut LP<X, Y>, other: LP<X, Y>) {
        let LP { id, balance } = other;
        object::delete(id);
        lp.balance = lp.balance + balance;
    }

    /// Transfer LP tokens to an address
    public fun transfer<X, Y>(lp: LP<X, Y>, recipient: address) {
        transfer::transfer(lp, recipient);
    }

    /// Get the total supply of LP tokens
    public fun total_supply<X, Y>(cap: &LPCap<X, Y>): u64 {
        balance::supply_value(&cap.supply)
    }
} 