package com.ecobrains.lms.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record DriveDetailResponse(
        Long examId,
        String examCode,
        LocalDate date,
        LocalDateTime startTime,
        LocalDateTime endTime,
        Long collegeId,
        String collegeName,
        long registered,
        long attempted,
        long notAttempted,
        Double averageScorePercent
) {}
