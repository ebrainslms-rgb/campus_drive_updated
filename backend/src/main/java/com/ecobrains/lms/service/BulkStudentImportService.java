package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.BulkStudentConfirmResponse;
import com.ecobrains.lms.dto.response.BulkStudentPreviewResponse;
import com.ecobrains.lms.dto.response.BulkStudentRowResponse;
import com.ecobrains.lms.entity.ActivityEventType;
import com.ecobrains.lms.entity.ActivityLog;
import com.ecobrains.lms.entity.College;
import com.ecobrains.lms.entity.Course;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.ActivityLogRepository;
import com.ecobrains.lms.repository.CollegeRepository;
import com.ecobrains.lms.repository.CourseRepository;
import com.ecobrains.lms.repository.StudentRepository;
import com.ecobrains.lms.util.ExcelWriter;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.Base64;
import java.util.regex.Pattern;

@Service
public class BulkStudentImportService {

    private static final Pattern EMAIL =
            Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private static final Set<String> YES_NO = Set.of("YES", "NO");

    private final StudentRepository studentRepository;
    private final CollegeRepository collegeRepository;
    private final CourseRepository courseRepository;
    private final ActivityLogRepository activityLogRepository;
    private final RegistrationSettingsService registrationSettingsService;

    public BulkStudentImportService(StudentRepository studentRepository,
                                    CollegeRepository collegeRepository,
                                    CourseRepository courseRepository,
                                    ActivityLogRepository activityLogRepository, RegistrationSettingsService registrationSettingsService) {
        this.studentRepository = studentRepository;
        this.collegeRepository = collegeRepository;
        this.courseRepository = courseRepository;
        this.activityLogRepository = activityLogRepository;
        this.registrationSettingsService = registrationSettingsService;
    }

    @Transactional(readOnly = true)
    public BulkStudentPreviewResponse preview(MultipartFile file) {

        List<ImportRow> rows = readRows(file);

        validateAgainstDatabase(rows);

        return buildPreview(rows);
    }

    @Transactional
    public BulkStudentConfirmResponse confirm(MultipartFile file, String adminIp) {

        List<ImportRow> rows = readRows(file);

        validateAgainstDatabase(rows);

        List<ImportRow> invalid = rows.stream()
                .filter(r -> !r.errors.isEmpty())
                .toList();

        if (!invalid.isEmpty()) {
            return new BulkStudentConfirmResponse(
                    rows.size(),
                    0,
                    0,
                    null,
                    null,
                    reportBase64(invalid)
            );
        }

        List<ImportRow> newRows = rows.stream()
                .filter(r -> "NEW".equals(r.status))
                .toList();

        List<ImportRow> existing = rows.stream()
                .filter(r -> "ALREADY_REGISTERED".equals(r.status))
                .toList();

        String existingDatabaseReport =
                existing.isEmpty()
                        ? null
                        : existingDatabaseReportBase64(existing);

        if (!newRows.isEmpty()) {

            List<Student> students = new ArrayList<>();

            for (ImportRow r : newRows) {
                students.add(toStudent(r));
            }

            try {

                studentRepository.saveAll(students);
                studentRepository.flush();

            } catch (org.springframework.dao.DataIntegrityViolationException ex) {

                // A registration could have happened between preview and confirmation.
                // Do not partially insert a batch.
                // Database unique constraints remain the final safety barrier.

                throw ApiException.conflict(
                        "The student data changed while this upload was being confirmed. Please upload the file again to revalidate it."
                );
            }

            for (Student s : students) {

                activityLogRepository.save(
                        ActivityLog.builder()
                                .student(s)
                                .college(s.getCollege())
                                .eventType(ActivityEventType.REGISTER)
                                .ipAddress(adminIp)
                                .build()
                );
            }
        }

        return new BulkStudentConfirmResponse(
                rows.size(),
                newRows.size(),
                existing.size(),
                existing.isEmpty() ? null : reportBase64(existing),
                existingDatabaseReport,
                null
        );
    }

    @Transactional(readOnly = true)
    public byte[] template(Long collegeId) {

        College college = collegeRepository.findById(collegeId)
                .filter(College::isActive)
                .orElseThrow(() ->
                        ApiException.badRequest(
                                "Selected college was not found or is inactive."
                        )
                );

        List<String> courseNames = courseRepository.findByActiveTrue()
                .stream()
                .map(Course::getName)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(name -> !name.isBlank())
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        return ExcelWriter.writeStudentBulkTemplate(
                college.getCode(),
                courseNames
        );
    }

