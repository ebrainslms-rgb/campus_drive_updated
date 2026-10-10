package com.ecobrains.lms.dto.response;

import java.util.List;

public record RegistrationFieldResponse(Long id, String fieldKey, String label, String type, boolean required, boolean enabled, List<String> options, int sortOrder) {}
