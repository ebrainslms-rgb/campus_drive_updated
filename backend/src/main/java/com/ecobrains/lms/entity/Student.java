package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.DynamicUpdate;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "students", uniqueConstraints = {
        @UniqueConstraint(name = "uk_student_email", columnNames = "email"),
        @UniqueConstraint(name = "uk_student_phone", columnNames = "phone_number")
})
// Only the columns that actually changed are included in the UPDATE
// statement, instead of all ~25 mapped columns every time. Doesn't reduce
// how many updates happen, but shrinks each one, which means less time
// holding the row lock - directly reduces contention/deadlock risk on
// this specific row, which is exactly what the save-progress and
// exam-submit paths repeatedly write to under load.
@DynamicUpdate
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Student {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    @Column(nullable = true)
    private LocalDate dob;

    @Column(length = 20)
    private String gender;

    @Column(name = "phone_number", nullable = false, unique = true, length = 15)
    private String phoneNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "college_id", nullable = false)
    private College college;

    @Column(nullable = false, length = 150)
    private String location;

    @Column(length = 50)
    private String state;

    @Column(nullable = false, length = 50)
    private String branch;

    @Column(name = "highest_qualification", nullable = true, length = 50)
    private String highestQualification;

    @Column(name = "aggregate_marks", nullable = true)
    private Double aggregateMarks;

    // "CGPA" or "PERCENTAGE" - which scale aggregateMarks is actually in.
    // Different colleges use different systems, so this can genuinely vary
    // student-to-student even within the same college. Deliberately
    // NULLABLE at the database level, even though every NEW registration
    // always sets it - existing student rows from before this column
    // existed have no value here, and a NOT NULL column added to a table
    // that already has real rows is a genuinely risky migration to leave
    // to Hibernate's auto-DDL. Anywhere this is read for display, treat a
    // null the same as "PERCENTAGE" (see StudentDetailResponse etc.),
    // since percentage was the only option that ever existed before now.
    @Column(name = "academic_score_type", length = 20)
    private String academicScoreType;

    @Column(name = "year_of_passing", nullable = true)
    private Integer yearOfPassing;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(name = "selected_in_campus_drive", length = 10)
    private String selectedInCampusDrive;

    @Column(name = "registration_date")
    private LocalDateTime registrationDate;

    // -- Exam binding / state ----------------------------------------
    @Column(name = "exam_code", length = 10)
    private String examCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_id")
    private Exam exam;

    @Column(name = "exam_started", nullable = false)
    @Builder.Default
    private boolean examStarted = false;

    @Column(name = "exam_submitted", nullable = false)
    @Builder.Default
    private boolean examSubmitted = false;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "last_saved_at")
    private LocalDateTime lastSavedAt;

    @Column(name = "current_question_index")
    @Builder.Default
    private Integer currentQuestionIndex = 0;

    @Column(name = "tab_switch_violations")
    @Builder.Default
    private Integer tabSwitchViolations = 0;

    /** Server-side safety copy of live exam access control. Redis is the live state,
     * but critical access restrictions are mirrored here so a Redis outage cannot
     * silently erase a fraud decision. */
    @Column(name = "exam_access_status", length = 20)
    @Builder.Default
    private String examAccessStatus = "READY";

    @Column(name = "restriction_until")
    private LocalDateTime restrictionUntil;

    // -- Scores (denormalized snapshot for fast dashboard reads) -----
    @Column(name = "aptitude_score")
    @Builder.Default
    private Integer aptitudeScore = 0;

    @Column(name = "logical_score")
    @Builder.Default
    private Integer logicalScore = 0;

    @Column(name = "technical_score")
    @Builder.Default
    private Integer technicalScore = 0;

    @Column(name = "frontend_score")
    @Builder.Default
    private Integer frontendScore = 0;

    @Column(name = "total_score")
    @Builder.Default
    private Integer totalScore = 0;

    @PrePersist
    void onCreate() {
        if (registrationDate == null) registrationDate = LocalDateTime.now();
    }
}
