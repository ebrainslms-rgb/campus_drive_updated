package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotBlank;

public record StudentLoginRequest(
        @NotBlank(message = "Email is required") String email,
        @NotBlank(message = "Exam code is required") String examCode,
        @NotBlank(message = "College name is required") String collegeName
) {}
