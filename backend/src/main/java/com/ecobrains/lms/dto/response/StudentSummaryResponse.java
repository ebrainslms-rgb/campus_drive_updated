package com.ecobrains.lms.dto.response;

public record StudentSummaryResponse(
        Long id,
        String name,
        String branch,
        Double aggregate,
        String courseName,
        boolean attempted,
        Integer score,
        boolean isHighestScorer
) {}
