package com.ecobrains.lms.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record StudentDetailResponse(
        Long studentId,
        String fullName,
        String email,
        String phoneNumber,
        Long collegeId,
        String collegeName,
        Long courseId,
        String courseName,
        String branch,
        String highestQualification,
        Double aggregateMarks,
        Integer yearOfPassing,
        Long examId,
        String examCode,
        LocalDate examDate,
        boolean attempted,
        boolean submitted,
        Integer totalScore,
        Integer paperSize,
        Double scorePercent,
        String submissionType,
        LocalDateTime submissionTime,
        Long attemptDurationSeconds,
        Integer tabSwitchViolations
) {}
