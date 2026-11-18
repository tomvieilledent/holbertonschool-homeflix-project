package com.homeflix.library.api;

import java.net.URI;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Toutes les erreurs sortent en application/problem+json avec un `code` stable (CONVENTIONS.md).
 * Aucun détail technique (pile, classe, chemin du serveur) n'est jamais renvoyé : il est journalisé.
 */
@RestControllerAdvice
public class ProblemExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ProblemExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApi(ApiException e, HttpServletRequest request) {
        ResponseEntity<ProblemDetail> response = build(e.getStatus(), e.getCode(), e.getTitle(), e.getMessage(),
                e.getErrors(), request.getRequestURI());
        return ResponseEntity.status(response.getStatusCode()).headers(e.getHeaders()).body(response.getBody());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ProblemDetail> handleTypeMismatch(MethodArgumentTypeMismatchException e, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Données invalides",
                "Un paramètre de la requête est invalide.",
                List.of(new ApiException.FieldError(e.getName(), "Valeur invalide")), request.getRequestURI());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception e, HttpServletRequest request) {
        log.error("Erreur inattendue sur {}", request.getRequestURI(), e);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Erreur interne",
                "Une erreur inattendue s'est produite. Réessayez plus tard.", List.of(), request.getRequestURI());
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException e,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<ApiException.FieldError> errors = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new ApiException.FieldError(f.getField(), f.getDefaultMessage()))
                .toList();
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Données invalides",
                "Une ou plusieurs valeurs sont invalides.", errors, null);
        return new ResponseEntity<>(problem, headers, HttpStatus.BAD_REQUEST);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException e,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Données invalides",
                "Le corps de la requête est absent ou mal formé.", List.of(), null);
        return new ResponseEntity<>(problem, headers, HttpStatus.BAD_REQUEST);
    }

    /** Erreurs MVC standard (404, 405, 406, 415…) : `code` stable attendu par le frontend et message fixe. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception e, Object body, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        ResponseEntity<Object> response = super.handleExceptionInternal(e, body, headers, status, request);
        if (response != null && response.getBody() instanceof ProblemDetail detail && detail.getProperties() == null) {
            detail.setProperty("code", codeFor(status));
            detail.setDetail(detailFor(status));
        }
        return response;
    }

    /** Code stable (CONVENTIONS.md) d'une erreur MVC standard, d'après son statut HTTP. */
    private static String codeFor(HttpStatusCode status) {
        return switch (status.value()) {
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 406 -> "NOT_ACCEPTABLE";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> status.is5xxServerError() ? "INTERNAL_ERROR" : "VALIDATION_ERROR";
        };
    }

    /** Message fixe en français : le texte de Spring est en anglais et reprend des valeurs envoyées par le client. */
    private static String detailFor(HttpStatusCode status) {
        return switch (status.value()) {
            case 404 -> "La ressource demandée est introuvable.";
            case 405 -> "Cette méthode HTTP n'est pas autorisée sur cette ressource.";
            case 406 -> "Le format de réponse demandé n'est pas disponible.";
            case 415 -> "Le type de contenu envoyé n'est pas pris en charge.";
            default -> status.is5xxServerError() ? "Une erreur inattendue s'est produite." : "La requête est invalide.";
        };
    }

    private ResponseEntity<ProblemDetail> build(HttpStatus status, String code, String title, String detail,
            List<ApiException.FieldError> errors, String instance) {
        return ResponseEntity.status(status).body(problem(status, code, title, detail, errors, instance));
    }

    private ProblemDetail problem(HttpStatus status, String code, String title, String detail,
            List<ApiException.FieldError> errors, String instance) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("https://homeflix.local/problems/" + code.toLowerCase(Locale.ROOT).replace('_', '-')));
        problem.setTitle(title);
        problem.setProperty("code", code);
        if (instance != null) {
            problem.setInstance(URI.create(instance));
        }
        if (!errors.isEmpty()) {
            problem.setProperty("errors", errors);
        }
        return problem;
    }
}
