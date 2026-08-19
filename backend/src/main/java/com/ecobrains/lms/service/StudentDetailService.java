package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.StudentDetailResponse;
import com.ecobrains.lms.entity.ActivityLog;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.StudentAnswerRepository;
import com.ecobrains.lms.repository.StudentRepository;
import org.springframework.stereotype.Service;

import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/** The Student Details drill-down page (/admin/students/{studentId}). */
@Service
public class StudentDetailService {

    private final StudentRepository studentRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final SubmissionInfoResolver submissionInfoResolver;

    public StudentDetailService(StudentRepository studentRepository, StudentAnswerRepository studentAnswerRepository,
                                 SubmissionInfoResolver submissionInfoResolver) {
        this.studentRepository = studentRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.submissionInfoResolver = submissionInfoResolver;
    }

    public StudentDetailResponse get(Long studentId) {
        Student s = studentRepository.findById(studentId).orElseThrow(() -> ApiException.notFound("Student not found."));

        int paperSize = studentAnswerRepository.findByStudentIdOrderByOrderIndexAsc(studentId).size();
        Double pct = (s.isExamSubmitted() && paperSize > 0) ? (s.getTotalScore() / (double) paperSize) * 100 : null;

        Map<Long, ActivityLog> submissions = submissionInfoResolver.resolve(List.of(studentId));
        ActivityLog submitEvent = submissions.get(studentId);
        Long durationSeconds = (s.getStartedAt() != null && submitEvent != null)
                ? ChronoUnit.SECONDS.between(s.getStartedAt(), submitEvent.getTimestamp()) : null;

        return new StudentDetailResponse(
                s.getId(), s.getFullName(), s.getEmail(), s.getPhoneNumber(),
                s.getCollege().getId(), s.getCollege().getName(),
                s.getCourse() != null ? s.getCourse().getId() : null,
                s.getCourse() != null ? s.getCourse().getName() : null,
                s.getBranch(), s.getHighestQualification(), s.getAggregateMarks(), s.getYearOfPassing(),
                s.getExam() != null ? s.getExam().getId() : null,
                s.getExamCode(),
                s.getExam() != null ? s.getExam().getDate() : null,
                s.isExamStarted(), s.isExamSubmitted(),
                s.isExamSubmitted() ? s.getTotalScore() : null,
                paperSize > 0 ? paperSize : null,
                pct,
                submissionInfoResolver.submissionType(submitEvent),
                submitEvent != null ? submitEvent.getTimestamp() : null,
                durationSeconds,
                s.getTabSwitchViolations()
        );
    }
}
