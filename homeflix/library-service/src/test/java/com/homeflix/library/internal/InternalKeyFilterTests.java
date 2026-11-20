package com.homeflix.library.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

class InternalKeyFilterTests {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private boolean authenticated(String configured, String provided) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (provided != null) {
            request.addHeader(InternalKeyFilter.HEADER, provided);
        }
        new InternalKeyFilter(configured).doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
        return SecurityContextHolder.getContext().getAuthentication() != null;
    }

    @Test
    void matchingKeyAuthenticates() throws Exception {
        assertThat(authenticated("secret", "secret")).isTrue();
    }

    @Test
    void anyOtherValueIsRefused() throws Exception {
        assertThat(authenticated("secret", "Secret")).isFalse();
        assertThat(authenticated("secret", "secret ")).isFalse();
        assertThat(authenticated("secret", "")).isFalse();
        assertThat(authenticated("secret", null)).isFalse();
    }

    @Test
    void withoutAConfiguredKeyEverythingIsRefused() throws Exception {
        assertThat(authenticated("", "")).isFalse();
        assertThat(authenticated(null, "x")).isFalse();
        assertThat(authenticated("   ", "   ")).isFalse();
    }
}
