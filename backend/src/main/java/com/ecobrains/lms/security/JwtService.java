package com.ecobrains.lms.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.Map;
import java.util.function.Function;

/**
 * Generates and validates JWTs. The signing secret is read from
 * application.properties (app.jwt.secret) - never hard-coded, never logged.
 */
@Component
public class JwtService {

    private final SecretKey key;
    private final long adminExpirationMs;
    private final long studentExpirationMs;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.admin-expiration-ms:86400000}") long adminExpirationMs,
            @Value("${app.jwt.student-expiration-ms:28800000}") long studentExpirationMs) {
        // Secret must be a sufficiently long, Base64-encoded key for HS256.
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
        this.adminExpirationMs = adminExpirationMs;
        this.studentExpirationMs = studentExpirationMs;
    }

    public String generateAdminToken(String email) {
        return buildToken(Map.of("role", "ADMIN"), email, adminExpirationMs);
    }

    public String generateStudentToken(Long studentId, String email) {
        return buildToken(Map.of("role", "STUDENT", "studentId", studentId), email, studentExpirationMs);
    }

    private String buildToken(Map<String, Object> claims, String subject, long expirationMs) {
        Date now = new Date();
        return Jwts.builder()
                .claims(claims)
                .subject(subject)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs))
                .signWith(key)
                .compact();
    }

    public String extractSubject(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public String extractRole(String token) {
        return extractAllClaims(token).get("role", String.class);
    }

    public Long extractStudentId(String token) {
        Object v = extractAllClaims(token).get("studentId");
        if (v == null) return null;
        return Long.valueOf(v.toString());
    }

    public boolean isTokenValid(String token) {
        try {
            return !isTokenExpired(token);
        } catch (ExpiredJwtException e) {
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isTokenExpired(String token) {
        return extractClaim(token, Claims::getExpiration).before(new Date());
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver) {
        Claims claims = extractAllClaims(token);
        return resolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
