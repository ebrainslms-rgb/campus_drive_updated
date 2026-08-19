package com.ecobrains.lms.dto.response;

import java.time.Instant;
import java.util.List;

public record ExamStateResponse(
        List<QuestionExamResponse> questions,
        int currentQuestionIndex,
        int tabSwitchViolations,
        boolean isStarted,
        boolean isSubmitted,
        Instant serverNow,
        Instant slotStartTime,
        Instant slotEndTime
) {}
