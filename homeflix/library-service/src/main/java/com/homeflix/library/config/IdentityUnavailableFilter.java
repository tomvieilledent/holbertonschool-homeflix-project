package com.homeflix.library.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Identity injoignable (JWKS illisible) : 503 `IDENTITY_UNAVAILABLE` au format RFC 9457, pas un 401.
 *
 * <p>Spring Security traite cet échec comme une panne du serveur, pas comme un jeton refusé : il relance
 * l'exception hors du circuit des points d'entrée. Sans ce filtre, elle remonte au conteneur, qui la rejoue sur
 * `/error` où le client reçoit un 401 `SESSION_EXPIRED` : il croirait sa session expirée et serait déconnecté à
 * tort. ADR 0001 : une dépendance indisponible produit un 503. À placer avant le filtre des jetons.
 */
public class IdentityUnavailableFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(IdentityUnavailableFilter.class);

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            chain.doFilter(request, response);
        } catch (AuthenticationServiceException | ServletException failure) {
            if (!causedByAuthenticationService(failure) || response.isCommitted()) {
                throw failure;
            }
            log.warn("Identity injoignable : jeton impossible à vérifier sur {} ({})", request.getRequestURI(),
                failure.getMessage());
            write503(request, response);
        }
    }

    private static boolean causedByAuthenticationService(Throwable failure) {
        for (Throwable t = failure; t != null; t = t.getCause()) {
            if (t instanceof AuthenticationServiceException) {
                return true;
            }
        }
        return false;
    }

    private static void write503(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.SERVICE_UNAVAILABLE.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        String instance = request.getRequestURI().replace("\\", "\\\\").replace("\"", "\\\"");
        response.getWriter().write("{\"type\":\"https://homeflix.local/problems/identity-unavailable\","
                + "\"title\":\"Service d'authentification indisponible\",\"status\":503,"
                + "\"code\":\"IDENTITY_UNAVAILABLE\","
                + "\"detail\":\"Le service d'authentification est momentanément indisponible.\","
                + "\"instance\":\"" + instance + "\"}");
    }
}
