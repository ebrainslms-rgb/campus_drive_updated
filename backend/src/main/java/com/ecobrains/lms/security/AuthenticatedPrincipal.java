package com.ecobrains.lms.security;
/** Lightweight principal attached to the SecurityContext after a valid JWT is parsed. */
public record AuthenticatedPrincipal(String subject, Long studentId, Long userId) {
    public String email(){ return subject; }
}
