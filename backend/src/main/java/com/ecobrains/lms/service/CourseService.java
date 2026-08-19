package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.CourseRequest;
import com.ecobrains.lms.dto.response.CourseResponse;
import com.ecobrains.lms.entity.AdminLog;
import com.ecobrains.lms.entity.Course;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.AdminLogRepository;
import com.ecobrains.lms.repository.CourseRepository;
import com.ecobrains.lms.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CourseService {

    private final CourseRepository courseRepository;
    private final AdminLogRepository adminLogRepository;

    public CourseService(CourseRepository courseRepository, AdminLogRepository adminLogRepository) {
        this.courseRepository = courseRepository;
        this.adminLogRepository = adminLogRepository;
    }

    @Transactional
    public CourseResponse create(CourseRequest req) {
        Course course = Course.builder().name(req.name().trim()).description(req.description()).active(true).build();
        course = courseRepository.save(course);
        logAction("COURSE_CREATE", course.getId());
        return CourseResponse.from(course);
    }

    @Transactional
    public CourseResponse update(Long id, CourseRequest req) {
        Course course = courseRepository.findById(id).orElseThrow(() -> ApiException.notFound("Course not found"));
        course.setName(req.name().trim());
        course.setDescription(req.description());
        course = courseRepository.save(course);
        logAction("COURSE_EDIT", course.getId());
        return CourseResponse.from(course);
    }

    @Transactional
    public CourseResponse toggleActive(Long id, boolean isActive) {
        Course course = courseRepository.findById(id).orElseThrow(() -> ApiException.notFound("Course not found"));
        course.setActive(isActive);
        course = courseRepository.save(course);
        logAction("COURSE_TOGGLE_ACTIVE", course.getId());
        return CourseResponse.from(course);
    }

    public List<CourseResponse> getAll(Boolean isActive) {
        List<Course> courses = isActive != null && isActive ? courseRepository.findByActiveTrue() : courseRepository.findAllByOrderByNameAsc();
        return courses.stream().map(CourseResponse::from).toList();
    }

    private void logAction(String action, Long targetId) {
        adminLogRepository.save(AdminLog.builder()
                .adminEmail(CurrentUser.email())
                .action(action)
                .targetEntity("Course")
                .targetId(String.valueOf(targetId))
                .build());
    }
}
