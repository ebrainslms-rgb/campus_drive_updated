package com.ecobrains.lms.dto.request;

import java.util.List;

public record SubmitExamRequest(
        Boolean autoSubmitted,
        List<SaveProgressBatchRequest.AnswerEntry> answers,
        Integer currentQuestionIndex,
        Long clientSequence
) {}
