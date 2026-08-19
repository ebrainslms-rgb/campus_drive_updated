package com.ecobrains.lms.dto.response;

import com.ecobrains.lms.entity.Course;

public record CoursePublicResponse(Long id, String name) {
    public static CoursePublicResponse from(Course c) {
        return new CoursePublicResponse(c.getId(), c.getName());
    }
}
