package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * Payload for editing an EXISTING exam's schedule (PUT /api/admin/exams/{id}).
 * Deliberately separate from ScheduleExamRequest (used to create a brand new
 * exam) - editing never changes which college an exam belongs to, so
 * collegeId is not part of this DTO at all, not just left optional. Sharing
 * one DTO between "create" (which genuinely needs collegeId) and "edit"
 * (which never does) was the actual bug behind every "Validation failed"
 * error when editing a slot's timings: collegeId was required here even
 * though the edit form never sends it and ExamService.update() never reads it.
 */
public record RescheduleExamRequest(
        Long courseId,
        @NotBlank(message = "Date is required") String date,
        @NotBlank(message = "Start time is required") String startTime,
        @NotBlank(message = "End time is required") String endTime
) {}
