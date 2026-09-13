package com.ecobrains.lms.dto.response;

import com.ecobrains.lms.entity.Course;

public record CourseResponse(Long id, String name, String description, boolean isActive) {
    public static CourseResponse from(Course c) {
        return new CourseResponse(c.getId(), c.getName(), c.getDescription(), c.isActive());
    }
}