    private Student toStudent(ImportRow r) {

        String scoreType = r.academicScoreType == null || r.academicScoreType.isBlank() ? null : r.academicScoreType.toUpperCase();

        College college = r.college;
        Course course = r.course;

        return Student.builder()
                .fullName(r.fullName)
                .email(r.email)
                .dob(r.dob)
                .gender(r.gender)
                .phoneNumber(r.phone)
                .college(college)

                // Location comes from the selected college.
                .location(r.location == null || r.location.isBlank() ? college.getLocation() : r.location)

                // State comes from the selected college.
                .state(
                        r.state == null || r.state.isBlank()
                                ? college.getState()
                                : r.state
                )

                .branch(r.branch)
                .highestQualification(r.qualification)
                .aggregateMarks(r.aggregateMarks)
                .academicScoreType(scoreType)
                .yearOfPassing(r.yearOfPassing)
                .course(course)
                .selectedInCampusDrive(r.selectedInCampusDrive)
                .registrationDate(LocalDateTime.now())
                .build();
    }

    private BulkStudentPreviewResponse buildPreview(List<ImportRow> rows) {

        int invalid = (int) rows.stream()
                .filter(r -> !r.errors.isEmpty())
                .count();

        int duplicate = (int) rows.stream()
                .filter(r -> r.fileDuplicate)
                .count();

        int conflicts = (int) rows.stream()
                .filter(r -> r.dbConflict)
                .count();

        int existing = (int) rows.stream()
                .filter(r -> "ALREADY_REGISTERED".equals(r.status))
                .count();

        int validNew = (int) rows.stream()
                .filter(r -> "NEW".equals(r.status))
                .count();

        boolean canConfirm =
                invalid == 0 &&
                duplicate == 0 &&
                conflicts == 0;

        List<BulkStudentRowResponse> out =
                rows.stream()
                        .map(this::toResponse)
                        .toList();

        List<ImportRow> failed =
                rows.stream()
                        .filter(r -> !r.errors.isEmpty())
                        .toList();

        return new BulkStudentPreviewResponse(
                rows.size(),
                validNew,
                existing,
                invalid,
                duplicate,
                conflicts,
                canConfirm,
                out,
                failed.isEmpty() ? null : reportBase64(failed)
        );
    }

    private BulkStudentRowResponse toResponse(ImportRow r) {

        String status =
                r.errors.isEmpty()
                        ? r.status
                        : "INVALID";

        return new BulkStudentRowResponse(
                r.rowNumber,
                r.fullName,
                r.email,
                r.phone,
                r.gender,
                status,
                String.join("; ", r.errors)
        );
    }

