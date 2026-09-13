package com.ecobrains.lms.util;

import com.ecobrains.lms.repository.CollegeRepository;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Generates a readable, stable college code from the college name + location,
 * e.g. "Sri Venkateshwara Engineering College" + "Suryapet" -> "SVEC-SRPT".
 * Guarantees uniqueness by appending a numeric suffix on collision.
 * Once generated the code is stored permanently and is never recomputed on edit.
 */
@Component
public class CollegeCodeGenerator {

    private static final Pattern NON_ALPHA = Pattern.compile("[^A-Za-z]");
    private static final java.util.Set<String> STOPWORDS = java.util.Set.of(
            "of", "the", "and", "for", "a", "an"
    );

    private final CollegeRepository collegeRepository;

    public CollegeCodeGenerator(CollegeRepository collegeRepository) {
        this.collegeRepository = collegeRepository;
    }

    public String generate(String name, String location) {
        String namePart = acronym(name, 4);
        String locationPart = prefix(location, 4);

        String base = (namePart + "-" + locationPart).toUpperCase(Locale.ROOT);
        String candidate = base;
        int suffix = 1;
        while (collegeRepository.existsByCode(candidate)) {
            suffix++;
            candidate = base + suffix;
        }
        return candidate;
    }

    /** First letter of each significant word, e.g. "Sri Venkateshwara Engineering College" -> "SVEC". */
    private String acronym(String name, int maxLen) {
        if (name == null || name.isBlank()) return "COLG";
        String[] words = name.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            String cleaned = NON_ALPHA.matcher(w).replaceAll("");
            if (cleaned.isEmpty()) continue;
            if (STOPWORDS.contains(cleaned.toLowerCase(Locale.ROOT)) && sb.length() > 0) continue;
            sb.append(Character.toUpperCase(cleaned.charAt(0)));
            if (sb.length() >= maxLen) break;
        }
        if (sb.isEmpty()) sb.append("COLG");
        return sb.toString();
    }

    /** First consonant-leaning letters of the location, e.g. "Suryapet" -> "SRPT". */
    private String prefix(String location, int maxLen) {
        if (location == null || location.isBlank()) return "GEN";
        String cleaned = NON_ALPHA.matcher(location.trim().split("\\s+")[0]).replaceAll("");
        if (cleaned.isEmpty()) return "GEN";
        StringBuilder sb = new StringBuilder();
        sb.append(Character.toUpperCase(cleaned.charAt(0)));
        for (int i = 1; i < cleaned.length() && sb.length() < maxLen; i++) {
            char c = Character.toLowerCase(cleaned.charAt(i));
            if ("aeiou".indexOf(c) < 0) {
                sb.append(Character.toUpperCase(c));
            }
        }
        // pad with remaining letters (including vowels) if too short
        if (sb.length() < 3) {
            for (int i = 1; i < cleaned.length() && sb.length() < maxLen; i++) {
                char c = Character.toUpperCase(cleaned.charAt(i));
                if (sb.indexOf(String.valueOf(c)) < 0 || sb.length() < 3) {
                    if (sb.length() < maxLen) sb.append(c);
                }
            }
        }
        return sb.substring(0, Math.min(sb.length(), maxLen));
    }
}
