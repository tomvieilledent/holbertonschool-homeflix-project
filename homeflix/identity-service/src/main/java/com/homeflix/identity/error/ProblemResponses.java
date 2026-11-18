package com.homeflix.identity.error;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;

import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

/** Construction et écriture des erreurs RFC 9457 (voir docs/api/CONVENTIONS.md). */
public final class ProblemResponses {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ProblemResponses() {
    }

    public static ProblemDetail problem(HttpStatus status, String code, String title, String detail, String instance) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setType(URI.create("https://homeflix.local/problems/" + code.toLowerCase().replace('_', '-')));
        pd.setTitle(title);
        pd.setProperty("code", code);
        if (instance != null) {
            pd.setInstance(URI.create(instance));
        }
        return pd;
    }

    public static ProblemDetail withFieldErrors(ProblemDetail pd, List<FieldError> errors) {
        pd.setProperty("errors", errors);
        return pd;
    }

    /** Écrit l'erreur directement sur la réponse (filtres de sécurité, hors MVC). */
    public static void write(HttpServletResponse response, HttpStatus status, String code, String title,
            String detail) throws IOException {
        ProblemDetail pd = problem(status, code, title, detail, null);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", pd.getType().toString());
        body.put("title", pd.getTitle());
        body.put("status", pd.getStatus());
        body.put("code", code);
        body.put("detail", pd.getDetail());
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(MAPPER.writeValueAsString(body));
    }

    public record FieldError(String field, String message) {
    }
}