    private void validateAgainstDatabase(List<ImportRow> rows) {

        Set<String> emails = rows.stream()
                .map(r -> r.email)
                .filter(Objects::nonNull)
                .filter(s -> !s.isBlank())
                .collect(java.util.stream.Collectors.toSet());

        Set<String> phones = rows.stream()
                .map(r -> r.phone)
                .filter(Objects::nonNull)
                .filter(s -> !s.isBlank())
                .collect(java.util.stream.Collectors.toSet());

        Map<String, Student> byEmail = new HashMap<>();

        if (!emails.isEmpty()) {

            for (Student s :
                    studentRepository.findAllByEmails(emails)) {

                byEmail.put(
                        s.getEmail().toLowerCase(),
                        s
                );
            }
        }

        Map<String, Student> byPhone = new HashMap<>();

        if (!phones.isEmpty()) {

            for (Student s :
                    studentRepository.findAllByPhoneNumberIn(phones)) {

                byPhone.put(
                        s.getPhoneNumber(),
                        s
                );
            }
        }

        Map<String, List<ImportRow>> emailRows = new HashMap<>();
        Map<String, List<ImportRow>> phoneRows = new HashMap<>();

        for (ImportRow r : rows) {

            if (r.email != null && !r.email.isBlank()) {

                emailRows
                        .computeIfAbsent(r.email, k -> new ArrayList<>())
                        .add(r);
            }

            if (r.phone != null && !r.phone.isBlank()) {

                phoneRows
                        .computeIfAbsent(r.phone, k -> new ArrayList<>())
                        .add(r);
            }
        }

        for (ImportRow r : rows) {

            if (emailRows
                    .getOrDefault(r.email, List.of())
                    .size() > 1) {

                r.fileDuplicate = true;
                r.errors.add(
                        "Duplicate email in uploaded file"
                );
            }

            if (phoneRows
                    .getOrDefault(r.phone, List.of())
                    .size() > 1) {

                r.fileDuplicate = true;
                r.errors.add(
                        "Duplicate mobile number in uploaded file"
                );
            }

            if (!r.errors.isEmpty()) {

                r.status = "INVALID";
                continue;
            }

            Student emailMatch = byEmail.get(r.email);
            Student phoneMatch = byPhone.get(r.phone);

            if (emailMatch != null &&
                    phoneMatch != null &&
                    emailMatch.getId().equals(phoneMatch.getId())) {

                r.status = "ALREADY_REGISTERED";

            } else if (emailMatch != null ||
                    phoneMatch != null) {

                r.dbConflict = true;

                if (emailMatch != null &&
                        phoneMatch == null) {

                    r.errors.add(
                            "Email is already registered, but the uploaded mobile number is different"
                    );

                } else if (phoneMatch != null &&
                        emailMatch == null) {

                    r.errors.add(
                            "Mobile number is already registered, but the uploaded email is different"
                    );

                } else {

                    r.errors.add(
                            "Email and mobile number belong to different existing students"
                    );
                }

                r.status = "INVALID";

            } else {

                r.status = "NEW";
            }
        }
    }

    private List<ImportRow> readRows(MultipartFile file) {

        if (file == null || file.isEmpty()) {

            throw ApiException.badRequest(
                    "Please select an Excel or CSV file."
            );
        }

        String name =
                Optional.ofNullable(file.getOriginalFilename())
                        .orElse("")
                        .toLowerCase(Locale.ROOT);

        if (!name.endsWith(".xlsx") &&
                !name.endsWith(".csv")) {

            throw ApiException.badRequest(
                    "Only .xlsx and .csv student files are supported."
            );
        }

        try {

            List<RawRow> raw =
                    name.endsWith(".xlsx")
                            ? readXlsx(file.getInputStream())
                            : readCsv(file.getInputStream());

            if (raw.isEmpty()) {

                throw ApiException.badRequest(
                        "The uploaded file contains no student rows."
                );
            }

            if (raw.size() > 5000) {

                throw ApiException.badRequest(
                        "A single upload can contain at most 5,000 students."
                );
            }

            return validateRows(raw);

        } catch (IOException e) {

            throw ApiException.badRequest(
                    "Could not read the uploaded file: " + e.getMessage()
            );
        }
    }

    private List<RawRow> readCsv(InputStream in)
            throws IOException {

        List<RawRow> out = new ArrayList<>();

        try (
                InputStreamReader reader =
                        new InputStreamReader(
                                in,
                                StandardCharsets.UTF_8
                        );

                CSVParser parser =
                        CSVFormat.DEFAULT.builder()
                                .setHeader()
                                .setSkipHeaderRecord(true)
                                .setIgnoreSurroundingSpaces(true)
                                .setTrim(true)
                                .build()
                                .parse(reader)
        ) {

            Map<String, String> headers =
                    normaliseHeaders(
                            parser.getHeaderMap().keySet()
                    );

            int row = 1;

            for (CSVRecord r : parser) {

                row++;

                Map<String, String> values =
                        new HashMap<>();

                for (String key : headers.keySet()) {

                    values.put(
                            key,
                            getCsv(
                                    r,
                                    headers.get(key)
                            )
                    );
                }

                if (!isStudentDataEmpty(values)) {

                    out.add(
                            new RawRow(
                                    row,
                                    values
                            )
                    );
                }
            }
        }

        return out;
    }

    private String getCsv(
            CSVRecord r,
            String originalHeader
    ) {

        try {

            return r.isMapped(originalHeader)
                    ? r.get(originalHeader).trim()
                    : "";

        } catch (Exception e) {

            return "";
        }
    }

