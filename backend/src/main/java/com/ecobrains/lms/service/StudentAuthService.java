package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.StudentLoginRequest;
import com.ecobrains.lms.dto.request.StudentRegisterRequest;
import com.ecobrains.lms.dto.response.StudentLoginResponse;
import com.ecobrains.lms.dto.response.StudentRegisterResponse;
import com.ecobrains.lms.entity.*;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.*;
import com.ecobrains.lms.security.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Service
public class StudentAuthService {

    private final StudentRepository studentRepository;
    private final CollegeRepository collegeRepository;
    private final CourseRepository courseRepository;
    private final ExamRepository examRepository;
    private final ActivityLogRepository activityLogRepository;
    private final JwtService jwtService;
    private final RedisExamStateService redisState;

    // Explicit IST zone - NOT LocalDateTime.now() (which uses whatever
    // timezone the JVM/OS defaults to). Locally that happens to be IST on
    // a machine already configured for India, but a cloud server could
    // default to UTC or anything else - using this explicit zone
    // everywhere exam-timing decisions are made means the same logic
    // gives the same result regardless of where this actually runs.
    private static final ZoneId INDIA_ZONE = ZoneId.of("Asia/Kolkata");

    private enum LoginWindow { OK, TOO_EARLY, EXPIRED }

    private LoginWindow evaluateFirstLoginWindow(Exam exam) {
    LocalDate today = LocalDate.now(INDIA_ZONE);
    LocalDate examDate = exam.getDate();

    // Before the exam date:
    // Student cannot log in yet.
    if (today.isBefore(examDate)) {
        return LoginWindow.TOO_EARLY;
    }

    // After the exam date:
    // Exam code has expired.
    if (today.isAfter(examDate)) {
        return LoginWindow.EXPIRED;
    }

    // Same exam date:
    // Student can log in ANY TIME during the day before the exam starts.
    // The Rules/Waiting page will show the countdown.
    LocalDateTime now = LocalDateTime.now(INDIA_ZONE);

    if (now.isAfter(exam.getEndTime())) {
        return LoginWindow.EXPIRED;
    }

    return LoginWindow.OK;
}

    public StudentAuthService(StudentRepository studentRepository, CollegeRepository collegeRepository,
                               CourseRepository courseRepository, ExamRepository examRepository,
                               ActivityLogRepository activityLogRepository,
                               JwtService jwtService,
                               RedisExamStateService redisState) {
        this.studentRepository = studentRepository;
        this.collegeRepository = collegeRepository;
        this.courseRepository = courseRepository;
        this.examRepository = examRepository;
        this.activityLogRepository = activityLogRepository;
        this.jwtService = jwtService;
        this.redisState = redisState;
    }

    @Transactional
    public StudentRegisterResponse register(StudentRegisterRequest req, HttpServletRequest httpRequest) {
        String email = req.email().toLowerCase().trim();
        String phone = req.phoneNumber().trim();

        if (studentRepository.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("An account with this email already exists.");
        }
        if (studentRepository.existsByPhoneNumber(phone)) {
            throw ApiException.conflict("An account with this phone number already exists.");
        }

        College college = collegeRepository.findByNameIgnoreCaseAndActiveTrue(req.collegeName().trim())
                .orElseThrow(() -> ApiException.badRequest("College \"" + req.collegeName() + "\" not found or is inactive."));

        Course course = courseRepository.findByNameIgnoreCaseAndActiveTrue(req.courseName().trim())
                .orElseThrow(() -> ApiException.badRequest("Course \"" + req.courseName() + "\" not found or is inactive."));

        // Different colleges use different academic scoring systems, so this
        // is chosen per-student, not fixed application-wide. Range depends
        // entirely on which one was picked - a fixed @DecimalMax on the DTO
        // can't express that, so it's checked here instead.
        String scoreType = req.academicScoreType().trim().toUpperCase();
        if (!scoreType.equals("CGPA") && !scoreType.equals("PERCENTAGE")) {
            throw ApiException.badRequest("Academic score type must be CGPA or PERCENTAGE.");
        }
        double maxAllowed = scoreType.equals("CGPA") ? 10.0 : 100.0;
        if (req.aggregateMarks() > maxAllowed) {
            throw ApiException.badRequest(
                    scoreType.equals("CGPA") ? "CGPA cannot exceed 10." : "Percentage cannot exceed 100."
            );
        }

        Student student = Student.builder()
                .fullName(req.fullName().trim())
                .email(email)
                .dob(LocalDate.parse(req.dob()))
                .phoneNumber(phone)
                .college(college)
                .location(req.location().trim())
                .state(req.state() != null && !req.state().isBlank() ? req.state().trim() : college.getState())
                .branch(req.branch())
                .highestQualification(req.highestQualification())
                .aggregateMarks(req.aggregateMarks())
                .academicScoreType(scoreType)
                .yearOfPassing(req.yearOfPassing())
                .course(course)
                .selectedInCampusDrive(req.selectedInCampusDrive() != null ? req.selectedInCampusDrive() : "")
                .registrationDate(LocalDateTime.now())
                .build();

        student = studentRepository.save(student);

        activityLogRepository.save(ActivityLog.builder()
                .student(student).college(college).eventType(ActivityEventType.REGISTER)
                .ipAddress(httpRequest.getRemoteAddr()).build());

        return new StudentRegisterResponse("Registration successful. Please log in with your exam code.",
                student.getId(), student.getFullName(), student.getEmail());
    }

