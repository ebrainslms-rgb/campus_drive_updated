package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.DriveDetailResponse;
import com.ecobrains.lms.dto.response.DriveStudentResponse;
import com.ecobrains.lms.util.ExcelWriter;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Excel generation for the Drive Details page. Three export modes (see
 * DriveService.exportForMode): Current Page, All Filtered Students, All
 * Students - the admin chooses one explicitly via the Export modal, none
 * is a default. Column set/order confirmed with the person: Score, Total
 * Questions, Answered, Percentage, then the student-identity columns from
 * their reference spreadsheet, in that exact order. No question text or
 * per-question answer columns are ever exported.
 */
@Service
public class ExcelExportService {

    private static final DateTimeFormatter FILENAME_DATE_FORMAT = DateTimeFormatter.ofPattern("dd-MMM-yyyy");

    private final DriveService driveService;

    public ExcelExportService(DriveService driveService) {
        this.driveService = driveService;
    }

    public byte[] exportDriveStudents(Long examId, String mode, Long courseId, Double scoreMin, Double scoreMax,
                                       String sortDir, int currentPage, int currentSize) {
        DriveDetailResponse drive = driveService.detail(examId);
        List<DriveStudentResponse> rows = driveService.exportForMode(
                examId, mode, courseId, scoreMin, scoreMax, sortDir, currentPage, currentSize);

        List<String> headers = List.of(
                "Score", "Total Questions", "Answered / Attempted Questions", "Percentage",
                "Student Name", "Email ID", "Phone Number", "College Name",
                "Domain / Branch", "Highest Qualification", "Overall Aggregate %",
                "Year of Passing", "Selected in Any Other Campus Drive?"
        );

        String sheetName = "Drive " + (drive.examCode() != null ? drive.examCode() : examId);
        if (sheetName.length() > 31) sheetName = sheetName.substring(0, 31); // Excel sheet-name limit

        return ExcelWriter.write(sheetName, headers, rows, r -> new Object[]{
                r.totalScore(),
                r.paperSize(),
                r.answeredCount(),
                r.scorePercent() != null ? Math.round(r.scorePercent() * 100.0) / 100.0 : null,
                r.fullName(),
                r.email(),
                r.phoneNumber(),
                r.collegeName(),
                r.branch(),
                r.highestQualification(),
                r.aggregateMarks(),
                r.yearOfPassing(),
                normaliseSelected(r.selectedInCampusDrive()),
        });
    }

    /** Dynamic, sanitized filename: {examCode} - {collegeName} - Campus
     *  Placement Drive - {examDate}.xlsx - strips characters that would
     *  break a filesystem/download (/ \ : * ? " < > |) rather than letting
     *  a college name with a slash or colon in it corrupt the download. */
    public String buildFilename(DriveDetailResponse drive) {
        String datePart = drive.date() != null ? drive.date().format(FILENAME_DATE_FORMAT) : "Unknown-Date";
        String raw = String.format("%s - %s - Campus Placement Drive - %s.xlsx",
                drive.examCode(), drive.collegeName(), datePart);
        return sanitizeFilename(raw);
    }

    private static String sanitizeFilename(String name) {
        return name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
    }

    private static String normaliseSelected(String raw) {
        return "YES".equalsIgnoreCase(raw) ? "YES" : "NO";
    }
}
