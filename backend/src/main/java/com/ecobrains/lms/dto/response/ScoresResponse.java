package com.ecobrains.lms.dto.response;

public record ScoresResponse(
        int aptitudeScore,
        int logicalScore,
        int technicalScore,
        int frontendScore,
        int totalScore
) {}
