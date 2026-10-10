package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record RegistrationFieldRequest(@NotBlank String label, @NotBlank String type, boolean required, boolean enabled, List<String> options, Integer sortOrder) {}
