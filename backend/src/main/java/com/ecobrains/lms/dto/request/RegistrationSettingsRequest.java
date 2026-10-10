package com.ecobrains.lms.dto.request;
public record RegistrationSettingsRequest(boolean genderEnabled,boolean dobEnabled,boolean qualificationEnabled,boolean yearEnabled,boolean academicScoreEnabled,String academicScoreType,boolean otherCampusDriveEnabled) {}
