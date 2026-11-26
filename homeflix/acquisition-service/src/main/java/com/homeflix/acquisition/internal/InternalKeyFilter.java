package com.homeflix.acquisition.internal;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authentifie les appels de service à service (ADR 0001) : l'en-tête `X-Internal-Key` doit égaler le secret
 * partagé `INTERNAL_API_KEY`, comparé en temps constant. Refus par défaut : sans secret configuré, aucun appel
 * n'est accepté.
 */
public class InternalKeyFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Internal-Key";

    private final byte[] expected;

    public InternalKeyFilter(String apiKey) {
        this.expected = apiKey == null ? new byte[0] : apiKey.trim().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String provided = request.getHeader(HEADER);
        if (expected.length > 0 && provided != null
                && MessageDigest.isEqual(provided.getBytes(StandardCharsets.UTF_8), expected)) {
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                "internal-service", null, List.of(new SimpleGrantedAuthority("ROLE_SERVICE"))));
        }
        chain.doFilter(request, response);
    }
}
