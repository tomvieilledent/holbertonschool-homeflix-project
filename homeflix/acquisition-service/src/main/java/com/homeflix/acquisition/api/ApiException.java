package com.homeflix.acquisition.api;

import java.util.List;

import org.springframework.http.HttpStatus;

/** Erreur métier renvoyée au format RFC 9457 (voir docs/api/CONVENTIONS.md). */
public class ApiException extends RuntimeException {

    public record FieldError(String field, String message) { }

    private final HttpStatus status;
    private final String code;
    private final String title;
    private final List<FieldError> errors;

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

    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
    public String getTitle() { return title; }
    public List<FieldError> getErrors() { return errors; }
}