    /** Read-only lookup used by the Login page to resolve the college only
     *  when the exam code belongs to a currently active exam window. */
    public com.ecobrains.lms.dto.response.ExamCollegeLookupResponse lookupCollegeByExamCode(String examCode) {
        Exam exam = examRepository.findByExamCode(examCode.trim().toUpperCase())
                .orElseThrow(() -> ApiException.notFound("No exam found for this code."));

        LoginWindow window = evaluateFirstLoginWindow(exam);
        return switch (window) {
            case OK -> new com.ecobrains.lms.dto.response.ExamCollegeLookupResponse(
                    "OK", exam.getCollege().getId(), exam.getCollege().getName(),
                    exam.getCollege().getLocation(), exam.getCollege().getState(), null);
            case TOO_EARLY -> new com.ecobrains.lms.dto.response.ExamCollegeLookupResponse(
                    "TOO_EARLY", null, null, null, null, exam.getDate());
            case EXPIRED -> new com.ecobrains.lms.dto.response.ExamCollegeLookupResponse(
                    "EXPIRED", null, null, null, null, null);
        };
    }

    @Transactional
    public StudentLoginResponse login(StudentLoginRequest req, HttpServletRequest httpRequest) {
        Student student = studentRepository.findByEmailIgnoreCase(req.email().toLowerCase().trim())
                .orElseThrow(() -> ApiException.unauthorized("No account found with this email address."));

        if (!student.getCollege().getName().equalsIgnoreCase(req.collegeName().trim())) {
            throw ApiException.unauthorized("The selected college does not match your registered college.");
        }

        if (student.isExamSubmitted()) {
            throw ApiException.forbidden("Your exam has already been submitted. Thank you for participating.");
        }

        Exam exam = examRepository.findByExamCode(req.examCode().trim().toUpperCase())
                .orElseThrow(() -> ApiException.unauthorized("Invalid exam code. Please check and try again."));

        if (!exam.getCollege().getId().equals(student.getCollege().getId())) {
            throw ApiException.unauthorized("This exam code does not belong to your college.");
        }

        LoginWindow window = evaluateFirstLoginWindow(exam);
        if (window == LoginWindow.TOO_EARLY) {
            throw ApiException.unauthorized("This exam has not started yet. It begins at " + exam.getStartTime() + ".");
        }
        if (window == LoginWindow.EXPIRED) {
            throw ApiException.unauthorized("This exam slot has already ended.");
        }

        // The old 15-minute first-login cutoff is intentionally removed.
        // Any login inside the real exam window is valid. Critical access
        // restrictions are checked from MySQL first, then reconciled with Redis.
        if ("RESTRICTED".equals(student.getExamAccessStatus()) && student.getRestrictionUntil() != null) {
            if (student.getRestrictionUntil().isAfter(java.time.LocalDateTime.now(INDIA_ZONE))) {
                throw ApiException.forbidden("Exam violation detected. Please wait until the restriction period ends.", java.util.Map.of("restrictionUntil", student.getRestrictionUntil().atZone(INDIA_ZONE).toInstant().toString()));
            }
            student.setExamAccessStatus("ACTIVE");
            student.setRestrictionUntil(null);
            studentRepository.save(student);
        }
        if ("TERMINATED".equals(student.getExamAccessStatus())) {
            throw ApiException.forbidden("Examination access terminated. Please contact the examination administrator.");
        }
        try {
            var live = redisState.get(exam.getId(), student.getId()).orElse(null);
            if (live != null) {
                if ("RESTRICTED".equals(live.status()) && live.restrictionUntil() != null) {
                    if (live.restrictionUntil().isAfter(java.time.Instant.now())) {
                        throw ApiException.forbidden("Exam violation detected. Please wait until the restriction period ends.",
                                java.util.Map.of("restrictionUntil", live.restrictionUntil().toString()));
                    }
                    redisState.reopen(exam.getId(), student.getId());
                    student.setExamAccessStatus("ACTIVE");
                    student.setRestrictionUntil(null);
                    studentRepository.save(student);
                }
                if ("TERMINATED".equals(live.status())) {
                    throw ApiException.forbidden("Examination access terminated. Please contact the examination administrator.");
                }
            }
        } catch (RedisExamStateService.RedisUnavailableException ignored) {
            // Critical access control has a MySQL safety copy.
            if ("RESTRICTED".equals(student.getExamAccessStatus()) && student.getRestrictionUntil() != null && student.getRestrictionUntil().isAfter(LocalDateTime.now(INDIA_ZONE))) {
                throw ApiException.forbidden("Exam violation detected. Please wait until the restriction period ends.", java.util.Map.of("restrictionUntil", student.getRestrictionUntil().atZone(INDIA_ZONE).toInstant().toString()));
            }
            if ("TERMINATED".equals(student.getExamAccessStatus())) {
                throw ApiException.forbidden("Examination access terminated. Please contact the examination administrator.");
            }
            if ("RESTRICTED".equals(student.getExamAccessStatus())) {
                student.setExamAccessStatus("ACTIVE");
                student.setRestrictionUntil(null);
                studentRepository.save(student);
            }
        }

        if (student.getExamCode() == null || !exam.getExamCode().equalsIgnoreCase(student.getExamCode())) {
            student.setExamCode(exam.getExamCode());
            student.setExam(exam);
            studentRepository.save(student);
        }

        activityLogRepository.save(ActivityLog.builder()
                .student(student).college(student.getCollege()).examCode(exam.getExamCode())
                .eventType(ActivityEventType.LOGIN).ipAddress(httpRequest.getRemoteAddr()).build());

        String token = jwtService.generateStudentToken(student.getId(), student.getEmail());

        return new StudentLoginResponse(
                "Login successful.", token, student.getId(), student.getFullName(), student.getEmail(),
                student.getCollege().getName(), student.getCourse().getName(), student.getExamCode(),
                exam.getId(), exam.getDate(), exam.getStartTime(), exam.getEndTime(),
                student.isExamStarted(), student.isExamSubmitted()
        );
    }
}