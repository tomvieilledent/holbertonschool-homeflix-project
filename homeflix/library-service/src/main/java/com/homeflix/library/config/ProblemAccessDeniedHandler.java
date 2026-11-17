package com.homeflix.library.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 403 au format RFC 9457 quand un utilisateur authentifié n'a pas le rôle requis. */
@Component
public class ProblemAccessDeniedHandler implements AccessDeniedHandler {

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        String instance = request.getRequestURI().replace("\\", "\\\\").replace("\"", "\\\"");
        response.getWriter().write("{\"type\":\"https://homeflix.local/problems/access-denied\","
                + "\"title\":\"Accès refusé\",\"status\":403,\"code\":\"ACCESS_DENIED\","
                + "\"detail\":\"Vous n'avez pas les droits nécessaires pour cette opération.\","
                + "\"instance\":\"" + instance + "\"}");
    }
}
