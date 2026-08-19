package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.*;
import com.ecobrains.lms.repository.CollegeRepository;
import com.ecobrains.lms.repository.ExamRepository;
import com.ecobrains.lms.repository.StudentRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Main Admin Overview dashboard - college/student/drive summary across the
 * whole system, scoped by optional examId/courseId/date-range filters.
 * Every number here comes from a real DB aggregate query (COUNT/AVG/GROUP BY) -
 * nothing is loaded into Java memory and summed by hand.
 */
@Service
public class DashboardOverviewService {

    private final StudentRepository studentRepository;
    private final ExamRepository examRepository;
    private final CollegeRepository collegeRepository;

    public DashboardOverviewService(StudentRepository studentRepository, ExamRepository examRepository,
                                     CollegeRepository collegeRepository) {
        this.studentRepository = studentRepository;
        this.examRepository = examRepository;
        this.collegeRepository = collegeRepository;
    }

    public OverviewKpiResponse kpis(Long examId, Long courseId, LocalDateTime from, LocalDateTime to) {
        long registeredColleges;
        if (examId != null || from != null || to != null) {
            // A filter that actually scopes by exam/date is active - "registered
            // colleges" means colleges participating within that scope.
            registeredColleges = examRepository.countDistinctColleges(examId, from, to);
        } else {
            // No exam/date filter - "registered colleges" means every college
            // onboarded into the system, matching the original simple dashboard.
            registeredColleges = collegeRepository.count();
        }

        long totalRegisteredStudents = studentRepository.countRegistered(examId, courseId, from, to);
        long examsAttempted = studentRepository.countAttempted(examId, courseId, from, to);
        Double averageScorePercent = studentRepository.averageScorePercent(examId, courseId, from, to);

        return new OverviewKpiResponse(registeredColleges, totalRegisteredStudents, examsAttempted, averageScorePercent);
    }

    public PerformanceDistributionResponse performanceDistribution(Long examId, Long courseId, LocalDateTime from, LocalDateTime to) {
        StudentRepository.PerformanceBucketRow row = studentRepository.performanceDistribution(examId, courseId, from, to);
        return toResponse(row);
    }

    public List<CourseInterestResponse> courseInterest(Long examId, Long courseId, LocalDateTime from, LocalDateTime to) {
        return studentRepository.courseInterest(examId, courseId, from, to).stream()
                .map(r -> new CourseInterestResponse(r.getCourseId(), r.getCourseName(), r.getStudentCount()))
                .toList();
    }

    public List<TopCollegeResponse> topColleges(Long examId, Long courseId, LocalDateTime from, LocalDateTime to, int limit) {
        return studentRepository.topColleges(examId, courseId, from, to).stream()
                .limit(limit)
                .map(r -> {
                    var college = collegeRepository.findById(r.getCollegeId()).orElse(null);
                    String code = college != null ? college.getCode() : null;
                    return new TopCollegeResponse(r.getCollegeId(), r.getCollegeName(), code, r.getStudentCount());
                })
                .toList();
    }

    static PerformanceDistributionResponse toResponse(StudentRepository.PerformanceBucketRow row) {
        if (row == null) return PerformanceDistributionResponse.zero();
        long excellent = nz(row.getExcellent());
        long good = nz(row.getGood());
        long average = nz(row.getAverage());
        long belowAverage = nz(row.getBelowAverage());
        long poor = nz(row.getPoor());
        return new PerformanceDistributionResponse(excellent, good, average, belowAverage, poor,
                excellent + good + average + belowAverage + poor);
    }

    static long nz(Long v) {
        return v != null ? v : 0L;
    }
}
