package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.StudentLoginRequest;
import com.ecobrains.lms.dto.request.StudentRegisterRequest;
import com.ecobrains.lms.dto.response.StudentLoginResponse;
import com.ecobrains.lms.dto.response.StudentRegisterResponse;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.QuestionRepository;
import com.ecobrains.lms.repository.StudentRepository;
import com.ecobrains.lms.security.CurrentUser;
import com.ecobrains.lms.service.StudentAuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/student/auth")
public class StudentAuthController {

    private final StudentAuthService studentAuthService;
    private final StudentRepository studentRepository;
    private final QuestionRepository questionRepository;

    public StudentAuthController(StudentAuthService studentAuthService, StudentRepository studentRepository,
                                  QuestionRepository questionRepository) {
        this.studentAuthService = studentAuthService;
        this.studentRepository = studentRepository;
        this.questionRepository = questionRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<StudentRegisterResponse> register(@Valid @RequestBody StudentRegisterRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.status(201).body(studentAuthService.register(request, httpRequest));
    }

    @PostMapping("/login")
    public ResponseEntity<StudentLoginResponse> login(@Valid @RequestBody StudentLoginRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.ok(studentAuthService.login(request, httpRequest));
    }

    /** Public, read-only - lets the Login page auto-fill and lock the
     *  College field once a full exam code is typed, before the student
     *  has actually logged in. Exposes only the college name, nothing
     *  about exam timing/questions/other students. */
    @GetMapping("/exam-lookup")
    public ResponseEntity<com.ecobrains.lms.dto.response.ExamCollegeLookupResponse> examLookup(@RequestParam String examCode) {
        return ResponseEntity.ok(studentAuthService.lookupCollegeByExamCode(examCode));
    }

    /**
     * Used to rebuild the pre-exam waiting screen (countdown, exam details)
     * after a page refresh, when the original /login response is long gone.
     * Includes the exam schedule so the frontend never has to guess or
     * hardcode timing - it's always read from here.
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me() {
        Student student = studentRepository.findById(CurrentUser.studentId())
                .orElseThrow(() -> ApiException.notFound("Student not found."));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", student.getId());
        body.put("fullName", student.getFullName());
        body.put("email", student.getEmail());
        body.put("collegeName", student.getCollege().getName());
        body.put("courseName", student.getCourse().getName());
        body.put("branch", student.getBranch());
        body.put("highestQualification", student.getHighestQualification());
        body.put("yearOfPassing", student.getYearOfPassing());
        body.put("examCode", student.getExamCode() != null ? student.getExamCode() : "");
        body.put("examStarted", student.isExamStarted());
        body.put("examSubmitted", student.isExamSubmitted());
        body.put("serverNow", java.time.LocalDateTime.now());

        if (student.getExam() != null) {
            body.put("examId", student.getExam().getId());
            body.put("examDate", student.getExam().getDate());
            body.put("examStartTime", student.getExam().getStartTime());
            body.put("examEndTime", student.getExam().getEndTime());
            body.put("totalQuestions", questionRepository.findByCourseId(student.getCourse().getId()).size());
        }

        return ResponseEntity.ok(body);
    }
}