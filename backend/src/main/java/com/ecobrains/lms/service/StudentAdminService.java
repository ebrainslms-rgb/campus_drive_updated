package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.StudentRegisterRequest;
import com.ecobrains.lms.dto.request.UpdateStudentRequest;
import com.ecobrains.lms.dto.response.StudentAdminListResponse;
import com.ecobrains.lms.entity.ActivityEventType;
import com.ecobrains.lms.entity.ActivityLog;
import com.ecobrains.lms.entity.College;
import com.ecobrains.lms.entity.Course;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.ActivityLogRepository;
import com.ecobrains.lms.repository.CollegeRepository;
import com.ecobrains.lms.repository.CourseRepository;
import com.ecobrains.lms.repository.StudentAnswerRepository;
import com.ecobrains.lms.repository.StudentRepository;
import com.ecobrains.lms.security.CurrentUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class StudentAdminService {

    public static final int PAGE_SIZE = 50;

    private final StudentRepository studentRepository;
    private final CollegeRepository collegeRepository;
    private final CourseRepository courseRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final ActivityLogRepository activityLogRepository;
    private final RedisExamStateService redisState;
    private final StudentAuthService studentAuthService;
    private final RegistrationSettingsService registrationSettingsService;
    private final RegistrationFieldService registrationFieldService;

    public StudentAdminService(StudentRepository studentRepository,
                               CollegeRepository collegeRepository,
                               CourseRepository courseRepository,
                               StudentAnswerRepository studentAnswerRepository,
                               ActivityLogRepository activityLogRepository,
                               RedisExamStateService redisState,
                               StudentAuthService studentAuthService, RegistrationSettingsService registrationSettingsService, RegistrationFieldService registrationFieldService) {
        this.studentRepository = studentRepository;
        this.collegeRepository = collegeRepository;
        this.courseRepository = courseRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.activityLogRepository = activityLogRepository;
        this.redisState = redisState;
        this.studentAuthService = studentAuthService;
        this.registrationSettingsService = registrationSettingsService;
        this.registrationFieldService = registrationFieldService;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> search(Long collegeId, Long courseId, Integer year, Integer month, String testStatus,
                                      String search, int page) {
        Specification<Student> spec = buildSpec(collegeId, courseId, year, month, testStatus, search);
        int safePage = Math.max(page, 1);
        Pageable pageable = PageRequest.of(safePage - 1, PAGE_SIZE,
                Sort.by(Sort.Order.desc("registrationDate"), Sort.Order.desc("id")));

        Page<Student> result = studentRepository.findAll(spec, pageable);
        List<StudentAdminListResponse> students = result.getContent().stream()
                .map(this::toResponse)
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("students", students);
        body.put("page", result.getNumber() + 1);
        body.put("size", PAGE_SIZE);
        body.put("totalPages", result.getTotalPages());
        body.put("totalStudents", result.getTotalElements());
        body.put("totalAllStudents", studentRepository.count());
        body.put("registrationYears", studentRepository.findRegistrationYears());
        return body;
    }

    @Transactional(readOnly = true)
    public List<Student> export(Long collegeId, Long courseId, Integer year, Integer month, String testStatus, String search) {
        Specification<Student> spec = buildSpec(collegeId, courseId, year, month, testStatus, search);
        return studentRepository.findAll(spec, Sort.by(Sort.Order.desc("registrationDate"), Sort.Order.desc("id")));
    }

    public com.ecobrains.lms.dto.response.StudentRegisterResponse create(StudentRegisterRequest request,
                                                                           jakarta.servlet.http.HttpServletRequest httpRequest) {
        return studentAuthService.register(request, httpRequest);
    }

    @Transactional
    public void update(Long studentId, UpdateStudentRequest req) {
        Student student = studentRepository.findById(studentId)
                .orElseThrow(() -> ApiException.notFound("Student not found."));

        String email = req.email().toLowerCase().trim();
        String phone = req.phoneNumber().trim();
        studentRepository.findByEmailIgnoreCase(email).ifPresent(existing -> {
            if (!existing.getId().equals(studentId)) {
                throw ApiException.conflict("An account with this email already exists.");
            }
        });
        if (studentRepository.existsByPhoneNumber(phone) && !phone.equals(student.getPhoneNumber())) {
            throw ApiException.conflict("An account with this phone number already exists.");
        }

        College college = collegeRepository.findByNameIgnoreCaseAndActiveTrue(req.collegeName().trim())
                .orElseThrow(() -> ApiException.badRequest("College \"" + req.collegeName() + "\" not found or is inactive."));
        Course course = courseRepository.findByNameIgnoreCaseAndActiveTrue(req.courseName().trim())
                .orElseThrow(() -> ApiException.badRequest("Course \"" + req.courseName() + "\" not found or is inactive."));

        var settings=registrationSettingsService.get();
        registrationSettingsService.validate(req.gender(),req.dob(),req.aggregateMarks(),req.academicScoreType(),req.yearOfPassing(),req.highestQualification(),req.selectedInCampusDrive());
        student.setFullName(req.fullName().trim());
        student.setEmail(email);
        student.setPhoneNumber(phone);
        student.setCollege(college);
        student.setLocation(college.getLocation());
        student.setState(college.getState());
        student.setBranch(req.branch().trim());
        student.setCourse(course);
        if(settings.isGenderEnabled()) student.setGender(req.gender().trim());
        if(settings.isDobEnabled()) student.setDob(LocalDate.parse(req.dob()));
        if(settings.isQualificationEnabled()) student.setHighestQualification(req.highestQualification().trim());
        if(settings.isYearEnabled()) student.setYearOfPassing(req.yearOfPassing());
        if(settings.isOtherCampusDriveEnabled()) student.setSelectedInCampusDrive(req.selectedInCampusDrive().trim());
        if(settings.isAcademicScoreEnabled()){ student.setAggregateMarks(req.aggregateMarks()); student.setAcademicScoreType(req.academicScoreType().trim().toUpperCase()); }
        studentRepository.save(student);
        registrationFieldService.validateAndSave(student, req.customFields());
    }

    @Transactional
    public void delete(Long studentId) {
        Student student = studentRepository.findById(studentId)
                .orElseThrow(() -> ApiException.notFound("Student not found."));

        if (student.getExam() != null) {
            try {
                redisState.markCompleted(student.getExam().getId(), student.getId());
            } catch (Exception ignored) { }
        }

        // Delete child rows first because the existing schema deliberately
        // does not use JPA cascade-delete for exam/audit data.
        activityLogRepository.deleteByStudentId(studentId);
        studentAnswerRepository.deleteByStudentId(studentId);
        studentRepository.delete(student);

        try {
            activityLogRepository.flush();
        } catch (Exception ignored) { }
    }

    private void validateScore(String scoreType, Double score) {
        if (!scoreType.equals("CGPA") && !scoreType.equals("PERCENTAGE")) {
            throw ApiException.badRequest("Academic score type must be CGPA or PERCENTAGE.");
        }
        double max = scoreType.equals("CGPA") ? 10.0 : 100.0;
        if (score == null || score < 0 || score > max) {
            throw ApiException.badRequest(scoreType.equals("CGPA") ? "CGPA must be between 0 and 10." : "Percentage must be between 0 and 100.");
        }
    }

    private Specification<Student> buildSpec(Long collegeId, Long courseId, Integer year, Integer month,
                                             String testStatus, String search) {
        return (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();

            if (collegeId != null) predicates.add(cb.equal(root.get("college").get("id"), collegeId));
            if (courseId != null) predicates.add(cb.equal(root.get("course").get("id"), courseId));
            if (year != null) predicates.add(cb.equal(cb.function("YEAR", Integer.class, root.get("registrationDate")), year));
            if (month != null) predicates.add(cb.equal(cb.function("MONTH", Integer.class, root.get("registrationDate")), month));

            if ("REGISTERED".equalsIgnoreCase(testStatus)) {
                predicates.add(cb.isFalse(root.get("examStarted")));
            } else if ("TEST_WRITTEN".equalsIgnoreCase(testStatus)) {
                predicates.add(cb.isTrue(root.get("examStarted")));
            }

            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                // LEFT join: a student without a course must still be found by name / email / mobile.
                jakarta.persistence.criteria.Join<Object, Object> course =
                        root.join("course", jakarta.persistence.criteria.JoinType.LEFT);
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("fullName")), like),
                        cb.like(cb.lower(root.get("email")), like),
                        cb.like(root.get("phoneNumber"), "%" + search.trim() + "%"),
                        cb.like(cb.lower(course.get("name")), like)          // typing "java" finds all JAVA students
                ));
            }

            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
    }

    private StudentAdminListResponse toResponse(Student s) {
        return new StudentAdminListResponse(
                s.getId(), s.getFullName(), s.getEmail(), s.getPhoneNumber(), s.getGender(),
                s.getCollege() != null ? s.getCollege().getId() : null,
                s.getCollege() != null ? s.getCollege().getName() : null,
                s.getCourse() != null ? s.getCourse().getId() : null,
                s.getCourse() != null ? s.getCourse().getName() : null,
                s.getBranch(), s.getHighestQualification(), s.getAggregateMarks(),
                s.getAcademicScoreType(), s.getYearOfPassing(), s.getRegistrationDate(),
                s.isExamStarted(), s.isExamSubmitted(), s.getExamCode(),
                s.isExamSubmitted() ? s.getTotalScore() : null
        );
    }
}
