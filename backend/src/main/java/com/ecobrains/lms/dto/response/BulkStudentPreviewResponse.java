package com.ecobrains.lms.dto.response;

import java.util.List;

public record BulkStudentPreviewResponse(
        int totalRows, int validNew, int alreadyRegistered, int invalidRows, int duplicateRows, int databaseConflicts,
        boolean canConfirm, List<BulkStudentRowResponse> rows, String failedReportBase64
) {}
