package com.ecobrains.lms.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;


import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.HttpRequestMethodNotSupportedException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex) {
        Map<String, Object> response = body(ex.getStatus(), ex.getMessage());
        response.putAll(ex.getDetails());
        return ResponseEntity.status(ex.getStatus()).body(response);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> body = body(HttpStatus.BAD_REQUEST, "Validation failed");
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fe.getField(), fe.getDefaultMessage());
        }
        body.put("errors", fieldErrors);
        if (!fieldErrors.isEmpty()) {
            Map.Entry<String, String> first = fieldErrors.entrySet().iterator().next();
            body.put("message", first.getKey() + ": " + first.getValue());
        }
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleDataIntegrity(org.springframework.dao.DataIntegrityViolationException ex) {
        String message = "A record with this value already exists.";
        String details = ex.getMostSpecificCause() != null ? String.valueOf(ex.getMostSpecificCause().getMessage()) : String.valueOf(ex.getMessage());
        String lower = details.toLowerCase();
        if (lower.contains("uk_student_email") || lower.contains("students.email")) {
            message = "An account with this email already exists.";
        } else if (lower.contains("uk_student_phone") || lower.contains("phone_number")) {
            message = "An account with this phone number already exists.";
        }
        log.warn("Data integrity conflict: {}", message);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(body(HttpStatus.CONFLICT, message));
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(org.springframework.security.access.AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body(HttpStatus.FORBIDDEN, "Access denied."));
    }


    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
public ResponseEntity<Map<String, Object>> handleMethodNotSupported(
        HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
    log.warn("405 Method Not Allowed: {} {} (supported: {})", request.getMethod(), request.getRequestURI(), ex.getSupportedHttpMethods());
    return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
            .body(body(HttpStatus.METHOD_NOT_ALLOWED, "This action isn't available for that request type."));
}


@ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
public ResponseEntity<Map<String, Object>> handleUnreadable(org.springframework.http.converter.HttpMessageNotReadableException ex) {
    return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST, "The request body is missing or malformed."));
}

@ExceptionHandler({org.springframework.web.bind.MissingServletRequestParameterException.class,
        org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
        org.springframework.web.multipart.support.MissingServletRequestPartException.class})
public ResponseEntity<Map<String, Object>> handleBadParameter(Exception ex) {
    return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST, "Invalid or missing request parameter."));
}

@ExceptionHandler(org.springframework.web.method.annotation.HandlerMethodValidationException.class)
public ResponseEntity<Map<String, Object>> handleMethodValidation(org.springframework.web.method.annotation.HandlerMethodValidationException ex) {
    return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST, "Validation failed"));
}

@ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
public ResponseEntity<Map<String, Object>> handleUploadTooLarge(org.springframework.web.multipart.MaxUploadSizeExceededException ex) {
    return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).body(body(HttpStatus.CONTENT_TOO_LARGE, "The uploaded file is too large (max 10 MB)."));
}

@ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
public ResponseEntity<Map<String, Object>> handleNotFound(org.springframework.web.servlet.resource.NoResourceFoundException ex) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body(HttpStatus.NOT_FOUND, "Not found."));
}

@ExceptionHandler(Exception.class)
public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex, HttpServletRequest request) {
    log.error("Unhandled exception on {} {}", request.getMethod(), request.getRequestURI(), ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(body(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error"));
}

   

    private Map<String, Object> body(HttpStatus status, String message) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("timestamp", LocalDateTime.now().toString());
        map.put("status", status.value());
        map.put("message", message);
        return map;
    }
}
