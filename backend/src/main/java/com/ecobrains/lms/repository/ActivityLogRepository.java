package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.ActivityEventType;
import com.ecobrains.lms.entity.ActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, Long> {

    /**
     * One batched query for a whole page of students' submission events -
     * used instead of a per-row lookup (which would be N+1) whenever a
     * drive/student list needs "Manual vs Auto" + submission time. Callers
     * group the flat result list by student id in Java afterward.
     */
    @Query("""
        SELECT a FROM ActivityLog a
        WHERE a.student.id IN :studentIds
          AND a.eventType IN (com.ecobrains.lms.entity.ActivityEventType.AUTO_SUBMIT,
                               com.ecobrains.lms.entity.ActivityEventType.MANUAL_SUBMIT)
        ORDER BY a.timestamp DESC
        """)
    List<ActivityLog> findSubmissionEvents(@Param("studentIds") List<Long> studentIds);
}
