package com.ecobrains.lms.dto.response;

public record BulkStudentRowResponse(
        int rowNumber, String fullName, String email, String phoneNumber, String gender,
        String status, String error
) {}
