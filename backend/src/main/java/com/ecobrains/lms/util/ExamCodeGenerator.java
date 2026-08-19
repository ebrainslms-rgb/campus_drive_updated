package com.ecobrains.lms.util;

import com.ecobrains.lms.repository.ExamRepository;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** Generates a unique 7-character alphanumeric exam code, e.g. "K3F9ZQ1". */
@Component
public class ExamCodeGenerator {

    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 ambiguity
    private static final int LENGTH = 7;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ExamRepository examRepository;

    public ExamCodeGenerator(ExamRepository examRepository) {
        this.examRepository = examRepository;
    }

    public String generate() {
        String code;
        do {
            StringBuilder sb = new StringBuilder(LENGTH);
            for (int i = 0; i < LENGTH; i++) {
                sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            code = sb.toString();
        } while (examRepository.existsByExamCode(code));
        return code;
    }

    /**
     * Uses the admin/frontend-supplied code if it's well-formed and not already taken;
     * otherwise falls back to a fresh generated one. Mirrors the original app's behavior
     * of letting the UI pre-generate a shareable code while still guaranteeing uniqueness.
     */
    public String resolve(String clientSuppliedCode) {
        if (clientSuppliedCode != null) {
            String candidate = clientSuppliedCode.trim().toUpperCase();
            if (candidate.matches("^[A-Z0-9]{6,8}$") && !examRepository.existsByExamCode(candidate)) {
                return candidate;
            }
        }
        return generate();
    }
}
