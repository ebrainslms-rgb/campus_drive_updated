package com.ecobrains.lms.dto.response;

import com.ecobrains.lms.entity.Exam;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** One row in "Recent Drives" / "View All Drives" / the latest-4 carousel.
 *  examId is always the real database identifier the frontend must use for
 *  navigation and filtering - examCode/date are for display only. */
public record DriveSummaryResponse(
        Long examId,
        String examCode,
        LocalDate date,
        LocalDateTime startTime,
        LocalDateTime endTime,
        Long collegeId,
        String collegeName,
        long registered,
        long attempted,
        long notAttempted,
        Double averageScorePercent
) {
    public static DriveSummaryResponse basic(Exam e, long registered, long attempted, Double avgPercent) {
        return new DriveSummaryResponse(
                e.getId(), e.getExamCode(), e.getDate(), e.getStartTime(), e.getEndTime(),
                e.getCollege().getId(), e.getCollege().getName(),
                registered, attempted, registered - attempted, avgPercent
        );
    }
}
