package com.ecobrains.lms.dto.response;

import java.time.LocalDateTime;

public record StudentAdminListResponse(
        Long id,
        String name,
        String email,
        String phoneNumber,
        String gender,
        Long collegeId,
        String collegeName,
        Long courseId,
        String courseName,
        String branch,
        String highestQualification,
        Double aggregateMarks,
        String academicScoreType,
        Integer yearOfPassing,
        LocalDateTime registrationDate,
        boolean testWritten,
        boolean testSubmitted,
        String examCode,
        Integer totalScore
) {}
