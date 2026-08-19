package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * One row per question in a student's (jumbled) exam paper.
 * orderIndex preserves the section-balanced shuffle order so the paper can be
 * reconstructed identically on refresh/resume. selectedOption is null until answered.
 * isCorrect is computed and stored at submission time.
 */
@Entity
@Table(name = "student_answers", uniqueConstraints = {
        @UniqueConstraint(name = "uk_student_question", columnNames = {"student_id", "question_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudentAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(name = "order_index", nullable = false)
    private Integer orderIndex;

    @Enumerated(EnumType.STRING)
    @Column(name = "selected_option", length = 1)
    private AnswerOption selectedOption;

    @Column(name = "time_spent_seconds")
    @Builder.Default
    private Integer timeSpentSeconds = 0;

    @Column(name = "is_correct")
    private Boolean correct;
}
