package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.StudentAdminListResponse;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.repository.StudentRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class StudentAdminService {

    public static final int PAGE_SIZE = 50;

    private final StudentRepository studentRepository;

    public StudentAdminService(StudentRepository studentRepository) {
        this.studentRepository = studentRepository;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> search(Long collegeId, Integer year, Integer month, String testStatus, int page) {
        Specification<Student> spec = buildSpec(collegeId, year, month, testStatus);
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
    public List<Student> export(Long collegeId, Integer year, Integer month, String testStatus) {
        Specification<Student> spec = buildSpec(collegeId, year, month, testStatus);
        return studentRepository.findAll(spec, Sort.by(Sort.Order.desc("registrationDate"), Sort.Order.desc("id")));
    }

    private Specification<Student> buildSpec(Long collegeId, Integer year, Integer month, String testStatus) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (collegeId != null) {
                predicates.add(cb.equal(root.get("college").get("id"), collegeId));
            }
            if (year != null) {
                predicates.add(cb.equal(cb.function("YEAR", Integer.class, root.get("registrationDate")), year));
            }
            if (month != null) {
                predicates.add(cb.equal(cb.function("MONTH", Integer.class, root.get("registrationDate")), month));
            }

            if ("REGISTERED".equalsIgnoreCase(testStatus)) {
                predicates.add(cb.isFalse(root.get("examStarted")));
            } else if ("TEST_WRITTEN".equalsIgnoreCase(testStatus)) {
                predicates.add(cb.isTrue(root.get("examStarted")));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private StudentAdminListResponse toResponse(Student s) {
        return new StudentAdminListResponse(
                s.getId(), s.getFullName(), s.getEmail(), s.getPhoneNumber(),
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
