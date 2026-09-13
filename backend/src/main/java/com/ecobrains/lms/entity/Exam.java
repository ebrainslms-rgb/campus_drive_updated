package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * An examination "drive" at a college (the old "Test" model).
 * Business rule: editable only while {@code lockedAt == null}. lockedAt is set the moment
 * the first eligible student actually starts the exam (see requirement: exam-lock-on-start,
 * NOT lock-by-clock-time). Enforced server-side in ExamService, independent of the frontend.
 */
@Entity
@Table(name = "exams", uniqueConstraints = {
        @UniqueConstraint(name = "uk_exam_code", columnNames = "exam_code")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Exam {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "college_id", nullable = false)
    private College college;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course course;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;

    @Column(name = "exam_code", nullable = false, unique = true, length = 10)
    private String examCode;

    /** Set once, the instant the first student calls start-exam. Null == never started == editable. */
    @Column(name = "locked_at")
    private LocalDateTime lockedAt;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    @Transient
    public boolean isLocked() {
        return lockedAt != null;
    }

    @Transient
    public ExamStatus deriveStatus() {
        LocalDateTime now = LocalDateTime.now();
        if (now.isAfter(endTime)) return ExamStatus.COMPLETED;
        if (lockedAt != null) return ExamStatus.STARTED;
        return ExamStatus.SCHEDULED;
    }

    @Transient
    public boolean isEditable() {
        // Deliberately depends ONLY on lockedAt, not on deriveStatus()/clock
        // time. lockedAt is set the instant a student actually enters the
        // exam (fullscreen, begins answering) - see
        // StudentExamService.startExam() -> ExamService.lockOnFirstStart().
        // Editability must track that real-world event, not the scheduled
        // end time passing on the clock: an exam that's simply running late
        // (e.g. delayed by a meeting) with zero students having entered yet
        // should stay editable even after its original end time has passed.
        return lockedAt == null;
    }
}
