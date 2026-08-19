package com.ecobrains.lms.dto.request;

import jakarta.validation.constraints.NotNull;

public record ToggleActiveRequest(@NotNull Boolean isActive) {}
