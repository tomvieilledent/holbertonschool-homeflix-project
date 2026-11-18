package com.homeflix.library.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationServiceException;

import jakarta.servlet.ServletException;

/**
 * Identity injoignable = 503 `IDENTITY_UNAVAILABLE`, pas un 401 qui ferait croire à une session expirée. Test
 * direct du filtre : MockMvc propage l'exception, alors qu'un vrai serveur la rejoue sur `/error`.
 */
class IdentityUnavailableFilterTests {

    private final IdentityUnavailableFilter filter = new IdentityUnavailableFilter();
    private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/anything");
    private final MockHttpServletResponse response = new MockHttpServletResponse();

    private MockFilterChain chainThrowing(Exception failure) {
        return new MockFilterChain() {
            @Override
            public void doFilter(jakarta.servlet.ServletRequest req, jakarta.servlet.ServletResponse res)
                    throws java.io.IOException, ServletException {
                if (failure instanceof ServletException se) {
                    throw se;
                }
                throw (RuntimeException) failure;
            }
        };
    }

    @Test
    void unreachableIdentityGets503WithoutTechnicalDetail() throws Exception {
        filter.doFilter(request, response, chainThrowing(
            new AuthenticationServiceException("Couldn't retrieve remote JWK set: http://identity-service:8081/x")));

        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString())
            .contains("\"code\":\"IDENTITY_UNAVAILABLE\"", "\"status\":503")
            .doesNotContain("identity-service:8081", "JWK");
    }

    @Test
    void wrappedInServletExceptionStillGets503() throws Exception {
        filter.doFilter(request, response,
            chainThrowing(new ServletException(new AuthenticationServiceException("JWKS illisible"))));

        assertThat(response.getStatus()).isEqualTo(503);
    }

    @Test
    void otherFailuresAreNotMasked() {
        assertThatThrownBy(() -> filter.doFilter(request, response,
            chainThrowing(new IllegalStateException("bug sans rapport"))))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> filter.doFilter(request, response,
            chainThrowing(new ServletException("autre erreur"))))
            .isInstanceOf(ServletException.class);
    }

    @Test
    void normalRequestsPassThroughUntouched() throws Exception {
        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).isEmpty();
    }
}
