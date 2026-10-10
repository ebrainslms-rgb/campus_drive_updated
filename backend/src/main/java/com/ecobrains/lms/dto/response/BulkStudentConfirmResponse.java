package com.ecobrains.lms.dto.response;

public record BulkStudentConfirmResponse(
        int totalRows, int uploadedSuccessfully, int alreadyRegistered, String existingReportBase64, String existingDatabaseReportBase64, String failedReportBase64
) {}
