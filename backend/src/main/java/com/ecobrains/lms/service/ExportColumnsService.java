package com.ecobrains.lms.service;

import com.ecobrains.lms.entity.RegistrationField;
import com.ecobrains.lms.entity.RegistrationSettings;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.RegistrationFieldRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Which columns each export can contain, and the default columns used when
 * the person exporting picks none. Students and Drive exports are completely
 * separate. "S.No" is not part of this list: it is always added as column A.
 */
@Service
public class ExportColumnsService {

    public enum ExportType {
        STUDENTS, DRIVE;

        public static ExportType parse(String value) {
            if (value == null) throw ApiException.badRequest("Export type is required.");
            try {
                return ExportType.valueOf(value.strip().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("Unknown export type: " + value);
            }
        }
    }

    /** Registration details: shared by both exports (registration-form fields). */
    private static final LinkedHashMap<String, String> REGISTRATION = new LinkedHashMap<>();
    /** Student directory: registration details + test status. */
    private static final LinkedHashMap<String, String> STUDENT_FIELDS = new LinkedHashMap<>();
    /** Drive export: registration details + results. */
    private static final LinkedHashMap<String, String> DRIVE_FIELDS = new LinkedHashMap<>();

    static {
        REGISTRATION.put("STUDENT_NAME", "Student Name");
        REGISTRATION.put("EMAIL", "Email ID");
        REGISTRATION.put("PHONE", "Mobile Number");
        REGISTRATION.put("COLLEGE", "College Name");
        REGISTRATION.put("COURSE", "Course");
        REGISTRATION.put("BRANCH", "Branch");
        REGISTRATION.put("GENDER", "Gender");
        REGISTRATION.put("DOB", "Date of Birth");
        REGISTRATION.put("QUALIFICATION", "Highest Qualification");
        REGISTRATION.put("YEAR", "Year of Passing");
        REGISTRATION.put("ACADEMIC_SCORE", "Academic Score");
        REGISTRATION.put("SCORE_TYPE", "Academic Score Type");
        REGISTRATION.put("CAMPUS_DRIVE", "Selected in Other Campus Drive");
        REGISTRATION.put("REGISTRATION_DATE", "Registration Date");
        REGISTRATION.put("STUDENT_ID", "Student ID");
        REGISTRATION.put("EXAM_CODE", "Exam Code");

        STUDENT_FIELDS.putAll(REGISTRATION);
        STUDENT_FIELDS.put("TEST_STATUS", "Test Status");
        STUDENT_FIELDS.put("TOTAL_SCORE", "Total Score");

        DRIVE_FIELDS.putAll(REGISTRATION);
        DRIVE_FIELDS.put("TOTAL_SCORE", "Total Score");
        DRIVE_FIELDS.put("PERCENTAGE", "Score Percentage");
        DRIVE_FIELDS.put("SUBMISSION_TYPE", "Submission Type");
        DRIVE_FIELDS.put("SUBMISSION_TIME", "Submission Time");
        DRIVE_FIELDS.put("ATTEMPT_DURATION", "Attempt Duration (Seconds)");
        DRIVE_FIELDS.put("TAB_SWITCHES", "Tab Switch Violations");
    }

    private final RegistrationFieldRepository fields;
    private final RegistrationSettingsService registrationSettings;

    public ExportColumnsService(RegistrationFieldRepository fields, RegistrationSettingsService registrationSettings) {
        this.fields = fields;
        this.registrationSettings = registrationSettings;
    }

    /**
     * Every column this export can contain: key -> label. Registration fields
     * added by the admin appear automatically as "CUSTOM:key"; deleted ones
     * disappear automatically.
     */
    @Transactional(readOnly = true)
    public LinkedHashMap<String, String> catalog(ExportType type) {
        LinkedHashMap<String, String> out = new LinkedHashMap<>(type == ExportType.DRIVE ? DRIVE_FIELDS : STUDENT_FIELDS);
        for (RegistrationField f : fields.findAllByOrderBySortOrderAscIdAsc()) {
            out.put("CUSTOM:" + f.getFieldKey(), f.getLabel());
        }
        return out;
    }

    /**
     * Default columns (when nothing is selected): the important details plus
     * every field currently switched ON in the registration form.
     * College / Course are left out when a filter already fixes them.
     */
    @Transactional
    public List<String> defaults(ExportType type, boolean courseFiltered, boolean collegeFiltered) {
        RegistrationSettings settings = registrationSettings.get();
        List<String> cols = new ArrayList<>();
        cols.add("STUDENT_NAME");
        cols.add("EMAIL");
        cols.add("PHONE");
        if (!collegeFiltered) cols.add("COLLEGE");
        if (!courseFiltered) cols.add("COURSE");
        cols.add("BRANCH");
        if (settings.isGenderEnabled()) cols.add("GENDER");
        if (settings.isDobEnabled()) cols.add("DOB");
        if (settings.isQualificationEnabled()) cols.add("QUALIFICATION");
        if (settings.isYearEnabled()) cols.add("YEAR");
        if (settings.isAcademicScoreEnabled()) {
            cols.add("ACADEMIC_SCORE");
            cols.add("SCORE_TYPE");
        }
        cols.add("CAMPUS_DRIVE");
        for (RegistrationField f : fields.findAllByEnabledTrueOrderBySortOrderAscIdAsc()) {
            cols.add("CUSTOM:" + f.getFieldKey());
        }
        cols.add("TOTAL_SCORE");
        return cols;
    }

    /**
     * The columns to export: the requested keys in the requested order
     * (unknown or deleted fields are skipped); the defaults when none remain.
     */
    @Transactional
    public List<String> resolve(ExportType type, List<String> requested, boolean courseFiltered, boolean collegeFiltered) {
        Map<String, String> catalog = catalog(type);
        List<String> cols = requested == null ? List.of() : requested.stream()
                .filter(Objects::nonNull)
                .map(String::strip)
                .filter(catalog::containsKey)
                .distinct()
                .toList();
        return cols.isEmpty() ? defaults(type, courseFiltered, collegeFiltered) : cols;
    }

    /** "a,b,c" -> [a, b, c] (empty list for null/blank). */
    public static List<String> split(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(",")).map(String::strip).filter(s -> !s.isEmpty()).toList();
    }
}