    private List<RawRow> readXlsx(InputStream in)
            throws IOException {

        List<RawRow> out = new ArrayList<>();

        try (Workbook wb = WorkbookFactory.create(in)) {

            Sheet sheet = wb.getSheetAt(0);

            if (sheet.getPhysicalNumberOfRows() < 2) {
                return out;
            }

            Row header =
                    sheet.getRow(
                            sheet.getFirstRowNum()
                    );

            Map<String, String> headers =
                    new HashMap<>();

            DataFormatter formatter =
                    new DataFormatter();

            for (
                    int c = 0;
                    c < header.getLastCellNum();
                    c++
            ) {

                String value =
                        formatter.formatCellValue(
                                header.getCell(c)
                        );

                headers.put(
                        normaliseHeader(value),
                        value
                );
            }

            for (
                    int r = header.getRowNum() + 1;
                    r <= sheet.getLastRowNum();
                    r++
            ) {

                Row row = sheet.getRow(r);

                if (row == null) {
                    continue;
                }

                Map<String, String> values =
                        new HashMap<>();

                for (
                        Map.Entry<String, String> h :
                        headers.entrySet()
                ) {

                    int col =
                            findHeaderColumn(
                                    header,
                                    h.getValue()
                            );

                    values.put(
                            h.getKey(),
                            col < 0
                                    ? ""
                                    : formatter
                                            .formatCellValue(
                                                    row.getCell(col)
                                            )
                                            .trim()
                    );
                }

                if (!isStudentDataEmpty(values)) {

                    out.add(
                            new RawRow(
                                    r + 1,
                                    values
                            )
                    );
                }
            }
        }

        return out;
    }

    /**
     * Template rows contain a pre-filled College Code.
     * A row with no other student data is an unused template row
     * and must not be treated as an invalid student during upload.
     */
    private boolean isStudentDataEmpty(
            Map<String, String> values
    ) {

        for (Map.Entry<String, String> entry :
                values.entrySet()) {

            if ("collegecode".equals(entry.getKey())) {
                continue;
            }

            if (entry.getValue() != null &&
                    !entry.getValue().isBlank()) {

                return false;
            }
        }

        return true;
    }

    private int findHeaderColumn(
            Row header,
            String value
    ) {

        DataFormatter formatter =
                new DataFormatter();

        for (
                int i = 0;
                i < header.getLastCellNum();
                i++
        ) {

            String current =
                    formatter.formatCellValue(
                            header.getCell(i)
                    );

            if (current.equals(value)) {
                return i;
            }
        }

        return -1;
    }

