package com.ecobrains.lms.util;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.function.Function;

/**
 * Thin wrapper around POI's streaming (SXSSF) workbook - keeps memory bounded
 * even for larger filtered result sets by flushing rows to disk as they're
 * written, rather than holding the whole sheet in memory (the default XSSFWorkbook).
 */
public final class ExcelWriter {

    private ExcelWriter() {}

    public static <T> byte[] write(String sheetName, List<String> headers, List<T> rows,
                                    Function<T, Object[]> rowMapper) {
        try (SXSSFWorkbook workbook = new SXSSFWorkbook(100)) { // keep 100 rows in memory at a time
            SXSSFSheet sheet = workbook.createSheet(sheetName);

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);

            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.size(); i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers.get(i));
                cell.setCellStyle(headerStyle);
            }

            int rowIdx = 1;
            for (T item : rows) {
                Row row = sheet.createRow(rowIdx++);
                Object[] values = rowMapper.apply(item);
                for (int i = 0; i < values.length; i++) {
                    setCellValue(row.createCell(i), values[i]);
                }
            }

            for (int i = 0; i < headers.size(); i++) {
                sheet.trackColumnForAutoSizing(i);
                sheet.autoSizeColumn(i);
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            workbook.dispose(); // clean up temp files backing the streaming workbook
            return out.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException("Failed to generate Excel export.", e);
        }
    }

    private static void setCellValue(Cell cell, Object value) {
        if (value == null) {
            cell.setBlank();
        } else if (value instanceof Number n) {
            cell.setCellValue(n.doubleValue());
        } else if (value instanceof Boolean b) {
            cell.setCellValue(b);
        } else {
            cell.setCellValue(value.toString());
        }
    }

    /**
     * Creates the student bulk-registration template with backend-controlled
     * Excel validation lists. This intentionally uses XSSFWorkbook because
     * data-validation rules need random access to the workbook.
     */
    public static byte[] writeStudentBulkTemplate(String collegeCode, List<String> courseNames) {
    try (Workbook workbook = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {

        Sheet sheet = workbook.createSheet("Students");
        Sheet lists = workbook.createSheet("ValidationLists");

        List<String> headers = List.of(
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

        Row header = sheet.createRow(0);

        CellStyle headerStyle = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        headerStyle.setFont(font);

        for (int i = 0; i < headers.size(); i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(headers.get(i));
            cell.setCellStyle(headerStyle);
        }

        // ---------------------------------------------------------
        // 10 starter rows
        // College Code is automatically filled for all 10 rows.
        // ---------------------------------------------------------
        for (int r = 1; r <= 10; r++) {
            Row row = sheet.createRow(r);

            // College Code
            row.createCell(5).setCellValue(collegeCode);
        }

        // ---------------------------------------------------------
        // One sample Date of Birth
        // Only first row contains a sample date.
        // Admin can replace/delete it.
        // ---------------------------------------------------------
        sheet.getRow(1).createCell(4).setCellValue("15/06/2002");

        // ---------------------------------------------------------
        // Backend-controlled Excel dropdown lists
        // ---------------------------------------------------------
        lists.createRow(0).createCell(0).setCellValue("Score Type");
        lists.getRow(0).createCell(1).setCellValue("Courses");

        String[] scoreTypes = {
                "PERCENTAGE",
                "CGPA"
        };

        // Score Type dropdown values
        for (int i = 0; i < scoreTypes.length; i++) {
            lists.createRow(i + 1)
                    .createCell(0)
                    .setCellValue(scoreTypes[i]);
        }

        // Active Course dropdown values
        for (int i = 0; i < courseNames.size(); i++) {

            Row row = lists.getRow(i + 1);

            if (row == null) {
                row = lists.createRow(i + 1);
            }

            row.createCell(1)
                    .setCellValue(courseNames.get(i));
        }

        lists.protectSheet("template-lists");

        // Score Type range
        createNamedRange(
                workbook,
                "ScoreTypes",
                "ValidationLists",
                "$A$2:$A$3"
        );

        // Course range
        if (!courseNames.isEmpty()) {

            createNamedRange(
                    workbook,
                    "Courses",
                    "ValidationLists",
                    "$B$2:$B$" + (courseNames.size() + 1)
            );
        }

        org.apache.poi.ss.usermodel.DataValidationHelper helper =
                sheet.getDataValidationHelper();

        // ---------------------------------------------------------
        // Score Type dropdown
        // Column J = index 9
        // ---------------------------------------------------------
        addListValidation(
                sheet,
                helper,
                "ScoreTypes",
                9,
                "Score Type"
        );

        // ---------------------------------------------------------
        // Course dropdown
        // Column L = index 11
        // ---------------------------------------------------------
        if (!courseNames.isEmpty()) {

            addListValidation(
                    sheet,
                    helper,
                    "Courses",
                    11,
                    "Courses"
            );
        }

        // ---------------------------------------------------------
        // Protect the automatically generated College Code
        // for the first 10 rows only.
        // ---------------------------------------------------------
        CellStyle lockedStyle = workbook.createCellStyle();
        lockedStyle.setLocked(true);

        for (int r = 1; r <= 10; r++) {

            sheet.getRow(r)
                    .getCell(5)
                    .setCellStyle(lockedStyle);
        }

        // ---------------------------------------------------------
        // Column widths
        // No autoSizeColumn because this runs on Linux server.
        // ---------------------------------------------------------
        int[] widths = {
                24, // Full Name
                30, // Email
                16, // Phone
                12, // Gender
                16, // DOB
                18, // College Code
                24, // Branch
                22, // Qualification
                16, // Academic Score
                16, // Score Type
                18, // Year
                28, // Course
                30  // Other Campus Drive
        };

        for (int i = 0; i < widths.length; i++) {
            sheet.setColumnWidth(i, widths[i] * 256);
        }

        lists.setColumnWidth(0, 18 * 256);
        lists.setColumnWidth(1, 30 * 256);

        lists.setColumnHidden(0, true);
        lists.setColumnHidden(1, true);

        workbook.setSheetVisibility(
                workbook.getSheetIndex(lists),
                org.apache.poi.ss.usermodel.SheetVisibility.VERY_HIDDEN
        );

        java.io.ByteArrayOutputStream out =
                new java.io.ByteArrayOutputStream();

        workbook.write(out);

        return out.toByteArray();

    } catch (IOException e) {

        throw new RuntimeException(
                "Failed to generate student bulk template.",
                e
        );
    }
}

    private static void createNamedRange(Workbook workbook, String name, String sheetName, String range) {
        Name namedRange = workbook.createName();
        namedRange.setNameName(name);
        namedRange.setRefersToFormula("'" + sheetName + "'!" + range);
    }

    private static void addListValidation(
            Sheet sheet,
            org.apache.poi.ss.usermodel.DataValidationHelper helper,
            String namedRange,
            int columnIndex,
            String title) {
        org.apache.poi.ss.util.CellRangeAddressList regions =
                new org.apache.poi.ss.util.CellRangeAddressList(1, 1000, columnIndex, columnIndex);
        org.apache.poi.ss.usermodel.DataValidationConstraint constraint =
                helper.createFormulaListConstraint(namedRange);
        org.apache.poi.ss.usermodel.DataValidation validation =
                helper.createValidation(constraint, regions);
        validation.setShowErrorBox(true);
        validation.setErrorStyle(org.apache.poi.ss.usermodel.DataValidation.ErrorStyle.STOP);
        validation.createErrorBox("Invalid " + title, "Please choose a value from the dropdown.");
        validation.setShowPromptBox(true);
        validation.createPromptBox(title, "Choose a value from the available options.");
        sheet.addValidationData(validation);
    }

}
