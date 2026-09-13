package com.ecobrains.lms.dto.request;

/** Body for PUT /api/admin/questions/{id}. type/correctAnswer use the
 *  same string values the CSV upload already accepts (lowercase type,
 *  A/B/C/D correctAnswer) - one shared validation rule for both paths,
 *  see QuestionService. */
public record UpdateQuestionRequest(
        String type, String question,
        String optionA, String optionB, String optionC, String optionD,
        String correctAnswer
) {}
