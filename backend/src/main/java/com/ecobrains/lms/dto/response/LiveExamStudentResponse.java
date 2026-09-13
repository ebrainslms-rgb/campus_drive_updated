package com.ecobrains.lms.dto.response;

import java.time.Instant;

public record LiveExamStudentResponse(
        Long studentId,
        String fullName,
        String email,
        String courseName,
        String status,
        int tabSwitchViolations,
        Instant restrictionUntil,
        int currentQuestionIndex,
        int answeredCount,
        int totalQuestions,
        Instant startedAt,
        Instant deadline,
        boolean submitted
) {}
