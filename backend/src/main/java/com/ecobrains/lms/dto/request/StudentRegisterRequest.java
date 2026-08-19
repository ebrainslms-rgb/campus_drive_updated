package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.*;

public record StudentRegisterRequest(
        @NotBlank(message = "Full name is required") String fullName,
        @NotBlank(message = "Email is required") @Email(message = "Invalid email address") String email,
        @NotNull(message = "Date of birth is required") String dob,
        @NotBlank(message = "Phone number is required") @Pattern(regexp = "\\d{10}", message = "Phone number must be exactly 10 digits") String phoneNumber,
        @NotBlank(message = "College is required") String collegeName,
        @NotBlank(message = "Location is required") String location,
        String state,
        @NotBlank(message = "Branch is required") String branch,
        @NotBlank(message = "Highest qualification is required") String highestQualification,
        @NotNull(message = "Aggregate marks is required") @DecimalMin(value = "0.0", message = "Aggregate marks cannot be negative") @DecimalMax(value = "100.0", message = "Aggregate marks cannot exceed 100") Double aggregateMarks,
        @NotNull(message = "Year of passing is required") Integer yearOfPassing,
        @NotBlank(message = "Course is required") String courseName,
        String selectedInCampusDrive
) {}
