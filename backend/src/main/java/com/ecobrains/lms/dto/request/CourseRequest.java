package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotBlank;

public record CourseRequest(
        @NotBlank(message = "Course name is required") String name,
        String description
) {}
