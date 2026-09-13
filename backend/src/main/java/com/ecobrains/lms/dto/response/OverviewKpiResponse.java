package com.ecobrains.lms.dto.response;

public record OverviewKpiResponse(
        long registeredColleges,
        long totalRegisteredStudents,
        long examsAttempted,
        Double averageScorePercent
) {}
