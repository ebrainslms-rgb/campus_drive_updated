package com.ecobrains.lms.dto.request;

import java.util.List;

/**
 * Batched replacement for the old per-question SaveProgressRequest. One
 * page navigation now sends ONE request carrying every question's current
 * answer on that page, instead of firing one HTTP request per question
 * (5 separate calls for a 5-question page). This is the actual capacity
 * fix: it cuts both HTTP request volume and the number of full Student-row
 * updates per page by 5x, which is what was causing MySQL deadlocks under
 * concurrent load.
 */
public record SaveProgressBatchRequest(
        List<AnswerEntry> answers,
        Integer currentQuestionIndex,
        Boolean tabSwitch
) {
    public record AnswerEntry(Long questionId, Integer selectedOptionIndex, Integer timeSpentInSeconds) {}
}
