package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.*;
import com.ecobrains.lms.entity.College;
import com.ecobrains.lms.entity.Exam;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.CollegeRepository;
import com.ecobrains.lms.repository.ExamRepository;
import com.ecobrains.lms.repository.StudentAnswerRepository;
import com.ecobrains.lms.repository.StudentRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The College Overview drill-down page (/admin/colleges/{collegeId}) - a
 * separate page from the main dashboard, never rendered beneath it.
 */
@Service
public class CollegeOverviewService {

    private final CollegeRepository collegeRepository;
    private final ExamRepository examRepository;
    private final StudentRepository studentRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final SubmissionInfoResolver submissionInfoResolver;

    public CollegeOverviewService(CollegeRepository collegeRepository, ExamRepository examRepository,
                                   StudentRepository studentRepository, StudentAnswerRepository studentAnswerRepository,
                                   SubmissionInfoResolver submissionInfoResolver) {
        this.collegeRepository = collegeRepository;
        this.examRepository = examRepository;
        this.studentRepository = studentRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.submissionInfoResolver = submissionInfoResolver;
    }

    public CollegeOverviewResponse overview(Long collegeId, Integer year) {
        College college = collegeRepository.findById(collegeId)
                .orElseThrow(() -> ApiException.notFound("College not found."));

        List<Integer> availableYears = examRepository.distinctYearsForCollege(collegeId);

        long totalStudents = studentRepository.countRegisteredForCollege(collegeId, year);
        long attempted = studentRepository.countAttemptedForCollege(collegeId, year);
        long totalDrives = examRepository.countByCollegeIdAndYear(collegeId, year);

        Double avgPct = studentRepository.averageScorePercentForCollege(collegeId, year);
        Double highPct = studentRepository.highestScorePercentForCollege(collegeId, year);
        Double lowPct = studentRepository.lowestScorePercentForCollege(collegeId, year);

        PerformanceDistributionResponse dist =
                DashboardOverviewService.toResponse(studentRepository.performanceDistributionForCollege(collegeId, year));

        List<CourseInterestResponse> courseInterest = studentRepository.courseInterestForCollege(collegeId, year).stream()
                .map(r -> new CourseInterestResponse(r.getCourseId(), r.getCourseName(), r.getStudentCount()))
                .toList();

        return new CollegeOverviewResponse(
                college.getId(), college.getName(), college.getCode(), college.getLocation(), college.getState(),
                year, availableYears,
                totalStudents, attempted, totalStudents - attempted, totalDrives,
                avgPct, highPct, lowPct, dist, courseInterest
        );
    }

    /** Latest N drives for the carousel, or a full paginated page for "View All" - same query either way. */
    public Page<DriveSummaryResponse> drives(Long collegeId, int page, int size) {
        collegeRepository.findById(collegeId).orElseThrow(() -> ApiException.notFound("College not found."));

        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), size, Sort.by("startTime").descending());
        Page<Exam> exams = examRepository.findByCollegeIdOrderByStartTimeDesc(collegeId, pageable);

        return exams.map(e -> {
            long registered = studentRepository.countRegistered(e.getId(), null, null, null);
            long attempted = studentRepository.countAttempted(e.getId(), null, null, null);
            Double avgPct = studentRepository.averageScorePercent(e.getId(), null, null, null);
            return DriveSummaryResponse.basic(e, registered, attempted, avgPct);
        });
    }

    /** Top Performers / "View All Students" for one college - same sorted-by-score,
     *  batched-hydration pattern as DriveService.students(), scoped by college
     *  (and optional year) instead of one exam. */
    public Page<DriveStudentResponse> students(Long collegeId, Integer year, int page, int size, String sortDir) {
        com.ecobrains.lms.entity.College college = collegeRepository.findById(collegeId)
                .orElseThrow(() -> ApiException.notFound("College not found."));

        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), size);
        Page<Long> idPage = studentRepository.findIdsForCollegeSortedByScoreDesc(collegeId, year, pageable);

        List<com.ecobrains.lms.entity.Student> students = studentRepository.findAllById(idPage.getContent());
        java.util.Comparator<com.ecobrains.lms.entity.Student> byScore =
                java.util.Comparator.comparing(s -> s.getTotalScore() != null ? s.getTotalScore() : -1);
        students.sort("asc".equalsIgnoreCase(sortDir) ? byScore : byScore.reversed());

        List<Long> ids = students.stream().map(com.ecobrains.lms.entity.Student::getId).toList();
        java.util.Map<Long, Long> paperSizes = new java.util.HashMap<>();
        for (var row : studentAnswerRepository.paperSizesFor(ids)) paperSizes.put(row.getStudentId(), row.getPaperSize());
        java.util.Map<Long, Long> answeredCounts = new java.util.HashMap<>();
        for (var row : studentAnswerRepository.answeredCountsFor(ids)) answeredCounts.put(row.getStudentId(), row.getAnsweredCount());
        java.util.Map<Long, com.ecobrains.lms.entity.ActivityLog> submissions = submissionInfoResolver.resolve(ids);

        List<DriveStudentResponse> rows = new java.util.ArrayList<>();
        for (var s : students) {
            Long paperSize = paperSizes.get(s.getId());
            Long answered = answeredCounts.getOrDefault(s.getId(), 0L);
            Double pct = (s.isExamSubmitted() && paperSize != null && paperSize > 0)
                    ? (s.getTotalScore() / (double) paperSize) * 100 : null;
            var submitEvent = submissions.get(s.getId());
            Long durationSeconds = (s.getStartedAt() != null && submitEvent != null)
                    ? java.time.temporal.ChronoUnit.SECONDS.between(s.getStartedAt(), submitEvent.getTimestamp()) : null;

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
                    s.getEmail(), s.getPhoneNumber(), college.getName(), s.getBranch(),
                    s.getHighestQualification(), s.getAggregateMarks(), s.getYearOfPassing(),
                    s.getSelectedInCampusDrive(), answered.intValue()
            ));
        }

        return new org.springframework.data.domain.PageImpl<>(rows, pageable, idPage.getTotalElements());
    }
}
