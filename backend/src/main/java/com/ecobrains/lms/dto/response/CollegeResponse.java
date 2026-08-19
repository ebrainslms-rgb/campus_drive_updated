package com.ecobrains.lms.dto.response;

import com.ecobrains.lms.entity.College;

import java.time.LocalDateTime;

public record CollegeResponse(
        Long id,
        String name,
        String code,
        String location,
        String district,
        String state,
        String spocName,
        String email,
        String mobileNumber,
        boolean isActive,
        LocalDateTime createdAt
) {
    public static CollegeResponse from(College c) {
        return new CollegeResponse(
                c.getId(), c.getName(), c.getCode(), c.getLocation(), c.getDistrict(), c.getState(),
                c.getSpocName(), c.getEmail(), c.getMobileNumber(), c.isActive(), c.getCreatedAt()
        );
    }

    /** Compact label for student registration dropdown: "Name, Location, District, State" */
    public String displayLabel() {
        StringBuilder sb = new StringBuilder(name);
        if (location != null && !location.isBlank()) sb.append(", ").append(location);
        if (district != null && !district.isBlank()) sb.append(", ").append(district);
        if (state != null && !state.isBlank()) sb.append(", ").append(state);
        return sb.toString();
    }
}
