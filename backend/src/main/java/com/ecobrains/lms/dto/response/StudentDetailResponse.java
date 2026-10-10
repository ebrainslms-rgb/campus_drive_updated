package com.ecobrains.lms.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

public record StudentDetailResponse(
        Long studentId,
        String fullName,
        String email,
        String phoneNumber,
        String gender,
        LocalDate dob,
        String location,
        String state,
        Long collegeId,
        String collegeName,
        Long courseId,
        String courseName,
        String branch,
        String highestQualification,
        Double aggregateMarks,
        String academicScoreType, // "CGPA" or "PERCENTAGE" - null on any pre-existing row treated as PERCENTAGE
        Integer yearOfPassing,
        String selectedInCampusDrive,
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
        Integer tabSwitchViolations,
        Map<String,String> customFields
) {}
