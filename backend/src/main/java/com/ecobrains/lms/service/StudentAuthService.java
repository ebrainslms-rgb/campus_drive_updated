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

    // Explicit IST zone - NOT LocalDateTime.now() (which uses whatever
    // timezone the JVM/OS defaults to). Locally that happens to be IST on
    // a machine already configured for India, but a cloud server could
    // default to UTC or anything else - using this explicit zone
    // everywhere exam-timing decisions are made means the same logic
    // gives the same result regardless of where this actually runs.
    private static final ZoneId INDIA_ZONE = ZoneId.of("Asia/Kolkata");
    private static final long LATE_LOGIN_GRACE_MINUTES = 15;

    private enum LoginWindow { OK, TOO_EARLY, EXPIRED }

    /** Single source of truth for "is right now within the allowed
     *  first-time login window for this exam" - used by both the
     *  exam-code lookup (early warning, before the student even submits
     *  the form) and login() itself (actual enforcement), so the two can
     *  never disagree. Deliberately NOT used for a student who has
     *  already been assigned this exam (see login() below) - that case
     *  is a resume, not a first arrival, and must keep working up to the
     *  exam's actual end time regardless of this 15-minute window. */
    private LoginWindow evaluateFirstLoginWindow(Exam exam) {
        LocalDateTime now = LocalDateTime.now(INDIA_ZONE);
        LocalDate today = now.toLocalDate();
        LocalDate examDate = exam.getDate();
        LocalDateTime lateCutoff = exam.getStartTime().plusMinutes(LATE_LOGIN_GRACE_MINUTES);

        if (today.isBefore(examDate)) return LoginWindow.TOO_EARLY;
        if (today.isAfter(examDate) || now.isAfter(lateCutoff)) return LoginWindow.EXPIRED;
        return LoginWindow.OK;
    }

    public StudentAuthService(StudentRepository studentRepository, CollegeRepository collegeRepository,
                               CourseRepository courseRepository, ExamRepository examRepository,
                               ActivityLogRepository activityLogRepository,
                               JwtService jwtService) {
        this.studentRepository = studentRepository;
        this.collegeRepository = collegeRepository;
        this.courseRepository = courseRepository;
        this.examRepository = examRepository;
        this.activityLogRepository = activityLogRepository;
        this.jwtService = jwtService;
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

    /** Read-only lookup used by the Login page to auto-fill and lock the
     *  College field once a student has typed a complete exam code. Uses
     *  the exact same evaluateFirstLoginWindow() check login() enforces
     *  below, so this preview can never say "OK" when the real login
     *  would actually reject it (or vice versa). Deliberately does NOT
     *  reveal the college name for TOO_EARLY or EXPIRED - only a valid,
     *  currently-loggable exam code exposes which college it belongs to. */
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

        boolean isFirstLogin = student.getExamCode() == null;

        if (isFirstLogin) {
            // First time this student is logging in for this exam - apply
            // the strict same-day + 15-minute-late window.
            LoginWindow window = evaluateFirstLoginWindow(exam);
            if (window == LoginWindow.TOO_EARLY) {
                throw ApiException.unauthorized(
                        "This test is scheduled for " + exam.getDate() + ". Please come back and log in on that day.");
            }
            if (window == LoginWindow.EXPIRED) {
                throw ApiException.unauthorized("This exam has expired or the code is invalid.");
            }
            student.setExamCode(exam.getExamCode());
            student.setExam(exam);
            studentRepository.save(student);
        } else {
            // Resuming an already-started attempt (e.g. after a temporary
            // network/system interruption) - NOT a late arrival, so the
            // 15-minute window does not apply here. Preserve the original,
            // more permissive check: allowed any time up to the exam's
            // actual end time, exactly as before this change.
            LocalDateTime now = LocalDateTime.now(INDIA_ZONE);
            if (now.isAfter(exam.getEndTime())) {
                throw ApiException.unauthorized("This exam slot has already ended.");
            }
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