    private List<ImportRow> validateRows(
            List<RawRow> raw
    ) {

        List<College> colleges =
                collegeRepository
                        .findByActiveTrueOrderByNameAsc();

        List<Course> courses =
                courseRepository.findByActiveTrue();

        Map<String, College> collegeMap =
                new HashMap<>();

        Map<String, College> collegeCodeMap =
                new HashMap<>();

        for (College c : colleges) {

            collegeMap.put(
                    c.getName().trim().toLowerCase(),
                    c
            );

            collegeCodeMap.put(
                    c.getCode().trim().toLowerCase(),
                    c
            );
        }

        Map<String, Course> courseMap =
                new HashMap<>();

        for (Course c : courses) {

            courseMap.put(
                    c.getName().trim().toLowerCase(),
                    c
            );
        }

        List<ImportRow> rows =
                new ArrayList<>();

        for (RawRow rawRow : raw) {

            String fullName =
                    val(
                            rawRow.values,
                            "fullname",
                            "name",
                            "studentname"
                    );

            String email =
                    val(
                            rawRow.values,
                            "email",
                            "emailid",
                            "emailaddress"
                    )
                    .toLowerCase()
                    .trim();

            String phone =
                    digits(
                            val(
                                    rawRow.values,
                                    "phonenumber",
                                    "phone",
                                    "mobilenumber",
                                    "mobile"
                            )
                    );

            String gender =
                    val(
                            rawRow.values,
                            "gender"
                    );

            String dobText =
                    val(
                            rawRow.values,
                            "dob",
                            "dateofbirth"
                    );

            String collegeCode =
                    val(
                            rawRow.values,
                            "collegecode"
                    );

            String collegeName =
                    val(
                            rawRow.values,
                            "collegename",
                            "college"
                    );

            /*
             * Location and State are intentionally not taken
             * from the new template.
             *
             * They are populated automatically from College
             * after College Code is resolved below.
             */
            String location =
                    val(
                            rawRow.values,
                            "location",
                            "district"
                    );

            String state =
                    val(
                            rawRow.values,
                            "state"
                    );

            String branch =
                    val(
                            rawRow.values,
                            "branch",
                            "domainbranch"
                    );

            String qualification =
                    val(
                            rawRow.values,
                            "highestqualification",
                            "qualification"
                    );

            String scoreText =
                    val(
                            rawRow.values,
                            "academicscore",
                            "aggregatemarks",
                            "aggregate",
                            "percentage",
                            "cgpa"
                    );

            String scoreType =
                    val(
                            rawRow.values,
                            "scoretype",
                            "academicscoretype"
                    );

            String yearText =
                    val(
                            rawRow.values,
                            "yearofpassing",
                            "passingyear"
                    );

            String courseName =
                    val(
                            rawRow.values,
                            "course",
                            "coursename",
                            "domain"
                    );

            String selected =
                    val(
                            rawRow.values,
                            "selectedinanyothercampusdrive",
                            "selectedincampusdrive",
                            "othercampusdrive"
                    );

            ImportRow r =
                    new ImportRow(
                            rawRow.rowNumber
                    );

            r.fullName = fullName;
            r.email = email;
            r.phone = phone;
            r.gender = gender;
            r.collegeName = collegeName;

            r.location = location;
            r.state = state;

            r.branch = branch;
            r.qualification = qualification;
            r.courseName = courseName;
            r.selectedInCampusDrive =
                    selected.toUpperCase();

            r.academicScoreType =
                    scoreType.toUpperCase();

            required(
                    r,
                    fullName,
                    "Full name is required"
            );

            if (email.isBlank()) {

                r.errors.add(
                        "Email is required"
                );

            } else if (!EMAIL.matcher(email).matches()) {

                r.errors.add(
                        "Invalid email address"
                );
            }

            if (phone.isBlank()) {

                r.errors.add(
                        "Mobile number is required"
                );

            } else if (!phone.matches("\\d{10}")) {

                r.errors.add(
                        "Mobile number must be exactly 10 digits"
                );
            }

            var settings = registrationSettingsService.get();
            if(settings.isGenderEnabled()) required(r, gender, "Gender is required");
            if(settings.isDobEnabled()) required(r, dobText, "Date of birth is required");

            required(
                    r,
                    collegeCode.isBlank()
                            ? collegeName
                            : collegeCode,
                    "College is required"
            );

            required(
                    r,
                    branch,
                    "Branch is required"
            );

            if(settings.isQualificationEnabled()) required(r, qualification, "Highest qualification is required");
            if(settings.isAcademicScoreEnabled()) {
                required(r, scoreText, "Academic score is required");
                required(r, scoreType, "Score type is required");
            }
            if(settings.isYearEnabled()) required(r, yearText, "Year of passing is required");

            required(
                    r,
                    courseName,
                    "Course is required"
            );

            if(settings.isDobEnabled() && !dobText.isBlank()) { try { r.dob=parseDate(dobText); } catch(Exception e){ r.errors.add("Invalid date of birth; use yyyy-MM-dd or dd/MM/yyyy"); } }

            if(settings.isAcademicScoreEnabled() && !scoreText.isBlank()) { try { r.aggregateMarks=Double.parseDouble(scoreText); } catch(Exception e){ r.errors.add("Academic score must be a number"); } }

            if(settings.isYearEnabled() && !yearText.isBlank()) { try { r.yearOfPassing=Integer.parseInt(yearText); } catch(Exception e){ r.errors.add("Year of passing must be a number"); } }

            if(settings.isAcademicScoreEnabled() && !r.academicScoreType.equals("CGPA") && !r.academicScoreType.equals("PERCENTAGE")) { r.errors.add("Score type must be CGPA or PERCENTAGE"); }

            if (r.aggregateMarks != null) {

                double max =
                        r.academicScoreType.equals("CGPA")
                                ? 10
                                : 100;

                if (r.aggregateMarks < 0 ||
                        r.aggregateMarks > max) {

                    r.errors.add(
                            "Academic score is outside the allowed range"
                    );
                }
            }

            if(settings.isOtherCampusDriveEnabled() && !YES_NO.contains(r.selectedInCampusDrive)) { r.errors.add("Selected in Any Other Campus Drive must be Yes or No"); }
            if(!settings.isAcademicScoreEnabled()){ r.aggregateMarks=null; r.academicScoreType=""; }
            else if(settings.getAcademicScoreType().equals("PERCENTAGE") && !r.academicScoreType.equals("PERCENTAGE")){ r.errors.add("Score type must be Percentage according to current registration settings"); }
            else if(settings.getAcademicScoreType().equals("CGPA") && !r.academicScoreType.equals("CGPA")){ r.errors.add("Score type must be CGPA according to current registration settings"); }
            if(!settings.isGenderEnabled()) r.gender="";
            if(!settings.isDobEnabled()) r.dob=null;
            if(!settings.isQualificationEnabled()) r.qualification="";
            if(!settings.isYearEnabled()) r.yearOfPassing=null;
            if(!settings.isOtherCampusDriveEnabled()) r.selectedInCampusDrive="";

            if (r.yearOfPassing != null &&
                    (r.yearOfPassing < 1900 ||
                            r.yearOfPassing > 2100)) {

                r.errors.add(
                        "Invalid year of passing"
                );
            }

            /*
             * New template uses College Code.
             *
             * Once the College is found:
             * - College Name comes from College table
             * - Location comes from College table
             * - State comes from College table
             */
            if (!collegeCode.isBlank()) {

                r.college =
                        collegeCodeMap.get(
                                collegeCode.toLowerCase()
                        );

                if (r.college == null) {

                    r.errors.add(
                            "College code not found or inactive"
                    );

                } else {

                    r.collegeName =
                            r.college.getName();

                    r.location =
                            r.college.getLocation();

                    r.state =
                            r.college.getState();
                }

            } else {

                /*
                 * Keep support for old Excel files
                 * that contain College Name.
                 */
                r.college =
                        collegeMap.get(
                                collegeName.toLowerCase()
                        );

                if (!collegeName.isBlank() &&
                        r.college == null) {

                    r.errors.add(
                            "College not found or inactive"
                    );
                }
            }

            r.course =
                    courseMap.get(
                            courseName.toLowerCase()
                    );

            if (!courseName.isBlank() &&
                    r.course == null) {

                r.errors.add(
                        "Course not found or inactive"
                );
            }

            rows.add(r);
        }

        return rows;
    }

