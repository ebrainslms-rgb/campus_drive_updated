package com.ecobrains.lms.dto.response;

import com.ecobrains.lms.entity.AdminLog;

import java.time.LocalDateTime;

public record UploadHistoryEntryResponse(
        Long id,
        LocalDateTime timestamp,
        String course,
        String courseId,
        String fileName,
        int inserted,
        int skipped,
        String status,
        String adminEmail
) {
    public static UploadHistoryEntryResponse from(AdminLog log) {
        return new UploadHistoryEntryResponse(
                log.getId(), log.getCreatedAt(), log.getUploadCourseName(), log.getTargetId(),
                log.getUploadFileName(),
                log.getUploadInserted() != null ? log.getUploadInserted() : 0,
                log.getUploadSkipped() != null ? log.getUploadSkipped() : 0,
                log.getUploadStatus(), log.getAdminEmail()
        );
    }
}
