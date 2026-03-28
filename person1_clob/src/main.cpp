#include "engine.hpp"
#include "parser.hpp"
#include <iostream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>

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
            if (body_pos != std::string_view::npos) {
                chunk.remove_prefix(body_pos + 4);
            }

            parser.load_chunk(chunk);
            ParsedPayload payload = parser.parse_trade();

            if (payload.market_id > 0 && payload.quantity > 0) {
                engine.process_trade_execution(
                    payload.market_id,
                    payload.side == 0 ? Side::Yes : Side::No,
                    payload.price,
                    Order{global_order_id++, payload.persona_id, payload.quantity}
                );
            }
        }
        
        const char* response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
        write(client_socket, response, strlen(response));
        close(client_socket);
    }

    return 0;
}
