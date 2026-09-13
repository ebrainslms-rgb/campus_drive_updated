package com.ecobrains.lms.dto.request;

import java.util.List;

/** Dirty-answer synchronization request. The client sends only answers that changed since its last successful sync. */
public record SaveProgressBatchRequest(
        List<AnswerEntry> answers,
        Integer currentQuestionIndex,
        Boolean tabSwitch,
        Long clientSequence
) {
    public record AnswerEntry(Long questionId, Integer selectedOptionIndex, Integer timeSpentInSeconds) {}
}
