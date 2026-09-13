package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.response.StudentAdminListResponse;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.service.StudentAdminService;
import com.ecobrains.lms.util.ExcelWriter;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/api/admin/students")
public class StudentAdminController {

    private final StudentAdminService studentAdminService;

    public StudentAdminController(StudentAdminService studentAdminService) {
        this.studentAdminService = studentAdminService;
    }

    @GetMapping
    public ResponseEntity<java.util.Map<String, Object>> list(
            @RequestParam(required = false) Long collegeId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) String testStatus,
            @RequestParam(defaultValue = "1") int page) {
        return ResponseEntity.ok(studentAdminService.search(collegeId, year, month, testStatus, page));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @RequestParam(defaultValue = "ALL") String mode,
            @RequestParam(required = false) Long collegeId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) String testStatus) {

        // The student directory intentionally has only two export scopes:
        // ALL = entire database; ALL_FILTERED = every row matching the filters.
        if (!"ALL".equalsIgnoreCase(mode) && !"ALL_FILTERED".equalsIgnoreCase(mode)) {
            return ResponseEntity.badRequest().build();
        }

        boolean filtered = "ALL_FILTERED".equalsIgnoreCase(mode);
        List<Student> rows = studentAdminService.export(
                filtered ? collegeId : null,
                filtered ? year : null,
                filtered ? month : null,
                filtered ? testStatus : null);

        List<String> headers = List.of(
                "Student ID", "Student Name", "Email ID", "Phone Number", "College Name",
                "Course", "Branch", "Highest Qualification", "Academic Score", "Score Type",
                "Year of Passing", "Registration Date", "Test Status", "Exam Code", "Test Submitted", "Total Score"
        );

        byte[] excel = ExcelWriter.write("Students", headers, rows, s -> new Object[]{
                s.getId(), s.getFullName(), s.getEmail(), s.getPhoneNumber(),
                s.getCollege() != null ? s.getCollege().getName() : null,
                s.getCourse() != null ? s.getCourse().getName() : null,
                s.getBranch(), s.getHighestQualification(), s.getAggregateMarks(),
                "CGPA".equals(s.getAcademicScoreType()) ? "CGPA" : "Percentage",
                s.getYearOfPassing(), s.getRegistrationDate(),
                s.isExamStarted() ? "Test Written" : "Registered",
                s.getExamCode(), s.isExamSubmitted() ? "Yes" : "No",
                s.isExamSubmitted() ? s.getTotalScore() : null
        });

        String suffix = filtered ? "filtered" : "all";
        String filename = "students-" + suffix + "-" +
                LocalDate.now().format(DateTimeFormatter.ofPattern("dd-MMM-yyyy")) + ".xlsx";

        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(filename, StandardCharsets.UTF_8).build();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(excel);
    }
}