    private LocalDate parseDate(String text) {

        String t = text.trim();

        for (
                DateTimeFormatter f :
                List.of(
                        DateTimeFormatter.ISO_LOCAL_DATE,
                        DateTimeFormatter.ofPattern(
                                "dd/MM/yyyy"
                        ),
                        DateTimeFormatter.ofPattern(
                                "dd-MM-yyyy"
                        ),
                        DateTimeFormatter.ofPattern(
                                "MM/dd/yyyy"
                        )
                )
        ) {

            try {

                return LocalDate.parse(t, f);

            } catch (DateTimeParseException ignored) {
            }
        }

        throw new IllegalArgumentException();
    }

    private void required(
            ImportRow r,
            String value,
            String message
    ) {

        if (value == null ||
                value.isBlank()) {

            r.errors.add(message);
        }
    }

    private String val(
            Map<String, String> values,
            String... aliases
    ) {

        for (String alias : aliases) {

            String v =
                    values.get(
                            normaliseHeader(alias)
                    );

            if (v != null &&
                    !v.isBlank()) {

                return v.trim();
            }
        }

        return "";
    }

    private Map<String, String> normaliseHeaders(
            Collection<String> headers
    ) {

        Map<String, String> out =
                new HashMap<>();

        for (String h : headers) {

            out.put(
                    normaliseHeader(h),
                    h
            );
        }

        return out;
    }

    private String normaliseHeader(String s) {

        return s == null
                ? ""
                : s.replaceAll(
                        "[^A-Za-z0-9]",
                        ""
                ).toLowerCase(
                        Locale.ROOT
                );
    }

    private String digits(String s) {

        return s == null
                ? ""
                : s.replaceAll(
                        "\\D",
                        ""
                );
    }

