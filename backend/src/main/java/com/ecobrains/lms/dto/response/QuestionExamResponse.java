package com.ecobrains.lms.dto.response;

/** A question as shown to the student during the exam - correct answer stripped out. */
public record QuestionExamResponse(
        Long id,
        String type,
        String question,
        String optionA,
        String optionB,
        String optionC,
        String optionD,
        Integer selectedOptionIndex,
        Integer timeSpentInSeconds
) {}
