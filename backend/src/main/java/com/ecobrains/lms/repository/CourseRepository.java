package com.ecobrains.lms.repository;

import com.ecobrains.lms.entity.Course;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CourseRepository extends JpaRepository<Course, Long> {
    List<Course> findByActiveTrue();
    List<Course> findAllByOrderByNameAsc();
    Optional<Course> findByNameIgnoreCaseAndActiveTrue(String name);
}
