package com.homeflix.identity.error;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;

/** Erreurs problem+json sans fuite d'information (ni pile, ni classe, ni SQL). */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        List<ProblemResponses.FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> new ProblemResponses.FieldError(e.getField(), e.getDefaultMessage()))
            .toList();
        ProblemDetail pd = ProblemResponses.problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
            "Requête invalide", "Un ou plusieurs champs sont invalides.", req.getRequestURI());
        return respond(HttpStatus.BAD_REQUEST, ProblemResponses.withFieldErrors(pd, errors));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemDetail> unreadable(HttpServletRequest req) {
        return respond(HttpStatus.BAD_REQUEST, ProblemResponses.problem(HttpStatus.BAD_REQUEST,
            "VALIDATION_ERROR", "Requête invalide", "Corps de requête illisible.", req.getRequestURI()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> notFound(HttpServletRequest req) {
        return respond(HttpStatus.NOT_FOUND, ProblemResponses.problem(HttpStatus.NOT_FOUND,
            "NOT_FOUND", "Ressource introuvable", "La ressource demandée est introuvable.", req.getRequestURI()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> conflict(HttpServletRequest req) {
        return respond(HttpStatus.CONFLICT, ProblemResponses.problem(HttpStatus.CONFLICT,
            "CONFLICT", "Conflit", "L'opération entre en conflit avec l'état actuel.", req.getRequestURI()));
    }

    /** Relance vers le gestionnaire de sécurité (403 problem+json) plutôt que de la masquer en 500. */
    @ExceptionHandler(AccessDeniedException.class)
    void accessDenied(AccessDeniedException ex) {
        throw ex;
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(Exception ex, HttpServletRequest req) {
        log.error("Erreur inattendue sur {}", req.getRequestURI(), ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, ProblemResponses.problem(HttpStatus.INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR", "Erreur interne", "Une erreur inattendue s'est produite.", req.getRequestURI()));
    }

    private static ResponseEntity<ProblemDetail> respond(HttpStatus status, ProblemDetail pd) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(pd);
    }
}
