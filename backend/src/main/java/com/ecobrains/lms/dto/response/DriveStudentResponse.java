package com.ecobrains.lms.dto.response;

import java.time.LocalDateTime;

/** One row in the Drive Details student table AND the Excel export - same
 *  DTO for both so there's a single hydration path, not two that could
 *  drift apart. The extra fields below (email, phoneNumber, collegeName,
 *  branch, highestQualification, aggregateMarks, yearOfPassing,
 *  selectedInCampusDrive, answeredCount) were added on top of the
 *  existing fields purely for the Excel export - nothing existing was
 *  removed or renamed, so the on-screen table is unaffected if it simply
 *  doesn't reference the new fields. */
public record DriveStudentResponse(
        Long studentId,
        String fullName,
        Long courseId,
        String courseName,
        Integer totalScore,
        Integer paperSize,
        Double scorePercent,
        boolean attempted,
        boolean submitted,
        String submissionType,      // "MANUAL" | "AUTO" | null (not submitted yet)
        LocalDateTime submissionTime,
        Long attemptDurationSeconds, // null if not started/finished
        // -- export-only additions below --
        String email,
        String phoneNumber,
        String collegeName,
        String branch,
        String highestQualification,
        Double aggregateMarks,
        Integer yearOfPassing,
        String selectedInCampusDrive, // raw stored value (e.g. "YES"/"NO") - normalised at export time
        Integer answeredCount        // distinct from paperSize (= total questions); this is how many were actually answered
) {}
