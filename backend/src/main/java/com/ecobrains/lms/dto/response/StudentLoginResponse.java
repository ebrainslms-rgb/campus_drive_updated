package com.ecobrains.lms.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record StudentLoginResponse(
        String message,
        String token,
        Long studentId,
        String fullName,
        String email,
        String collegeName,
        String courseName,
        String examCode,
        Long examId,
        LocalDate examDate,
        LocalDateTime examStartTime,
        LocalDateTime examEndTime,
        boolean examStarted,
        boolean examSubmitted
) {}
