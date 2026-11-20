package com.homeflix.acquisition.torrent;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;

import com.sun.net.httpserver.HttpServer;

/**
 * Faux démon Transmission : rejoue la poignée de main du RPC (409 + {@code X-Transmission-Session-Id} tant que
 * l'en-tête manque ou est faux) puis répond avec ce que le test a programmé. Garde les requêtes reçues.
 */
final class FakeTransmission implements AutoCloseable {

    record Received(String authorization, String sessionId, String body) { }

    record Response(int status, String body) {
        static Response ok(String arguments) {
            return new Response(200, "{\"result\":\"success\",\"arguments\":" + arguments + "}");
        }
    }

    static final String SESSION = "session-de-test-0123456789";

    private final HttpServer server;
    final List<Received> requests = new CopyOnWriteArrayList<>();
    /** Nombre de réponses 409 envoyées (poignées de main). */
    volatile int handshakes;
    volatile Function<Received, Response> handler = request -> Response.ok("{}");

    FakeTransmission() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/transmission/rpc", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Received received = new Received(exchange.getRequestHeaders().getFirst("Authorization"),
                exchange.getRequestHeaders().getFirst("X-Transmission-Session-Id"), body);
            requests.add(received);
            Response response;
            if (!SESSION.equals(received.sessionId())) {
                handshakes++;
                exchange.getResponseHeaders().set("X-Transmission-Session-Id", SESSION);
                response = new Response(409, "<h1>409: Conflict</h1>");
            } else {
                response = handler.apply(received);
            }
            byte[] bytes = response.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(response.status(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
    }

    String url() {
        return "http://" + server.getAddress().getHostString() + ":" + server.getAddress().getPort() + "/transmission/rpc";
    }

    /** Requêtes de méthode donnée (hors poignées de main). */
    List<Received> calls(String method) {
        return requests.stream().filter(r -> SESSION.equals(r.sessionId()))
            .filter(r -> r.body().contains("\"method\":\"" + method + "\"")).toList();
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
