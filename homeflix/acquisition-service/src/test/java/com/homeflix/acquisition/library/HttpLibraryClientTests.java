package com.homeflix.acquisition.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

class HttpLibraryClientTests {

	private static final java.util.UUID MEDIA = java.util.UUID.randomUUID();

	private static HttpServer server(int status, AtomicInteger calls, String[] key) throws Exception {
		HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		s.createContext("/internal/downloads/completed", ex -> {
			calls.incrementAndGet();
			key[0] = ex.getRequestHeaders().getFirst("X-Internal-Key");
			ex.getRequestBody().readAllBytes();
			if (status == 200) {
				byte[] body = ("{\"mediaId\":\"" + MEDIA + "\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
				ex.getResponseHeaders().add("Content-Type", "application/json");
				ex.sendResponseHeaders(status, body.length);
				ex.getResponseBody().write(body);
			} else {
				ex.sendResponseHeaders(status, -1);
			}
			ex.close();
		});
		s.start();
		return s;
	}

	private static HttpLibraryClient client(HttpServer s) {
		return new HttpLibraryClient("http://127.0.0.1:" + s.getAddress().getPort(), "secret", Duration.ofSeconds(1),
				Duration.ofMillis(10));
	}

	@Test
	void sendsTheInternalKeyAndSucceeds() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		String[] key = new String[1];
		HttpServer s = server(200, calls, key);
		try {
			assertThat(client(s).registerCompleted("a.mkv", "A")).isEqualTo(MEDIA);
			assertThat(calls).hasValue(1);
			assertThat(key[0]).isEqualTo("secret");
		} finally {
			s.stop(0);
		}
	}

	@Test
	void retriesTwiceOnServerErrorThenGivesUp() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		HttpServer s = server(503, calls, new String[1]);
		try {
			assertThatThrownBy(() -> client(s).registerCompleted("a.mkv", "A"))
					.isInstanceOf(LibraryUnavailableException.class);
			assertThat(calls).hasValue(3);
		} finally {
			s.stop(0);
		}
	}

	@Test
	void doesNotRetryARefusedRequest() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		HttpServer s = server(400, calls, new String[1]);
		try {
			assertThatThrownBy(() -> client(s).registerCompleted("a.mkv", "A"))
					.isInstanceOf(LibraryRejectedException.class);
			assertThat(calls).hasValue(1);
		} finally {
			s.stop(0);
		}
	}

	@Test
	void unreachableLibraryIsUnavailable() {
		HttpLibraryClient c = new HttpLibraryClient("http://127.0.0.1:1", "k", Duration.ofMillis(300), Duration.ofMillis(10));
		assertThatThrownBy(() -> c.registerCompleted("a.mkv", "A")).isInstanceOf(LibraryUnavailableException.class);
	}
}
