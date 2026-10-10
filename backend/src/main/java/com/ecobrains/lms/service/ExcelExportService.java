package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.DriveDetailResponse;
import com.ecobrains.lms.dto.response.DriveStudentResponse;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.repository.CollegeRepository;
import com.ecobrains.lms.repository.CourseRepository;
import com.ecobrains.lms.repository.StudentRegistrationValueRepository;
import com.ecobrains.lms.util.ExcelWriter;
import com.ecobrains.lms.util.ExportFileNames;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

@Service
public class ExcelExportService {
    private static final java.time.format.DateTimeFormatter DAY =
            java.time.format.DateTimeFormatter.ofPattern("dd-MMM-yyyy", Locale.ENGLISH);

    private final DriveService driveService;
    private final CourseRepository courseRepository;
    private final CollegeRepository collegeRepository;
    private final ExportColumnsService exportColumns;
    private final RegistrationFieldService registrationFields;
    private final com.ecobrains.lms.repository.StudentRepository studentRepository;

    public ExcelExportService(DriveService driveService, CourseRepository courseRepository, CollegeRepository collegeRepository,
                              ExportColumnsService exportColumns, RegistrationFieldService registrationFields,
                              com.ecobrains.lms.repository.StudentRepository studentRepository) {
        this.driveService = driveService; this.courseRepository = courseRepository; this.collegeRepository = collegeRepository;
        this.exportColumns = exportColumns; this.registrationFields = registrationFields; this.studentRepository = studentRepository;
    }

