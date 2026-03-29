#pragma once
#include <vector>
#include <cstdint>
#include <array>
#include <utility>
#include <string>

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

struct FillReport {
    uint64_t filled;
    uint64_t total_cost;
};

class PolymarketBook {
    std::array<PriceLevel, 100> yes_book;
    std::array<PriceLevel, 100> no_book;
    
public:
    MarketState state = MarketState::Open; 

    PolymarketBook() {
        for (auto& level : yes_book) level.orders.reserve(8192);
        for (auto& level : no_book) level.orders.reserve(8192);
    }

    inline void resolve_market(const Side winning_side) {
        if (state != MarketState::Open) return; 

        state = (winning_side == Side::Yes) ? MarketState::ResolvedYes : MarketState::ResolvedNo;

        for (int i = 0; i < 100; ++i) {
            yes_book[i].orders.clear();
            yes_book[i].head = 0;
            no_book[i].orders.clear();
            no_book[i].head = 0;
        }
    }

    inline FillReport submit(const Side side, const uint64_t price, Order&& o) {
        if (state != MarketState::Open) return {0, 0}; 

        std::array<PriceLevel, 100>& opp_book = (side == Side::Yes) ? no_book : yes_book;
        std::array<PriceLevel, 100>& own_book = (side == Side::Yes) ? yes_book : no_book;
        
        const uint64_t opp_price = 100 - price;
        uint64_t total_filled = 0;
        uint64_t total_cost = 0;

        for (uint64_t p = 1; p <= opp_price && o.quantity > 0; ++p) {
            PriceLevel& level = opp_book[p];
            const size_t len = level.orders.size();
            
            while (level.head < len && o.quantity > 0) {
                Order& top = level.orders[level.head];
                const uint64_t fill = (o.quantity < top.quantity) ? o.quantity : top.quantity;
                
                o.quantity -= fill;
                top.quantity -= fill;
                total_filled += fill;
                total_cost += fill * p;
                
                level.head += (top.quantity == 0);
            }
        }

        if (o.quantity > 0) {
            own_book[price].orders.emplace_back(std::move(o));
        }
        return {total_filled, total_cost};
    }

    inline std::string get_depth_json() const {
        std::string res = "{\"yes\":[";
        bool first = true;
        for (int p = 99; p >= 1; --p) {
            uint64_t v = 0;
            for (size_t i = yes_book[p].head; i < yes_book[p].orders.size(); ++i) {
                v += yes_book[p].orders[i].quantity;
            }
            if (v > 0) {
                if (!first) res += ",";
                res += "{\"price\":" + std::to_string(p) + ",\"volume\":" + std::to_string(v) + "}";
                first = false;
            }
        }
        res += "],\"no\":[";
        first = true;
        for (int p = 99; p >= 1; --p) {
            uint64_t v = 0;
            for (size_t i = no_book[p].head; i < no_book[p].orders.size(); ++i) {
                v += no_book[p].orders[i].quantity;
            }
            if (v > 0) {
                if (!first) res += ",";
                res += "{\"price\":" + std::to_string(p) + ",\"volume\":" + std::to_string(v) + "}";
                first = false;
            }
        }
        res += "]}";
        return res;
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

    inline FillReport process_trade_execution(const uint64_t market_id, const Side side, const uint64_t price, Order&& o) {
        if (market_id < markets.size()) {
            return markets[market_id].submit(side, price, std::move(o));
        }
        return {0, 0};
    }

    // 5. ADDED: Wrapper so your API endpoint can call engine.resolve_market(id, side)
    inline void resolve_market(const uint64_t market_id, const Side winning_side) {
        if (market_id < markets.size()) {
            markets[market_id].resolve_market(winning_side);
        }
    }

    inline std::string get_market_depth_json(const uint64_t market_id) const {
        if (market_id < markets.size()) {
            return markets[market_id].get_depth_json();
        }
        return "{\"yes\":[],\"no\":[]}";
    }
};
