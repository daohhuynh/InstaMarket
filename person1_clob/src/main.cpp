#include "engine.hpp"
#include "parser.hpp"
#include <iostream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>
#include <charconv>

int main() {
    Engine engine;
    engine.init_markets(100); 

    ZeroAllocJsonParser parser;

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(8080);

    bind(server_fd, reinterpret_cast<sockaddr*>(&address), sizeof(address));
    listen(server_fd, 3);

    std::cout << "CLOB Engine listening on port 8080..." << std::endl;

    std::array<char, 8192> read_buffer;
    uint64_t global_order_id = 1;

    while (true) {
        int client_socket = accept(server_fd, nullptr, nullptr);
        if (client_socket < 0) continue;

        ssize_t bytes_read = read(client_socket, read_buffer.data(), read_buffer.size());
        if (bytes_read > 0) {
            std::string_view chunk(read_buffer.data(), bytes_read);
            
            size_t body_pos = chunk.find("\r\n\r\n");
            std::string_view head = chunk.substr(0, body_pos);
            std::string_view body = (body_pos != std::string_view::npos) ? chunk.substr(body_pos + 4) : "";

            if (head.find("GET /api/orderbook?market_id=") != std::string_view::npos) {
                size_t id_start = head.find("market_id=") + 10;
                size_t id_end = head.find(' ', id_start);
                uint64_t m_id = 0;
                try {
                    m_id = std::stoull(std::string(head.substr(id_start, id_end - id_start)));
                } catch (...) {}
                std::string json = engine.get_market_depth_json(m_id);
                std::string response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + std::to_string(json.size()) + "\r\n\r\n" + json;
                write(client_socket, response.c_str(), response.size());
                close(client_socket);
                continue;
            }

            if (head.find("POST /api/resolve") != std::string_view::npos) {
                parser.load_chunk(body);
                ParsedPayload p = parser.parse_trade(); // Side/MarketID reused for resolve
                engine.resolve_market(p.market_id, p.side == 0 ? Side::Yes : Side::No);
                const char* res = "HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nRESOLVED OK";
                write(client_socket, res, strlen(res));
                close(client_socket);
                continue;
            }

            // Default: Process Trade
            parser.load_chunk(body);
            ParsedPayload payload = parser.parse_trade();

            if (payload.market_id > 0 && payload.quantity > 0) {
                FillReport report = engine.process_trade_execution(
                    payload.market_id,
                    payload.side == 0 ? Side::Yes : Side::No,
                    payload.price,
                    Order{global_order_id++, payload.persona_id, payload.quantity}
                );
                
                std::string json = "{\"status\":\"OK\",\"filled\":" + std::to_string(report.filled) + 
                                   ",\"total_cost\":" + std::to_string(report.total_cost) + "}";
                std::string response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + 
                                       std::to_string(json.size()) + "\r\n\r\n" + json;
                write(client_socket, response.c_str(), response.size());
                close(client_socket);
                continue;
            }
        }
        
        const char* response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
        write(client_socket, response, strlen(response));
        close(client_socket);
    }

    return 0;
}
