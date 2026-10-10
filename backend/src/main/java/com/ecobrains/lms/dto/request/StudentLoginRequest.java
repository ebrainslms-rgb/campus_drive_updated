package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotBlank;

public record StudentLoginRequest(
        @NotBlank(message = "Email or mobile number is required") String identifier,
        @NotBlank(message = "Exam code is required") String examCode,
        @NotBlank(message = "College name is required") String collegeName
) {}
