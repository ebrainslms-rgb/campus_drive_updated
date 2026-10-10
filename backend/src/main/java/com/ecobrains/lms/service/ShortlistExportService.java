package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.ShortlistExportRequest;
import com.ecobrains.lms.dto.response.DriveDetailResponse;
import com.ecobrains.lms.dto.response.DriveStudentResponse;
import com.ecobrains.lms.exception.ApiException;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.CellRangeAddressList;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Shortlist & Export: builds the interview feedback sheet for the students
 * the admin shortlisted on screen for ONE domain of ONE drive.
 *
 * Read-only: rows come from the existing Drive Details data path
 * (DriveService.exportRows), nothing is written to the database.
 * The requested student ids are only used to pick rows out of that
 * drive + domain + submitted list, so a student of another drive/domain,
 * or one who did not submit, can never end up in the sheet.
 */
@Service
public class ShortlistExportService {

    /** Kind of column: filled from the drive data, or left empty for the interview panel. */
    enum Kind { SERIAL, DATA, MANUAL, TOTAL }

    /**
     * Column definition. The sheet is built only from this list, so a new
     * column later is one more entry here (no change to the sheet code).
     */
    record Column(String key, String defaultHeader, Kind kind, int width,
                  Function<DriveStudentResponse, Object> value) {}

    private static final int MAX_HEADER_LENGTH = 60;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd-MM-yyyy");

    /** The 13 default columns, in the required order. */
    static final List<Column> COLUMNS = List.of(
            new Column("SL_NO", "Sl.No", Kind.SERIAL, 7, null),
            new Column("PANEL", "Panel", Kind.MANUAL, 12, null),
            new Column("NAME", "Name", Kind.DATA, 28, DriveStudentResponse::fullName),
            new Column("EMAIL", "Email-id", Kind.DATA, 32, DriveStudentResponse::email),
            new Column("PHONE", "Ph No", Kind.DATA, 14, DriveStudentResponse::phoneNumber),
            new Column("BRANCH", "Branch", Kind.DATA, 18, DriveStudentResponse::branch),
            new Column("ACADEMIC", "Academic Score", Kind.DATA, 15, ShortlistExportService::academicScore),
            new Column("SCORE", "Exam Score", Kind.DATA, 13, DriveStudentResponse::totalScore),
            new Column("TECHNICAL", "Technical Knowledge (10 Marks)", Kind.MANUAL, 18, null),
            new Column("PRESENTATION", "Presentation / Communication Skills (10 Marks)", Kind.MANUAL, 22, null),
            new Column("TOTAL", "Total (20 Marks)", Kind.TOTAL, 12, null),
            new Column("TECH_REVIEW", "Technical Review", Kind.MANUAL, 26, null),
            new Column("HR", "HR", Kind.MANUAL, 20, null)
    );

    private final DriveService driveService;

    public ShortlistExportService(DriveService driveService) {
        this.driveService = driveService;
    }

    /** Result of one export: file bytes and download name. */
    public record Result(byte[] bytes, String filename) {}

