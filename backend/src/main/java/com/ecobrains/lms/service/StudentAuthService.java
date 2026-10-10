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
    private final RegistrationSettingsService registrationSettingsService;
    private final RegistrationFieldService registrationFieldService;
    private final RedisExamStateService redisExamStateService;

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
                               RegistrationSettingsService registrationSettingsService, RegistrationFieldService registrationFieldService, RedisExamStateService redisExamStateService) {
        this.studentRepository = studentRepository;
        this.collegeRepository = collegeRepository;
        this.courseRepository = courseRepository;
        this.examRepository = examRepository;
        this.activityLogRepository = activityLogRepository;
        this.jwtService = jwtService;
        this.registrationSettingsService = registrationSettingsService;
        this.registrationFieldService = registrationFieldService;
        this.redisExamStateService = redisExamStateService;
    }

    @Transactional
    public StudentRegisterResponse register(StudentRegisterRequest req, HttpServletRequest httpRequest) {
        String email=req.email().toLowerCase().trim(); String phone=req.phoneNumber().trim();
        registrationSettingsService.validate(req.gender(),req.dob(),req.aggregateMarks(),req.academicScoreType(),req.yearOfPassing(),req.highestQualification(),req.selectedInCampusDrive());
        if(studentRepository.existsByEmailIgnoreCase(email)) throw ApiException.conflict("An account with this email already exists.");
        if(studentRepository.existsByPhoneNumber(phone)) throw ApiException.conflict("An account with this phone number already exists.");
        College college=collegeRepository.findByNameIgnoreCaseAndActiveTrue(req.collegeName().trim()).orElseThrow(()->ApiException.badRequest("College \""+req.collegeName()+"\" not found or is inactive."));
        Course course=courseRepository.findByNameIgnoreCaseAndActiveTrue(req.courseName().trim()).orElseThrow(()->ApiException.badRequest("Course \""+req.courseName()+"\" not found or is inactive."));
        var settings=registrationSettingsService.get(); String scoreType=null; Double score=null; Integer year=null; String qualification=null; LocalDate dob=null; String gender=null; String selected="";
        if(settings.isGenderEnabled()) gender=req.gender().trim();
        if(settings.isDobEnabled()) dob=LocalDate.parse(req.dob());
        if(settings.isQualificationEnabled()) qualification=req.highestQualification().trim();
        if(settings.isYearEnabled()) year=req.yearOfPassing();
        if(settings.isOtherCampusDriveEnabled()) selected=req.selectedInCampusDrive().trim();
        if(settings.isAcademicScoreEnabled()){score=req.aggregateMarks();scoreType=req.academicScoreType().trim().toUpperCase();}
        Student student=Student.builder().fullName(req.fullName().trim()).email(email).dob(dob).gender(gender).phoneNumber(phone).college(college).location(college.getLocation()).state(college.getState()).branch(req.branch().trim()).highestQualification(qualification).aggregateMarks(score).academicScoreType(scoreType).yearOfPassing(year).course(course).selectedInCampusDrive(selected).registrationDate(LocalDateTime.now()).build();
        student=studentRepository.save(student);
        registrationFieldService.validateAndSave(student, req.customFields());
        activityLogRepository.save(ActivityLog.builder().student(student).college(college).eventType(ActivityEventType.REGISTER).ipAddress(httpRequest.getRemoteAddr()).build());
        return new StudentRegisterResponse("Registration successful. Please log in with your exam code.",student.getId(),student.getFullName(),student.getEmail());
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

    public StudentLoginResponse login(StudentLoginRequest req, HttpServletRequest httpRequest) {
        String identifier = req.identifier() == null ? "" : req.identifier().trim();
        String examCode = req.examCode().trim().toUpperCase();

        Exam exam = examRepository.findByExamCode(examCode)
                .orElseThrow(() -> ApiException.unauthorized("Invalid exam code. Please check and try again."));

        Student student;
        if (identifier.matches("\\d{10}")) {
            student = studentRepository.findAllByPhoneNumberIn(java.util.List.of(identifier)).stream().findFirst()
                    .orElseThrow(() -> ApiException.unauthorized("No account found with this email or mobile number."));
        } else {
            student = studentRepository.findByEmailIgnoreCase(identifier)
                    .orElseThrow(() -> ApiException.unauthorized("No account found with this email or mobile number."));
        }

        if (!student.getCollege().getName().equalsIgnoreCase(req.collegeName().trim())) {
            throw ApiException.unauthorized("The selected college does not match your registered college.");
        }
        if (!exam.getCollege().getId().equals(student.getCollege().getId())) {
            throw ApiException.unauthorized("This exam code does not belong to your college.");
        }
        if (student.isExamSubmitted()) {
            throw ApiException.forbidden("Your exam has already been submitted. Thank you for participating.");
        }
        try {
            var live = redisExamStateService.get(exam.getId(), student.getId()).orElse(null);
            if (live != null && ("SUBMITTED_PENDING".equals(live.status()) || "COMPLETED".equals(live.status()))) {
                throw ApiException.forbidden("Your exam has already been submitted. Thank you for participating.");
            }
        } catch (RedisExamStateService.RedisUnavailableException ignored) {
            // MySQL examSubmitted remains authoritative if Redis is temporarily unavailable.
        }

        LoginWindow window=evaluateFirstLoginWindow(exam);
        if(window==LoginWindow.TOO_EARLY) throw ApiException.unauthorized("This exam has not started yet. It begins at "+exam.getStartTime()+".");
        if(window==LoginWindow.EXPIRED) throw ApiException.unauthorized("This exam slot has already ended.");
        if("RESTRICTED".equals(student.getExamAccessStatus())&&student.getRestrictionUntil()!=null){
            if(student.getRestrictionUntil().isAfter(LocalDateTime.now(INDIA_ZONE))) throw ApiException.forbidden("Exam violation detected. Please wait until the restriction period ends.",java.util.Map.of("restrictionUntil",student.getRestrictionUntil().atZone(INDIA_ZONE).toInstant().toString()));
            student.setExamAccessStatus("ACTIVE"); student.setRestrictionUntil(null); studentRepository.save(student);
        }
        if("TERMINATED".equals(student.getExamAccessStatus())) throw ApiException.forbidden("Examination access terminated. Please contact the examination administrator.");
        if(student.getExamCode()==null||!exam.getExamCode().equalsIgnoreCase(student.getExamCode())){student.setExamCode(exam.getExamCode());student.setExam(exam);studentRepository.save(student);}
        activityLogRepository.save(ActivityLog.builder().student(student).college(student.getCollege()).examCode(exam.getExamCode()).eventType(ActivityEventType.LOGIN).ipAddress(httpRequest.getRemoteAddr()).build());
        String token=jwtService.generateStudentToken(student.getId(),student.getEmail());
        return new StudentLoginResponse("Login successful.",token,student.getId(),student.getFullName(),student.getEmail(),student.getCollege().getName(),student.getCourse().getName(),student.getExamCode(),exam.getId(),exam.getDate(),exam.getStartTime(),exam.getEndTime(),student.isExamStarted(),student.isExamSubmitted());
    }

}