    /**
     * Drive (results) export. {@code columns} = the columns picked in the export
     * popup, in click order; empty = default columns. A drive belongs to one
     * college, so College is never a default; Course is a default only when no
     * course filter applies.
     */
    public byte[] exportDriveStudents(Long examId, String mode, Long courseId, Double scoreMin, Double scoreMax, String search, String sortDir,
                                      int currentPage, int currentSize, List<String> columns) {
        DriveDetailResponse drive = driveService.detail(examId);
        List<DriveStudentResponse> rows = driveService.exportForMode(examId, mode, courseId, scoreMin, scoreMax, search, sortDir, currentPage, currentSize);
        boolean courseFiltered = courseId != null && !"ALL_STUDENTS".equalsIgnoreCase(mode);
        Map<String, String> labels = exportColumns.catalog(ExportColumnsService.ExportType.DRIVE);
        List<String> selected = exportColumns.resolve(ExportColumnsService.ExportType.DRIVE, columns, courseFiltered, true);

        List<Long> ids = rows.stream().map(DriveStudentResponse::studentId).toList();
        Map<Long, Map<String, String>> values = registrationFields.valuesForStudents(ids);
        // Registration details that the drive row does not carry (date of birth, registration date).
        Map<Long, Student> students = new HashMap<>();
        if (selected.contains("DOB") || selected.contains("REGISTRATION_DATE")) {
            studentRepository.findAllById(ids).forEach(st -> students.put(st.getId(), st));
        }

        List<String> headers = withSerialHeader(selected.stream().map(labels::get).toList());
        List<Object[]> data = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            DriveStudentResponse r = rows.get(i);
            Map<String, String> custom = values.getOrDefault(r.studentId(), Map.of());
            Student st = students.get(r.studentId());
            data.add(withSerial(i + 1, selected.stream().map(k -> driveValue(k, r, custom, st)).toArray()));
        }
        String sheetName = "Drive " + (drive.examCode() != null ? drive.examCode() : examId);
        if (sheetName.length() > 31) sheetName = sheetName.substring(0, 31);
        return ExcelWriter.write(sheetName, headers, data, row -> row);
    }

    /**
     * Student directory export. {@code columns} = popup selection in click
     * order; empty = default columns (College left out when a college filter applies).
     */
    public byte[] exportStudents(List<Student> rows, List<String> columns, boolean collegeFiltered, boolean courseFiltered) {
        Map<String, String> labels = exportColumns.catalog(ExportColumnsService.ExportType.STUDENTS);
        List<String> selected = exportColumns.resolve(ExportColumnsService.ExportType.STUDENTS, columns, courseFiltered, collegeFiltered);
        Map<Long, Map<String, String>> values = registrationFields.valuesForStudents(rows.stream().map(Student::getId).toList());
        List<String> headers = withSerialHeader(selected.stream().map(labels::get).toList());
        List<Object[]> data = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            Student st = rows.get(i);
            Map<String, String> custom = values.getOrDefault(st.getId(), Map.of());
            data.add(withSerial(i + 1, selected.stream().map(k -> studentValue(k, st, custom)).toArray()));
        }
        return ExcelWriter.write("Students", headers, data, row -> row);
    }

    /** Mandatory first column in every export (not part of Export Settings). */
    public static final String SERIAL_HEADER = "S.No";

    private static List<String> withSerialHeader(List<String> headers) {
        List<String> out = new ArrayList<>(headers.size() + 1);
        out.add(SERIAL_HEADER);
        out.addAll(headers);
        return out;
    }

    /** S.No always starts at 1 in every file and follows the exported row order. */
    private static Object[] withSerial(int serial, Object[] values) {
        Object[] out = new Object[values.length + 1];
        out[0] = serial;
        System.arraycopy(values, 0, out, 1, values.length);
        return out;
    }

    /**
     * Default drive export name, built from the filters that apply to the chosen option:
     *   {Course | All Domains} - {College code} - {Drive date} [- Score x-y] [- Search term] [- Page n]
     * "All Students" ignores every filter, so it is only "All Domains - College code - Drive date".
     */
    public String defaultDriveFilename(DriveDetailResponse drive, String mode, Long courseId,
                                       Double scoreMin, Double scoreMax, String search, Integer currentPage) {
        boolean allStudents = "ALL_STUDENTS".equalsIgnoreCase(mode);
        boolean currentPageMode = "CURRENT_PAGE".equalsIgnoreCase(mode);
        String course = !allStudents && courseId != null
                ? courseRepository.findById(courseId).map(c -> c.getName()).orElse(null)
                : null;
        String collegeCode = drive.collegeId() == null ? drive.collegeName()
                : collegeRepository.findById(drive.collegeId()).map(c -> c.getCode()).orElse(drive.collegeName());

        List<String> parts = new ArrayList<>();
        parts.add(course == null ? ExportFileNames.ALL_DOMAINS : course);
        parts.add(collegeCode == null ? ExportFileNames.ALL_COLLEGES : collegeCode);
        parts.add(ExportFileNames.formatDate(drive.date()));
        if (!allStudents) {
            parts.add(ExportFileNames.scoreRange(scoreMin, scoreMax));
            parts.add(ExportFileNames.search(search));
        }
        if (currentPageMode && currentPage != null) parts.add("Page " + currentPage);
        return ExportFileNames.fromParts(parts);
    }

    /**
     * Default student-directory export name, built from the filters that apply:
     *   All Domains - {College code | All Colleges} - {Month-Year | Year | Month | today} [- Status] [- Search term]
     * "All students" ignores every filter. The student directory has no course filter,
     * so the course part is always "All Domains".
     */
    public String defaultStudentsFilename(String mode, Long collegeId, Long courseId, Integer year, Integer month,
                                          String testStatus, String search) {
        boolean filtered = "ALL_FILTERED".equalsIgnoreCase(mode);
        String collegeCode = filtered && collegeId != null
                ? collegeRepository.findById(collegeId).map(c -> c.getCode()).orElse(null)
                : null;
        String courseName = filtered && courseId != null
                ? courseRepository.findById(courseId).map(c -> c.getName()).orElse(null)
                : null;

        List<String> parts = new ArrayList<>();
        parts.add(courseName == null ? ExportFileNames.ALL_DOMAINS : courseName);
        parts.add(collegeCode == null ? ExportFileNames.ALL_COLLEGES : collegeCode);
        parts.add(filtered ? registrationPeriod(year, month) : ExportFileNames.formatDate(LocalDate.now()));
        if (filtered) {
            if ("REGISTERED".equalsIgnoreCase(testStatus)) parts.add("Not Written");
            else if ("TEST_WRITTEN".equalsIgnoreCase(testStatus)) parts.add("Test Written");
            parts.add(ExportFileNames.search(search));
        }
        return ExportFileNames.fromParts(parts);
    }

    /** Registration year/month filter as a name part: "Sep-2026", "2026", "Sep", or today's date when not set. */
    private static String registrationPeriod(Integer year, Integer month) {
        String monthName = month != null && month >= 1 && month <= 12
                ? java.time.Month.of(month).getDisplayName(java.time.format.TextStyle.SHORT, Locale.ENGLISH)
                : null;
        if (monthName != null && year != null) return monthName + "-" + year;
        if (year != null) return String.valueOf(year);
        if (monthName != null) return monthName;
        return ExportFileNames.formatDate(LocalDate.now());
    }

    private Object driveValue(String key, DriveStudentResponse r, Map<String, String> custom, Student st) {
        if (key.startsWith("CUSTOM:")) return custom.get(key.substring(7));
        return switch (key) {
            case "STUDENT_ID" -> r.studentId(); case "STUDENT_NAME" -> r.fullName(); case "EMAIL" -> r.email(); case "PHONE" -> r.phoneNumber(); case "GENDER" -> r.gender();
            case "COLLEGE" -> r.collegeName(); case "COURSE" -> r.courseName(); case "BRANCH" -> r.branch(); case "QUALIFICATION" -> r.highestQualification();
            case "ACADEMIC_SCORE" -> r.aggregateMarks(); case "SCORE_TYPE" -> "CGPA".equals(r.academicScoreType()) ? "CGPA" : "Percentage"; case "YEAR" -> r.yearOfPassing();
            case "CAMPUS_DRIVE" -> yesNo(r.selectedInCampusDrive()); case "EXAM_CODE" -> r.examCode();
            case "DOB" -> st == null ? null : day(st.getDob());
            case "REGISTRATION_DATE" -> st == null ? null : day(st.getRegistrationDate());
            case "TOTAL_SCORE" -> r.totalScore(); case "PERCENTAGE" -> r.scorePercent() == null ? null : Math.round(r.scorePercent() * 100.0) / 100.0;
            case "SUBMISSION_TYPE" -> r.submissionType(); case "SUBMISSION_TIME" -> r.submissionTime(); case "ATTEMPT_DURATION" -> r.attemptDurationSeconds(); case "TAB_SWITCHES" -> r.tabSwitchViolations();
            default -> null;
        };
    }
    private Object studentValue(String key, Student s, Map<String, String> custom) {
        if (key.startsWith("CUSTOM:")) return custom.get(key.substring(7));
        return switch (key) {
            case "STUDENT_ID" -> s.getId(); case "STUDENT_NAME" -> s.getFullName(); case "EMAIL" -> s.getEmail(); case "PHONE" -> s.getPhoneNumber(); case "GENDER" -> s.getGender();
            case "COLLEGE" -> s.getCollege() != null ? s.getCollege().getName() : null; case "COURSE" -> s.getCourse() != null ? s.getCourse().getName() : null; case "BRANCH" -> s.getBranch();
            case "QUALIFICATION" -> s.getHighestQualification(); case "ACADEMIC_SCORE" -> s.getAggregateMarks(); case "SCORE_TYPE" -> "CGPA".equals(s.getAcademicScoreType()) ? "CGPA" : "Percentage";
            case "YEAR" -> s.getYearOfPassing(); case "DOB" -> day(s.getDob()); case "REGISTRATION_DATE" -> day(s.getRegistrationDate());
            case "CAMPUS_DRIVE" -> yesNo(s.getSelectedInCampusDrive()); case "EXAM_CODE" -> s.getExamCode();
            case "TEST_STATUS" -> s.isExamSubmitted() ? "Test Submitted" : s.isExamStarted() ? "Test Started" : "Registered";
            case "TOTAL_SCORE" -> s.isExamSubmitted() ? s.getTotalScore() : null;
            default -> null;
        };
    }

    /** Dates as 12-May-2004; anything else as-is. */
    private static Object day(Object value) {
        if (value instanceof java.time.LocalDate d) return d.format(DAY);
        if (value instanceof java.time.LocalDateTime dt) return dt.toLocalDate().format(DAY);
        return value;
    }

    /** Stored "YES"/"NO" (any case) as Yes/No. */
    private static Object yesNo(String value) {
        if (value == null) return null;
        if ("YES".equalsIgnoreCase(value.strip()) || "TRUE".equalsIgnoreCase(value.strip())) return "Yes";
        if ("NO".equalsIgnoreCase(value.strip()) || "FALSE".equalsIgnoreCase(value.strip())) return "No";
        return value;
    }

}