    public Result export(Long examId, ShortlistExportRequest req) {
        if (req == null || req.courseId() == null) {
            throw ApiException.badRequest("Please select a domain.");
        }
        if (req.studentIds() == null || req.studentIds().isEmpty()) {
            throw ApiException.badRequest("No students are shortlisted.");
        }
        DriveDetailResponse drive = driveService.detail(examId);

        // Only students of THIS drive + THIS domain who submitted the test.
        Set<Long> wanted = new HashSet<>(req.studentIds());
        List<DriveStudentResponse> rows = driveService
                .exportRows(examId, req.courseId(), null, null, null, "SUBMITTED", null, "desc")
                .stream()
                .filter(r -> r.submitted() && wanted.contains(r.studentId()))
                .sorted(Comparator.comparing((DriveStudentResponse r) -> safe(r.fullName()), String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(DriveStudentResponse::studentId))
                .collect(Collectors.toList());
        if (rows.isEmpty()) {
            throw ApiException.badRequest("None of the shortlisted students belong to this drive and domain.");
        }

        String domain = rows.get(0).courseName();
        Map<String, String> headers = headers(req.headers(), rows);
        byte[] bytes = build(rows, headers, drive, domain);
        return new Result(bytes, filename(domain, drive.date()));
    }

    /* ------------------------------------------------------------------ */
    /* Headers / values                                                    */
    /* ------------------------------------------------------------------ */

    /** Final header text per column: renamed text for the empty columns, defaults elsewhere. */
    private Map<String, String> headers(Map<String, String> requested, List<DriveStudentResponse> rows) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Column c : COLUMNS) {
            String h = c.defaultHeader();
            if ((c.kind() == Kind.MANUAL || c.kind() == Kind.TOTAL) && requested != null) {
                String r = requested.get(c.key());
                if (r != null) {
                    String cleaned = r.replaceAll("\\p{Cntrl}", " ").replaceAll("\\s+", " ").strip();
                    if (cleaned.length() > MAX_HEADER_LENGTH) cleaned = cleaned.substring(0, MAX_HEADER_LENGTH).strip();
                    if (!cleaned.isEmpty()) h = cleaned;
                }
            }
            if ("SCORE".equals(c.key())) {
                Integer paper = paperSize(rows);
                if (paper != null) h = "Exam Score /" + paper;
            }
            out.put(c.key(), h);
        }
        return out;
    }

    /** Most common paper size (questions per student) in the domain; null when unknown. */
    static Integer paperSize(List<DriveStudentResponse> rows) {
        return rows.stream()
                .map(DriveStudentResponse::paperSize)
                .filter(p -> p != null && p > 0)
                .collect(Collectors.groupingBy(p -> p, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.<Integer, Long>comparingByValue().thenComparing(Map.Entry.<Integer, Long>comparingByKey()))
                .map(Map.Entry::getKey)
                .orElse(null);
    }

    /** "8.2 CGPA" / "78%"; blank when the student has no academic score. */
    static String academicScore(DriveStudentResponse r) {
        if (r.aggregateMarks() == null) return "";
        String v = number(r.aggregateMarks());
        return "CGPA".equalsIgnoreCase(r.academicScoreType()) ? v + " CGPA" : v + "%";
    }

    private static String number(double v) {
        if (v == Math.rint(v)) return String.valueOf((long) v);
        return java.math.BigDecimal.valueOf(v).stripTrailingZeros().toPlainString();
    }

    /** "Java_Feedback_Sheet_05-10-2026.xlsx" - letters/digits only, joined by underscores. */
    static String filename(String domain, LocalDate date) {
        String d = domain == null ? "" : domain.replaceAll("[^\\p{L}\\p{N}]+", "_").replaceAll("^_+|_+$", "");
        if (d.isEmpty()) d = "Domain";
        if (d.length() > 80) d = d.substring(0, 80).replaceAll("_+$", "");
        return d + "_Feedback_Sheet_" + (date == null ? LocalDate.now() : date).format(DATE) + ".xlsx";
    }

    private static String safe(String s) {
        return s == null ? "" : s.strip();
    }

    /* ------------------------------------------------------------------ */
    /* Workbook                                                            */
    /* ------------------------------------------------------------------ */

    private byte[] build(List<DriveStudentResponse> rows, Map<String, String> headers,
                         DriveDetailResponse drive, String domain) {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet(WorkbookUtil.createSafeSheetName(
                    domain == null || domain.isBlank() ? "Feedback Sheet" : domain.strip()));
            int lastCol = COLUMNS.size() - 1;

            // Title block
            CellStyle brand = titleStyle(wb, (short) 16);
            CellStyle college = titleStyle(wb, (short) 12);
            CellStyle dateStyle = titleStyle(wb, (short) 11);
            titleRow(sheet, 0, "ECHO BRAINS", brand, lastCol, 24);
            titleRow(sheet, 1, drive.collegeName() == null ? "" : drive.collegeName(), college, lastCol, 18);
            titleRow(sheet, 2, "Drive Date: " + (drive.date() == null ? "" : drive.date().format(DATE)), dateStyle, lastCol, 16);

            // Header row (row 5 in Excel)
            int headerRowIdx = 4;
            CellStyle header = headerStyle(wb);
            Row hr = sheet.createRow(headerRowIdx);
            hr.setHeightInPoints(36);
            for (int i = 0; i < COLUMNS.size(); i++) {
                Cell c = hr.createCell(i);
                c.setCellValue(headers.get(COLUMNS.get(i).key()));
                c.setCellStyle(header);
                sheet.setColumnWidth(i, COLUMNS.get(i).width() * 256);
            }

            // Data rows
            CellStyle text = bodyStyle(wb, HorizontalAlignment.LEFT, null);
            CellStyle center = bodyStyle(wb, HorizontalAlignment.CENTER, null);
            CellStyle integer = bodyStyle(wb, HorizontalAlignment.CENTER, "0");
            CellStyle mark = bodyStyle(wb, HorizontalAlignment.CENTER, null);
            int techCol = indexOf("TECHNICAL");
            int presCol = indexOf("PRESENTATION");
            int r = headerRowIdx + 1;
            int serial = 1;
            for (DriveStudentResponse row : rows) {
                Row xr = sheet.createRow(r);
                xr.setHeightInPoints(20);
                for (int i = 0; i < COLUMNS.size(); i++) {
                    Column col = COLUMNS.get(i);
                    Cell c = xr.createCell(i);
                    switch (col.kind()) {
                        case SERIAL -> { c.setCellValue(serial); c.setCellStyle(integer); }
                        case MANUAL -> c.setCellStyle(i == techCol || i == presCol ? mark : (col.key().equals("PANEL") ? center : text));
                        case TOTAL -> {
                            String t = CellReference.convertNumToColString(techCol) + (r + 1);
                            String p = CellReference.convertNumToColString(presCol) + (r + 1);
                            c.setCellFormula("IF(AND(" + t + "=\"\"," + p + "=\"\"),\"\"," + "N(" + t + ")+N(" + p + "))");
                            c.setCellStyle(mark);
                        }
                        case DATA -> {
                            Object v = col.value().apply(row);
                            if (v instanceof Number n) { c.setCellValue(n.doubleValue()); c.setCellStyle(integer); }
                            else {
                                c.setCellValue(v == null ? "" : v.toString());
                                c.setCellStyle(col.key().equals("ACADEMIC") || col.key().equals("PHONE") ? center : text);
                            }
                        }
                    }
                }
                r++;
                serial++;
            }
            int lastDataRow = r - 1;

            // Interview marks: 0-10 only (Total can then never exceed 20).
            DataValidationHelper dv = sheet.getDataValidationHelper();
            for (int col : new int[]{techCol, presCol}) {
                DataValidationConstraint cons = dv.createDecimalConstraint(
                        DataValidationConstraint.OperatorType.BETWEEN, "0", "10");
                DataValidation v = dv.createValidation(cons,
                        new CellRangeAddressList(headerRowIdx + 1, lastDataRow, col, col));
                v.setShowErrorBox(true);
                v.createErrorBox("Invalid marks", "Enter marks between 0 and 10.");
                v.setEmptyCellAllowed(true);
                sheet.addValidationData(v);
            }

            sheet.createFreezePane(0, headerRowIdx + 1);
            sheet.setAutoFilter(new CellRangeAddress(headerRowIdx, lastDataRow, 0, lastCol));

            PrintSetup ps = sheet.getPrintSetup();
            ps.setLandscape(true);
            ps.setFitWidth((short) 1);
            ps.setFitHeight((short) 0);
            sheet.setFitToPage(true);
            sheet.setRepeatingRows(new CellRangeAddress(headerRowIdx, headerRowIdx, -1, -1));

            wb.setForceFormulaRecalculation(true);
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not build the feedback sheet.", e);
        }
    }

    private static int indexOf(String key) {
        for (int i = 0; i < COLUMNS.size(); i++) if (COLUMNS.get(i).key().equals(key)) return i;
        throw new IllegalStateException("Unknown column " + key);
    }

    private static void titleRow(Sheet sheet, int idx, String text, CellStyle style, int lastCol, float height) {
        Row row = sheet.createRow(idx);
        row.setHeightInPoints(height);
        Cell c = row.createCell(0);
        c.setCellValue(text);
        c.setCellStyle(style);
        sheet.addMergedRegion(new CellRangeAddress(idx, idx, 0, lastCol));
    }

    private static CellStyle titleStyle(Workbook wb, short size) {
        Font f = wb.createFont();
        f.setBold(true);
        f.setFontHeightInPoints(size);
        CellStyle s = wb.createCellStyle();
        s.setFont(f);
        s.setAlignment(HorizontalAlignment.CENTER);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        return s;
    }

    private static CellStyle headerStyle(Workbook wb) {
        Font f = wb.createFont();
        f.setBold(true);
        f.setFontHeightInPoints((short) 11);
        CellStyle s = wb.createCellStyle();
        s.setFont(f);
        s.setAlignment(HorizontalAlignment.CENTER);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        s.setWrapText(true);
        s.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        s.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        border(s);
        return s;
    }

    private static CellStyle bodyStyle(Workbook wb, HorizontalAlignment align, String format) {
        CellStyle s = wb.createCellStyle();
        s.setAlignment(align);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        if (format != null) s.setDataFormat(wb.createDataFormat().getFormat(format));
        border(s);
        return s;
    }

    private static void border(CellStyle s) {
        s.setBorderTop(BorderStyle.THIN);
        s.setBorderBottom(BorderStyle.THIN);
        s.setBorderLeft(BorderStyle.THIN);
        s.setBorderRight(BorderStyle.THIN);
    }
}
