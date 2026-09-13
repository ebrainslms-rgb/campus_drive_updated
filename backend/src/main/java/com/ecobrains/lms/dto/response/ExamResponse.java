package com.ecobrains.lms.dto.response;

import com.ecobrains.lms.entity.Exam;
import com.ecobrains.lms.entity.ExamStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record ExamResponse(
        Long id,
        Long collegeId,
        String collegeName,
        Long courseId,
        String courseName,
        LocalDate date,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String examCode,
        ExamStatus status,
        boolean editable,
        long submittedCount
) {
    public static ExamResponse from(Exam e, long submittedCount) {
        return new ExamResponse(
                e.getId(),
                e.getCollege().getId(), e.getCollege().getName(),
                e.getCourse() != null ? e.getCourse().getId() : null,
                e.getCourse() != null ? e.getCourse().getName() : null,
                e.getDate(), e.getStartTime(), e.getEndTime(), e.getExamCode(),
                e.deriveStatus(), e.isEditable(), submittedCount
        );
    }
}
