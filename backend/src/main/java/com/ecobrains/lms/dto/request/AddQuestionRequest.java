package com.ecobrains.lms.dto.request;

/** Body for POST /api/admin/questions - adding one individual question to
 *  a course outside of the CSV bulk-upload flow. Secondary to CSV upload,
 *  not a replacement for it. */
public record AddQuestionRequest(
        Long courseId, String type, String question,
        String optionA, String optionB, String optionC, String optionD,
        String correctAnswer
) {}
