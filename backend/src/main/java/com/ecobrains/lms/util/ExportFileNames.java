package com.ecobrains.lms.util;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Builds safe .xlsx download names for exports.
 *
 * Default pattern: {Course or "All Domains"} - {College code or "All Colleges"} - {Date}
 * followed by any other filters that were applied, e.g.
 *   "Java Full Stack - SVEC-SRYP - 26-Sep-2026 - Score 40-80 - Search ravi.xlsx"
 * A name typed by the admin/user always wins over the default (after sanitizing).
 */
public final class ExportFileNames {

    public static final String ALL_DOMAINS = "All Domains";
    public static final String ALL_COLLEGES = "All Colleges";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd-MMM-yyyy", Locale.ENGLISH);
    private static final int MAX_BASE_LENGTH = 150;
    private static final String EXTENSION = ".xlsx";

    private ExportFileNames() {
    }

    /** "Java Full Stack - SVEC-SRYP - 26-Sep-2026.xlsx" */
    public static String defaultName(String courseName, String collegeCode, LocalDate date) {
        String course = isBlank(courseName) ? ALL_DOMAINS : courseName.strip();
        String college = isBlank(collegeCode) ? ALL_COLLEGES : collegeCode.strip();
        String day = (date == null ? LocalDate.now() : date).format(DATE);
        return finish(course + " - " + college + " - " + day);
    }

    /** Joins the given name parts with " - ", skipping empty ones (one part per applied filter). */
    public static String fromParts(java.util.List<String> parts) {
        String base = parts.stream()
                .filter(p -> !isBlank(p))
                .map(String::strip)
                .collect(java.util.stream.Collectors.joining(" - "));
        return finish(base);
    }

    /** Formats a date the same way as the default file names (26-Sep-2026). */
    public static String formatDate(LocalDate date) {
        return (date == null ? LocalDate.now() : date).format(DATE);
    }

    /** "Score 40-80", "Score 40+", "Score up to 80"; null when no score filter is set. */
    public static String scoreRange(Double min, Double max) {
        if (min == null && max == null) return null;
        if (min != null && max != null) return "Score " + number(min) + "-" + number(max);
        if (min != null) return "Score " + number(min) + "+";
        return "Score up to " + number(max);
    }

    /** "Search ravi" (shortened to keep the name readable); null when no search is applied. */
    public static String search(String term) {
        if (isBlank(term)) return null;
        String t = term.strip();
        if (t.length() > 30) t = t.substring(0, 30).strip();
        return "Search " + t;
    }

    private static String number(Double value) {
        return value % 1 == 0 ? String.valueOf(value.longValue()) : String.valueOf(value);
    }

    /** Uses the requested name when it has any usable characters, otherwise the default. */
    public static String resolve(String requested, String defaultName) {
        if (isBlank(requested)) return defaultName;
        String base = stripExtension(requested.strip());
        String cleaned = clean(base);
        // A name with no letters or digits (e.g. "..//") is not a usable name.
        return cleaned.codePoints().noneMatch(Character::isLetterOrDigit) ? defaultName : finish(cleaned);
    }

    /**
     * Content-Disposition value with an ASCII fallback plus the RFC 5987 UTF-8
     * form, so names with non-English characters download correctly everywhere.
     */
    public static String contentDisposition(String filename) {
        String ascii = filename.replaceAll("[^\\x20-\\x7E]", "_").replace("\"", "'");
        String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        return "attachment; filename=\"" + ascii + "\"; filename*=UTF-8''" + encoded;
    }

    private static String finish(String base) {
        String cleaned = clean(base);
        if (cleaned.isEmpty()) cleaned = "export";
        return cleaned + EXTENSION;
    }

    private static String clean(String value) {
        String s = value
                .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_") // characters Windows/macOS reject
                .replaceAll("\\s+", " ")
                .strip();
        s = s.replaceAll("^[.\\s]+", "").replaceAll("[.\\s]+$", ""); // no leading/trailing dots
        if (s.length() > MAX_BASE_LENGTH) s = s.substring(0, MAX_BASE_LENGTH).strip();
        return s;
    }

    private static String stripExtension(String name) {
        return name.toLowerCase(Locale.ROOT).endsWith(EXTENSION)
                ? name.substring(0, name.length() - EXTENSION.length())
                : name;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
