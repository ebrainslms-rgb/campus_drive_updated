package com.ecobrains.lms.dto.response;

import java.util.List;

public record CollegeOverviewResponse(
        Long collegeId,
        String collegeName,
        String collegeCode,
        String location,
        String state,
        Integer selectedYear,
        List<Integer> availableYears,
        long totalStudents,
        long attempted,
        long notAttempted,
        long totalDrivesConducted,
        Double averageScorePercent,
        Double highestScorePercent,
        Double lowestScorePercent,
        PerformanceDistributionResponse performanceDistribution,
        List<CourseInterestResponse> courseInterest
) {}