    private List<String> templateHeaders() {

        return List.of(
                "Full Name",
                "Email ID",
                "Phone Number",
                "Gender",
                "Date of Birth",
                "College Code",
                "Branch",
                "Highest Qualification",
                "Academic Score",
                "Score Type",
                "Year of Passing",
                "Course",
                "Selected in Any Other Campus Drive"
        );
    }

    private String existingDatabaseReportBase64(
            List<ImportRow> rows
    ) {

        Set<String> emails =
                rows.stream()
                        .map(r -> r.email)
                        .filter(e ->
                                e != null &&
                                !e.isBlank()
                        )
                        .collect(
                                java.util.stream.Collectors.toSet()
                        );

        Set<String> phones =
                rows.stream()
                        .map(r -> r.phone)
                        .filter(e ->
                                e != null &&
                                !e.isBlank()
                        )
                        .collect(
                                java.util.stream.Collectors.toSet()
                        );

        Map<Long, Student> byId =
                new LinkedHashMap<>();

        for (
                Student s :
                studentRepository.findAllByEmails(
                        emails
                )
        ) {

            byId.put(
                    s.getId(),
                    s
            );
        }

        for (
                Student s :
                studentRepository.findAllByPhoneNumberIn(
                        phones
                )
        ) {

            byId.put(
                    s.getId(),
                    s
            );
        }

        List<Student> db =
                new ArrayList<>(
                        byId.values()
                );

        List<String> headers =
                List.of(
                        "Student ID",
                        "Student Name",
                        "Email ID",
                        "Phone Number",
                        "Gender",
                        "College Name",
                        "Course",
                        "Branch",
                        "Qualification",
                        "Academic Score",
                        "Score Type",
                        "Year of Passing",
                        "Registration Date"
                );

        byte[] bytes =
                ExcelWriter.write(
                        "Existing Students",
                        headers,
                        db,
                        s -> new Object[]{
                                s.getId(),
                                s.getFullName(),
                                s.getEmail(),
                                s.getPhoneNumber(),
                                s.getGender(),
                                s.getCollege() != null
                                        ? s.getCollege().getName()
                                        : null,
                                s.getCourse() != null
                                        ? s.getCourse().getName()
                                        : null,
                                s.getBranch(),
                                s.getHighestQualification(),
                                s.getAggregateMarks(),
                                s.getAcademicScoreType(),
                                s.getYearOfPassing(),
                                s.getRegistrationDate()
                        }
                );

        return Base64.getEncoder()
                .encodeToString(bytes);
    }

    private String reportBase64(
            List<ImportRow> rows
    ) {

        List<String> headers =
                new ArrayList<>(
                        templateHeaders()
                );

        headers.add("Status");
        headers.add("Error");

        byte[] bytes =
                ExcelWriter.write(
                        "Report",
                        headers,
                        rows,
                        r -> new Object[]{
                                r.fullName,
                                r.email,
                                r.phone,
                                r.gender,
                                r.dob,
                                r.collegeName,
                                r.branch,
                                r.qualification,
                                r.aggregateMarks,
                                r.academicScoreType,
                                r.yearOfPassing,
                                r.courseName,
                                r.selectedInCampusDrive,
                                r.status,
                                String.join(
                                        "; ",
                                        r.errors
                                )
                        }
                );

        return Base64.getEncoder()
                .encodeToString(bytes);
    }

    private static final class RawRow {

        final int rowNumber;
        final Map<String, String> values;

        RawRow(
                int rowNumber,
                Map<String, String> values
        ) {

            this.rowNumber = rowNumber;
            this.values = values;
        }
    }

    private static final class ImportRow {

        final int rowNumber;

        String fullName = "";
        String email = "";
        String phone = "";
        String gender = "";
        String collegeName = "";
        String location = "";
        String state = "";
        String branch = "";
        String qualification = "";
        String courseName = "";
        String selectedInCampusDrive = "";

        String academicScoreType = "";

        LocalDate dob;
        Double aggregateMarks;
        Integer yearOfPassing;

        College college;
        Course course;

        String status = "NEW";

        boolean fileDuplicate;
        boolean dbConflict;

        final List<String> errors =
                new ArrayList<>();

        ImportRow(int rowNumber) {
            this.rowNumber = rowNumber;
        }
    }
}