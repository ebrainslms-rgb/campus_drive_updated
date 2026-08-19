package com.ecobrains.lms.security;

/** Lightweight principal attached to the SecurityContext after a valid JWT is parsed. */
public record AuthenticatedPrincipal(String email, Long studentId) {
}
