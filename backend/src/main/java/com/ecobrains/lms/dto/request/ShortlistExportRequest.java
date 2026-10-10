package com.ecobrains.lms.dto.request;

import java.util.List;
import java.util.Map;

/**
 * Shortlist & Export (Drive Details): the students left after the on-screen
 * filters of ONE domain, plus optional renamed headers for the empty
 * interview columns (key = column key, value = header text).
 * Nothing in this request is stored - it only shapes the downloaded sheet.
 */
public record ShortlistExportRequest(
        Long courseId,
        List<Long> studentIds,
        Map<String, String> headers
) {}
