package com.ecobrains.lms.dto.response;

import java.util.List;

public record QuestionUploadResponse(int inserted, int skipped, List<String> skipReasons, String courseName) {}
