package com.homeflix.library.api;

import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/** Erreur métier renvoyée au format RFC 9457 (voir docs/api/CONVENTIONS.md). */
public class ApiException extends RuntimeException {

    public record FieldError(String field, String message) { }

    private final HttpStatus status;
    private final String code;
    private final String title;
    private final List<FieldError> errors;
    private final HttpHeaders headers = new HttpHeaders();

    public ApiException(HttpStatus status, String code, String title, String detail) {
        this(status, code, title, detail, List.of());
    }

    public ApiException(HttpStatus status, String code, String title, String detail, List<FieldError> errors) {
        super(detail);
        this.status = status;
        this.code = code;
        this.title = title;
        this.errors = errors;
    }

    public static ApiException validation(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Données invalides",
                "Une ou plusieurs valeurs sont invalides.", List.of(new FieldError(field, message)));
    }

    public static ApiException notFound(String detail) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Introuvable", detail);
    }

    /** Ajoute un en-tête à la réponse d'erreur (ex. Content-Range d'un 416). */
    public ApiException withHeader(String name, String value) {
        headers.set(name, value);
        return this;
    }

    public HttpHeaders getHeaders() { return headers; }
    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
    public String getTitle() { return title; }
    public List<FieldError> getErrors() { return errors; }
}
