package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotBlank;

public record CollegeRequest(
        @NotBlank(message = "College name is required") String name,
        @NotBlank(message = "Location is required") String location,
        String district,
        @NotBlank(message = "State is required") String state,
        String spocName,
        String email,
        String mobileNumber
) {}
