package com.ecobrains.lms.dto.request;

public record SaveProgressRequest(
        Long questionId,
        Integer selectedOptionIndex,
        Integer timeSpentInSeconds,
        Integer currentQuestionIndex,
        Boolean tabSwitch
) {}
