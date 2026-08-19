package com.ecobrains.lms.security;

import org.springframework.security.core.context.SecurityContextHolder;

/** Convenience accessor for the currently authenticated principal. */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static AuthenticatedPrincipal get() {
        Object principal = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getPrincipal()
                : null;
        if (principal instanceof AuthenticatedPrincipal p) {
            return p;
        }
        throw new IllegalStateException("No authenticated user in context");
    }

    public static Long studentId() {
        Long id = get().studentId();
        if (id == null) throw new IllegalStateException("Current user is not a student");
        return id;
    }

    public static String email() {
        return get().email();
    }
}
