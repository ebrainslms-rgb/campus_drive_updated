package com.ecobrains.lms.dto.response;

public record SubmitExamResponse(String message, boolean isSubmitted, ScoresResponse scores) {}
