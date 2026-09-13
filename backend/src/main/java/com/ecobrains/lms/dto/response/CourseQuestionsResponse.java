package com.ecobrains.lms.dto.response;

import java.util.List;

/** Wraps the question list for the admin Review screen together with
 *  whether editing is currently locked (a student is genuinely mid-exam
 *  on this course right now) - so the frontend can show a clear warning
 *  and disable Edit/Add controls proactively, rather than only finding
 *  out after a save attempt fails. */
public record CourseQuestionsResponse(List<QuestionDetailResponse> questions, boolean editingLocked) {}
