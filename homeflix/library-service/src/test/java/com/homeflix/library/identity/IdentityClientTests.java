package com.homeflix.library.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

class IdentityClientTests {

	private static final String JWKS_URI = "http://identity-service:8081/.well-known/jwks.json";

	@Test
	void fetchesSigningKeysFromIdentity() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(JWKS_URI))
				.andExpect(method(HttpMethod.GET))
				.andRespond(withSuccess("{\"keys\":[{\"kty\":\"RSA\",\"kid\":\"k1\",\"alg\":\"RS256\"}]}",
						MediaType.APPLICATION_JSON));

		var keys = new IdentityClient(builder, JWKS_URI).fetchSigningKeys();

		assertThat(keys).hasSize(1);
		assertThat(keys.get(0)).containsEntry("kid", "k1");
		server.verify();
	}

	@Test
	void propagatesIdentityFailure() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(JWKS_URI)).andRespond(withServerError());

		assertThatThrownBy(() -> new IdentityClient(builder, JWKS_URI).fetchSigningKeys())
				.isInstanceOf(RestClientException.class);
	}
}
