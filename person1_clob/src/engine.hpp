#pragma once
#include <vector>
#include <cstdint>
#include <array>
#include <utility>

enum class Side : uint8_t { Yes, No };

enum class MarketState : uint8_t { Open, ResolvedYes, ResolvedNo }; 

struct Order {
    uint64_t id;
    uint64_t persona_id;
    uint64_t quantity;
};

struct PriceLevel {
    std::vector<Order> orders;
    size_t head = 0;
};

class PolymarketBook {
    std::array<PriceLevel, 100> yes_book;
    std::array<PriceLevel, 100> no_book;
    
public:
    // 2. ADDED: Keep track of this market's state
    MarketState state = MarketState::Open; 

    PolymarketBook() {
        for (auto& level : yes_book) level.orders.reserve(8192);
        for (auto& level : no_book) level.orders.reserve(8192);
    }

    // 3. ADDED: The resolution logic to freeze and clear the book
    inline void resolve_market(const Side winning_side) {
        if (state != MarketState::Open) return; // Already resolved

        state = (winning_side == Side::Yes) ? MarketState::ResolvedYes : MarketState::ResolvedNo;

        for (int i = 0; i < 100; ++i) {
            yes_book[i].orders.clear();
            yes_book[i].head = 0;
            no_book[i].orders.clear();
            no_book[i].head = 0;
        }
    }

    inline void submit(const Side side, const uint64_t price, Order&& o) {
        if (state != MarketState::Open) return; 

        std::array<PriceLevel, 100>& opp_book = (side == Side::Yes) ? no_book : yes_book;
        std::array<PriceLevel, 100>& own_book = (side == Side::Yes) ? yes_book : no_book;
        
        const uint64_t opp_price = 100 - price;

        for (uint64_t p = 1; p <= opp_price && o.quantity > 0; ++p) {
            PriceLevel& level = opp_book[p];
            const size_t len = level.orders.size();
            
            while (level.head < len && o.quantity > 0) {
                Order& top = level.orders[level.head];
                const uint64_t fill = (o.quantity < top.quantity) ? o.quantity : top.quantity;
                
                o.quantity -= fill;
                top.quantity -= fill;
                
                level.head += (top.quantity == 0);
            }
        }

        if (o.quantity > 0) {
            own_book[price].orders.emplace_back(std::move(o));
        }
    }
}; // <-- FIXED: You were missing this closing brace and semicolon!

class Engine {
    std::vector<PolymarketBook> markets;

public:
    Engine() {
        markets.reserve(1024);
    }

    inline void init_markets(const size_t count) {
        markets.resize(count);
    }

    inline void process_trade_execution(const uint64_t market_id, const Side side, const uint64_t price, Order&& o) {
        if (market_id < markets.size()) {
            markets[market_id].submit(side, price, std::move(o));
        }
    }

    // 5. ADDED: Wrapper so your API endpoint can call engine.resolve_market(id, side)
    inline void resolve_market(const uint64_t market_id, const Side winning_side) {
        if (market_id < markets.size()) {
            markets[market_id].resolve_market(winning_side);
        }
    }
};