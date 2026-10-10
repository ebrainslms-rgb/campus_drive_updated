package com.ecobrains.lms.dto.request;
import jakarta.validation.constraints.*;
import java.util.Map;
public record UpdateStudentRequest(
 @NotBlank(message="Full name is required") String fullName,
 @NotBlank(message="Email is required") @Email(message="Invalid email address") String email,
 String dob,String gender,
 @NotBlank(message="Phone number is required") @Pattern(regexp="\\d{10}",message="Phone number must be exactly 10 digits") String phoneNumber,
 @NotBlank(message="College is required") String collegeName,
 String location,String state,
 @NotBlank(message="Branch / Domain is required") String branch,
 String highestQualification, Double aggregateMarks,String academicScoreType,Integer yearOfPassing,
 @NotBlank(message="Course is required") String courseName,
 String selectedInCampusDrive, Map<String,String> customFields
) {}
