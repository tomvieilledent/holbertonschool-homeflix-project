package com.homeflix.identity.error;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Erreurs problem+json sans fuite d'information (ni pile, ni classe, ni SQL).
 *
 * <p>Hérite de {@link ResponseEntityExceptionHandler} : les erreurs normales de Spring MVC (méthode non
 * supportée 405, type de contenu 415, réponse non acceptable 406, paramètre manquant 400…) gardent leur vrai
 * statut. Sans cela, le gestionnaire générique {@code Exception} les transformait en 500 « erreur interne »,
 * avec une erreur dans les journaux pour une simple faute du client.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> api(ApiException ex, HttpServletRequest req) {
        return respond(ex.status(), ProblemResponses.problem(ex.status(), ex.code(), ex.title(),
            ex.getMessage(), req.getRequestURI()));
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

    // --- Erreurs MVC standard : mêmes réponses qu'avant pour 400 et 404, le vrai statut pour le reste ---

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<ProblemResponses.FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> new ProblemResponses.FieldError(e.getField(), e.getDefaultMessage()))
            .toList();
        ProblemDetail pd = ProblemResponses.problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
            "Requête invalide", "Un ou plusieurs champs sont invalides.", uri(request));
        return respondObject(HttpStatus.BAD_REQUEST, ProblemResponses.withFieldErrors(pd, errors));
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return respondObject(HttpStatus.BAD_REQUEST, ProblemResponses.problem(HttpStatus.BAD_REQUEST,
            "VALIDATION_ERROR", "Requête invalide", "Corps de requête illisible.", uri(request)));
    }

    @Override
    protected ResponseEntity<Object> handleNoResourceFoundException(NoResourceFoundException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return respondObject(HttpStatus.NOT_FOUND, ProblemResponses.problem(HttpStatus.NOT_FOUND,
            "NOT_FOUND", "Ressource introuvable", "La ressource demandée est introuvable.", uri(request)));
    }

    /**
     * Toutes les autres erreurs MVC (405, 406, 415, paramètre manquant…) : le corps problem+json de Spring,
     * complété du `code` attendu par le frontend (voir docs/api/CONVENTIONS.md) et d'un `detail` fixe en français :
     * le texte de Spring est en anglais et reprend des valeurs envoyées par le client. Les en-têtes utiles (par
     * exemple `Allow` pour un 405) sont conservés.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, status, request);
        if (response != null && response.getBody() instanceof ProblemDetail pd
                && (pd.getProperties() == null || !pd.getProperties().containsKey("code"))) {
            pd.setProperty("code", codeFor(status));
            pd.setDetail(detailFor(status));
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

    private static String uri(WebRequest request) {
        return request instanceof ServletWebRequest servlet ? servlet.getRequest().getRequestURI() : null;
    }

    private static ResponseEntity<Object> respondObject(HttpStatus status, ProblemDetail pd) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(pd);
    }

    private static ResponseEntity<ProblemDetail> respond(HttpStatus status, ProblemDetail pd) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(pd);
    }
}
