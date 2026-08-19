package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.DriveDetailResponse;
import com.ecobrains.lms.dto.response.DriveStudentResponse;
import com.ecobrains.lms.dto.response.DriveSummaryResponse;
import com.ecobrains.lms.entity.ActivityLog;
import com.ecobrains.lms.entity.Exam;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.ExamRepository;
import com.ecobrains.lms.repository.StudentAnswerRepository;
import com.ecobrains.lms.repository.StudentRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The Drive Details page (/admin/drives/{examId}) - students belonging to
 * ONE specific exam record (the existing Exam entity IS the drive; no
 * separate Drive concept was introduced). Also now backs the global
 * Drives list (allDrives()) - same Exam entity, no separate model, just a
 * different query scope (all colleges vs one exam's students).
 */
@Service
public class DriveService {

    private final ExamRepository examRepository;
    private final StudentRepository studentRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final SubmissionInfoResolver submissionInfoResolver;

    public DriveService(ExamRepository examRepository, StudentRepository studentRepository,
                         StudentAnswerRepository studentAnswerRepository, SubmissionInfoResolver submissionInfoResolver) {
        this.examRepository = examRepository;
        this.studentRepository = studentRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.submissionInfoResolver = submissionInfoResolver;
    }

    public DriveDetailResponse detail(Long examId) {
        Exam exam = examRepository.findById(examId).orElseThrow(() -> ApiException.notFound("Exam not found."));
        long registered = studentRepository.countRegistered(examId, null, null, null);
        long attempted = studentRepository.countAttempted(examId, null, null, null);
        Double avgPct = studentRepository.averageScorePercent(examId, null, null, null);

        return new DriveDetailResponse(
                exam.getId(), exam.getExamCode(), exam.getDate(), exam.getStartTime(), exam.getEndTime(),
                exam.getCollege().getId(), exam.getCollege().getName(),
                registered, attempted, registered - attempted, avgPct
        );
    }

    /** Global Drives page (new admin sidebar item) - every drive across
     *  every college, newest scheduled time first, server-side paginated.
     *  Registered counts are batched for the whole page in one query
     *  (registeredCountsForExamIds) rather than one query per row.
     *  Attempted/average-score are deliberately left null here - the
     *  global list only needs S.No/Drive Code/Date/Time/College/Registered
     *  per the spec, so there is no reason to run the extra per-drive
     *  aggregate queries computing numbers the UI never displays. */
    public Page<DriveSummaryResponse> allDrives(int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), size);
        Page<Exam> exams = examRepository.findAllByOrderByStartTimeDesc(pageable);

        List<Long> examIds = exams.getContent().stream().map(Exam::getId).toList();
        Map<Long, Long> registeredCounts = new HashMap<>();
        if (!examIds.isEmpty()) {
            for (var row : studentRepository.registeredCountsForExamIds(examIds)) {
                registeredCounts.put(row.getExamId(), row.getRegisteredCount());
            }
        }

        List<DriveSummaryResponse> rows = exams.getContent().stream()
                .map(e -> DriveSummaryResponse.basic(e, registeredCounts.getOrDefault(e.getId(), 0L), 0L, null))
                .toList();

        return new PageImpl<>(rows, pageable, exams.getTotalElements());
    }

    /**
     * Filtered, sorted, paginated student list for one drive. Score
     * filtering happens at the SQL level (see StudentRepository.findIdsInScoreRange) -
     * this two-step ID-then-entity approach keeps that query simple while
     * still returning fully-hydrated Student entities to build the response from.
     *
     * attemptStatus/submissionStatus params kept for backward compatibility
     * (harmless if null) - the Drive Details UI no longer sends them, per
     * the "remove unnecessary filters" requirement, but nothing else in the
     * codebase that might still call this with those set is broken.
     */
    public Page<DriveStudentResponse> students(Long examId, Long courseId, Double scoreMin, Double scoreMax,
                                                String attemptStatus, String submissionStatus,
                                                int page, int size, String sortDir) {
        Exam exam = examRepository.findById(examId).orElseThrow(() -> ApiException.notFound("Exam not found."));

        Boolean attemptedOnly = "ATTEMPTED".equalsIgnoreCase(attemptStatus) ? Boolean.TRUE
                : "NOT_ATTEMPTED".equalsIgnoreCase(attemptStatus) ? Boolean.FALSE : null;
        Boolean submittedOnly = "SUBMITTED".equalsIgnoreCase(submissionStatus) ? Boolean.TRUE
                : "NOT_SUBMITTED".equalsIgnoreCase(submissionStatus) ? Boolean.FALSE : null;

        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), size);
        Page<Long> idPage = studentRepository.findIdsInScoreRange(
                examId, courseId, attemptedOnly, submittedOnly, scoreMin, scoreMax, pageable);

        List<Student> students = studentRepository.findAllById(idPage.getContent());
        // findAllById does not preserve order - re-sort by score to match the requested sort direction.
        Comparator<Student> byScore = Comparator.comparing(s -> s.getTotalScore() != null ? s.getTotalScore() : -1);
        students.sort("asc".equalsIgnoreCase(sortDir) ? byScore : byScore.reversed());

        Page<Student> studentsPage = new PageImpl<>(students, pageable, idPage.getTotalElements());
        return hydrate(studentsPage, exam.getCollege().getName());
    }

    /** Same filters as students(), but unpaginated - for "All Filtered
     *  Students" export. Bounded in practice to one drive's student count
     *  (hundreds to low thousands), not the whole database, so a single
     *  large page is an acceptable trade-off against building a second,
     *  fully-streaming export path. */
    public List<DriveStudentResponse> exportRows(Long examId, Long courseId, Double scoreMin, Double scoreMax,
                                                  String attemptStatus, String submissionStatus, String sortDir) {
        Page<DriveStudentResponse> all = students(examId, courseId, scoreMin, scoreMax,
                attemptStatus, submissionStatus, 1, 50_000, sortDir);
        return all.getContent();
    }

    /**
     * Unified export data-source for all three modes the Export modal
     * offers. Each mode maps to exactly one existing query path - no new
     * scoring/filtering logic, just choosing which call to make:
     *   CURRENT_PAGE   -> students() with the SAME page/size the admin is
     *                     currently viewing on screen.
     *   ALL_FILTERED   -> exportRows() with the SAME filters, unpaginated.
     *   ALL_STUDENTS   -> exportRows() with every filter cleared (courseId/
     *                     scoreMin/scoreMax null), still scoped to this one
     *                     drive/examId.
     */
    public List<DriveStudentResponse> exportForMode(Long examId, String mode, Long courseId,
                                                      Double scoreMin, Double scoreMax, String sortDir,
                                                      int currentPage, int currentSize) {
        if ("CURRENT_PAGE".equalsIgnoreCase(mode)) {
            return students(examId, courseId, scoreMin, scoreMax, null, null, currentPage, currentSize, sortDir).getContent();
        }
        if ("ALL_STUDENTS".equalsIgnoreCase(mode)) {
            return exportRows(examId, null, null, null, null, null, sortDir);
        }
        // ALL_FILTERED (default/fallback)
        return exportRows(examId, courseId, scoreMin, scoreMax, null, null, sortDir);
    }

    /** Batch-hydrates submission-type/paper-size/answered-count for one
     *  page of students in three extra queries total (not per-row).
     *  collegeName is passed in once (same for every row - all students in
     *  a Drive Details listing belong to the same drive/college) rather
     *  than re-derived per row. Score-range filtering already happened at
     *  the SQL level in students(). */
    private Page<DriveStudentResponse> hydrate(Page<Student> studentsPage, String collegeName) {
        List<Student> students = studentsPage.getContent();
        List<Long> ids = students.stream().map(Student::getId).toList();

        Map<Long, Long> paperSizes = new HashMap<>();
        for (var row : studentAnswerRepository.paperSizesFor(ids)) {
            paperSizes.put(row.getStudentId(), row.getPaperSize());
        }
        Map<Long, Long> answeredCounts = new HashMap<>();
        for (var row : studentAnswerRepository.answeredCountsFor(ids)) {
            answeredCounts.put(row.getStudentId(), row.getAnsweredCount());
        }
        Map<Long, ActivityLog> submissions = submissionInfoResolver.resolve(ids);

        List<DriveStudentResponse> rows = new ArrayList<>();
        for (Student s : students) {
            Long paperSize = paperSizes.get(s.getId());
            Long answered = answeredCounts.getOrDefault(s.getId(), 0L);
            Double pct = (s.isExamSubmitted() && paperSize != null && paperSize > 0)
                    ? (s.getTotalScore() / (double) paperSize) * 100 : null;

            ActivityLog submitEvent = submissions.get(s.getId());
            Long durationSeconds = (s.getStartedAt() != null && submitEvent != null)
                    ? ChronoUnit.SECONDS.between(s.getStartedAt(), submitEvent.getTimestamp()) : null;

            rows.add(new DriveStudentResponse(
                    s.getId(), s.getFullName(),
                    s.getCourse() != null ? s.getCourse().getId() : null,
                    s.getCourse() != null ? s.getCourse().getName() : null,
                    s.isExamSubmitted() ? s.getTotalScore() : null,
                    paperSize != null ? paperSize.intValue() : null,
                    pct, s.isExamStarted(), s.isExamSubmitted(),
                    submissionInfoResolver.submissionType(submitEvent),
                    submitEvent != null ? submitEvent.getTimestamp() : null,
                    durationSeconds,
                    s.getEmail(), s.getPhoneNumber(), collegeName, s.getBranch(),
                    s.getHighestQualification(), s.getAggregateMarks(), s.getYearOfPassing(),
                    s.getSelectedInCampusDrive(), answered.intValue()
            ));
        }

        return new PageImpl<>(rows, studentsPage.getPageable(), studentsPage.getTotalElements());
    }
}
