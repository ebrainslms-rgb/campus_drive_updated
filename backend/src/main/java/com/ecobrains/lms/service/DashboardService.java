package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.StudentSummaryResponse;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.repository.*;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DashboardService {

    private final CollegeRepository collegeRepository;
    private final StudentRepository studentRepository;
    private final ExamRepository examRepository;
    private final CourseRepository courseRepository;

    public DashboardService(CollegeRepository collegeRepository, StudentRepository studentRepository,
                             ExamRepository examRepository, CourseRepository courseRepository) {
        this.collegeRepository = collegeRepository;
        this.studentRepository = studentRepository;
        this.examRepository = examRepository;
        this.courseRepository = courseRepository;
    }

    public Map<String, Object> overview() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalColleges", collegeRepository.count());
        stats.put("activeColleges", (long) collegeRepository.findByActiveTrueOrderByNameAsc().size());
        stats.put("totalStudents", studentRepository.count());
        stats.put("totalCourses", courseRepository.count());
        stats.put("totalTestsConducted", examRepository.count());
        return stats;
    }

    public List<String> locations() {
        return collegeRepository.findAll().stream().map(c -> c.getLocation()).distinct().sorted().toList();
    }

    /** Full per-student breakdown for a college's analytics panel. */
    public List<StudentSummaryResponse> collegeStudents(Long collegeId) {
        List<Student> students = studentRepository.findByCollegeId(collegeId);

        int topScore = students.stream()
                .filter(Student::isExamSubmitted)
                .mapToInt(Student::getTotalScore)
                .max()
                .orElse(-1);

        return students.stream()
                .map(s -> new StudentSummaryResponse(
                        s.getId(), s.getFullName(), s.getBranch(), s.getAggregateMarks(),
                        s.getCourse() != null ? s.getCourse().getName() : null,
                        s.isExamSubmitted(),
                        s.isExamSubmitted() ? s.getTotalScore() : null,
                        s.isExamSubmitted() && topScore >= 0 && s.getTotalScore() == topScore
                ))
                .toList();
    }
}
