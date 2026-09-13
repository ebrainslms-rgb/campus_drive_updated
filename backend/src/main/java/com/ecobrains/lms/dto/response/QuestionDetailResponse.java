package com.ecobrains.lms.dto.response;

import com.ecobrains.lms.entity.Question;

/** Full detail for one question - used by the admin Review/Edit screens
 *  only (the student exam API has its own, separate response shape that
 *  never exposes correctAnswer to students). type/correctAnswer are
 *  sent as lowercase/uppercase strings matching exactly what the CSV
 *  upload already expects, so the edit form and the CSV format never
 *  disagree on valid values. */
public record QuestionDetailResponse(
        Long id, String type, String question,
        String optionA, String optionB, String optionC, String optionD,
        String correctAnswer
) {
    public static QuestionDetailResponse from(Question q) {
        return new QuestionDetailResponse(
                q.getId(), q.getType().name().toLowerCase(), q.getQuestion(),
                q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD(),
                q.getCorrectAnswer().name()
        );
    }
}
