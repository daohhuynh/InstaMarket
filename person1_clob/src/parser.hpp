#pragma once
#include <array>
#include <cstdint>
#include <string_view>
#include <charconv>

struct ParsedPayload {
    uint64_t market_id;
    uint64_t persona_id;
    uint64_t price;
    uint64_t quantity;
    uint8_t side; 
};

class ZeroAllocJsonParser {
    std::array<char, 8192> buffer;
    size_t buffer_len = 0;

public:
    inline constexpr void load_chunk(const std::string_view chunk) {
        const size_t copy_len = (chunk.size() < 8192) ? chunk.size() : 8192;
        __builtin_memcpy(buffer.data(), chunk.data(), copy_len);
        buffer_len = copy_len;
    }

    inline constexpr ParsedPayload parse_trade() const {
        ParsedPayload payload{0, 0, 0, 0, 0};
        const std::string_view view(buffer.data(), buffer_len);

        auto extract = [&view](const std::string_view key, uint64_t& out) [[gnu::always_inline]] {
            size_t pos = view.find(key);
            if (pos == std::string_view::npos) return;
            pos += key.size();
            while (pos < view.size() && (view[pos] < '0' || view[pos] > '9')) ++pos;
            std::from_chars(view.data() + pos, view.data() + view.size(), out);
        };

        extract("\"market_id\":", payload.market_id);
        extract("\"persona_id\":", payload.persona_id);
        extract("\"price\":", payload.price);
        extract("\"quantity\":", payload.quantity);
        
        size_t side_pos = view.find("\"side\":");
        if (side_pos != std::string_view::npos) {
            side_pos += 7;
            while (side_pos < view.size() && (view[side_pos] == ' ' || view[side_pos] == '"' || view[side_pos] == ':')) ++side_pos;
            if (side_pos < view.size()) [[likely]] {
                payload.side = (view[side_pos] == 'N' || view[side_pos] == '1');
            }
        }
        return payload;
    }
};
