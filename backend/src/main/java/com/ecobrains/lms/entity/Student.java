package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "students", uniqueConstraints = {
        @UniqueConstraint(name = "uk_student_email", columnNames = "email"),
        @UniqueConstraint(name = "uk_student_phone", columnNames = "phone_number")
})
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

    @Column(nullable = false)
    private LocalDate dob;

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

    @Column(name = "highest_qualification", nullable = false, length = 50)
    private String highestQualification;

    @Column(name = "aggregate_marks", nullable = false)
    private Double aggregateMarks;

    @Column(name = "year_of_passing", nullable = false)
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
