package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.ScheduleExamRequest;
import com.ecobrains.lms.dto.response.ExamResponse;
import com.ecobrains.lms.entity.AdminLog;
import com.ecobrains.lms.entity.College;
import com.ecobrains.lms.entity.Course;
import com.ecobrains.lms.entity.Exam;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.*;
import com.ecobrains.lms.security.CurrentUser;
import com.ecobrains.lms.util.ExamCodeGenerator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * Owns the examination lifecycle, including the critical, backend-enforced rule:
 * an exam may be edited only while it has not started (Exam.lockedAt == null).
 * The lock is set exactly once, the instant the first student calls startExam() -
 * never by wall-clock time alone - so admins can freely reschedule a slot right up
 * until someone actually walks in and begins. This is enforced here, independent of
 * whatever the React UI shows or hides, so a direct API call cannot bypass it.
 */
@Service
public class ExamService {

    private final ExamRepository examRepository;
    private final CollegeRepository collegeRepository;
    private final CourseRepository courseRepository;
    private final StudentRepository studentRepository;
    private final ExamCodeGenerator examCodeGenerator;
    private final AdminLogRepository adminLogRepository;

    public ExamService(ExamRepository examRepository, CollegeRepository collegeRepository,
                        CourseRepository courseRepository, StudentRepository studentRepository,
                        ExamCodeGenerator examCodeGenerator, AdminLogRepository adminLogRepository) {
        this.examRepository = examRepository;
        this.collegeRepository = collegeRepository;
        this.courseRepository = courseRepository;
        this.studentRepository = studentRepository;
        this.examCodeGenerator = examCodeGenerator;
        this.adminLogRepository = adminLogRepository;
    }

    @Transactional
    public ExamResponse schedule(ScheduleExamRequest req) {
        College college = collegeRepository.findById(req.collegeId())
                .orElseThrow(() -> ApiException.badRequest("Selected college not found."));
        if (!college.isActive()) {
            throw ApiException.badRequest("Cannot schedule exam: selected college is inactive.");
        }

        Course course = null;
        if (req.courseId() != null) {
            course = courseRepository.findById(req.courseId())
                    .orElseThrow(() -> ApiException.badRequest("Selected course not found."));
        }

        LocalDate date = LocalDate.parse(req.date());
        LocalDateTime start = LocalDateTime.of(date, LocalTime.parse(req.startTime()));
        LocalDateTime end = LocalDateTime.of(date, LocalTime.parse(req.endTime()));

        if (!end.isAfter(start)) {
            throw ApiException.badRequest("End time must be after start time.");
        }

        Exam exam = Exam.builder()
                .college(college)
                .course(course)
                .date(date)
                .startTime(start)
                .endTime(end)
                .examCode(examCodeGenerator.resolve(req.examCode()))
                .build();

        exam = examRepository.save(exam);
        logAction("EXAM_SCHEDULED", exam.getId());
        return ExamResponse.from(exam, 0);
    }

    @Transactional
    public ExamResponse update(Long id, ScheduleExamRequest req) {
        Exam exam = examRepository.findById(id).orElseThrow(() -> ApiException.notFound("Exam not found."));

        if (!exam.isEditable()) {
            throw ApiException.forbidden("This exam cannot be edited: a student has already started it.");
        }

        LocalDate date = LocalDate.parse(req.date());
        LocalDateTime start = LocalDateTime.of(date, LocalTime.parse(req.startTime()));
        LocalDateTime end = LocalDateTime.of(date, LocalTime.parse(req.endTime()));
        if (!end.isAfter(start)) {
            throw ApiException.badRequest("End time must be after start time.");
        }

        exam.setDate(date);
        exam.setStartTime(start);
        exam.setEndTime(end);
        if (req.courseId() != null) {
            exam.setCourse(courseRepository.findById(req.courseId())
                    .orElseThrow(() -> ApiException.badRequest("Selected course not found.")));
        }

        exam = examRepository.save(exam);
        logAction("EXAM_RESCHEDULED", exam.getId());

        long submitted = studentRepository.countByExamCodeAndExamSubmittedTrue(exam.getExamCode());
        return ExamResponse.from(exam, submitted);
    }

    /** Called by StudentExamService the moment a student actually starts - locks the exam forever. */
    @Transactional
    public void lockOnFirstStart(Exam exam) {
        if (exam.getLockedAt() == null) {
            exam.setLockedAt(LocalDateTime.now());
            examRepository.save(exam);
        }
    }

   public List<ExamResponse> getAll() {
    java.util.Map<String, Long> counts = attendance();
    return examRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(e -> ExamResponse.from(e, counts.getOrDefault(e.getExamCode(), 0L)))
            .toList();
}

   
public java.util.Map<String, Long> attendance() {
    java.util.Map<String, Long> map = new java.util.LinkedHashMap<>();
    for (var row : studentRepository.submittedCountsByExamCode()) {
        map.put(row.getExamCode(), row.getCount());
    }
    return map;
}

    private void logAction(String action, Long targetId) {
        adminLogRepository.save(AdminLog.builder()
                .adminEmail(CurrentUser.email())
                .action(action)
                .targetEntity("Exam")
                .targetId(String.valueOf(targetId))
                .build());
    }
}
