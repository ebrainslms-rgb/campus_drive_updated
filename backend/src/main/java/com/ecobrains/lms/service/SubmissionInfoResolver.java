package com.ecobrains.lms.service;

import com.ecobrains.lms.entity.ActivityLog;
import com.ecobrains.lms.repository.ActivityLogRepository;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Resolves "how/when did this student submit" for a batch of students in
 * ONE query (not one per row) - see the decision to reuse ActivityLog
 * instead of adding new Student columns. Reused by both the drive-details
 * student list and the single-student detail page.
 */
@Component
public class SubmissionInfoResolver {

    private final ActivityLogRepository activityLogRepository;

    public SubmissionInfoResolver(ActivityLogRepository activityLogRepository) {
        this.activityLogRepository = activityLogRepository;
    }

    /** studentId -> most recent AUTO_SUBMIT/MANUAL_SUBMIT event (query is already ordered newest-first). */
    public Map<Long, ActivityLog> resolve(List<Long> studentIds) {
        Map<Long, ActivityLog> result = new HashMap<>();
        if (studentIds.isEmpty()) return result;
        for (ActivityLog event : activityLogRepository.findSubmissionEvents(studentIds)) {
            result.putIfAbsent(event.getStudent().getId(), event);
        }
        return result;
    }

    public String submissionType(ActivityLog event) {
        if (event == null) return null;
        return switch (event.getEventType()) {
            case AUTO_SUBMIT -> "AUTO";
            case MANUAL_SUBMIT -> "MANUAL";
            default -> null;
        };
    }
}
