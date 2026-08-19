package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ScheduleExamRequest(
        @NotNull(message = "College is required") Long collegeId,
        Long courseId,
        @NotBlank(message = "Date is required") String date,
        @NotBlank(message = "Start time is required") String startTime,
        @NotBlank(message = "End time is required") String endTime,
        String examCode
) {}
